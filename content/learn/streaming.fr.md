+++
title = "Streaming et texte en temps réel"
description = "Création d’interfaces de chat, de visionneuses de journaux et de tableaux de bord en direct : fusion de blocs par trame, API d’ajout, interaction avec le bridage inactif et stratégie pour les longs transcriptions."
weight = 18
+++

# Streaming et texte en temps réel

Les flux de jetons (chat LLM), les fins de journaux (log tails) et les flux de données en direct sont les cas où le code VectoJS naïf échoue le plus souvent. Le moteur vous offre des primitives rapides — `Text.append()`, `Markdown.appendMarkdown()`, mémorisation de la mise en page au niveau des paragraphes, analyse Markdown hors du thread principal — mais les câbler jeton par jeton plutôt que par trame (frame) gaspille la plupart de ces avantages. Cette page fournit la recette complète de bout en bout.

## La règle d'or : valider par trame, pas par jeton

Un flux livre les jetons beaucoup plus rapidement que l'affichage ne se rafraîchit. Chaque appel direct à `appendMarkdown()` peut déclencher une passe d'analyse/mise en page, et chaque passe entre deux trames rendues, sauf la dernière, est **un travail invisible**. Utilisez le `StreamController` intégré plutôt que de concevoir un deuxième planificateur :

```typescript
const stream = markdown.createStream();

try {
  for await (const token of llmStream) {
    await stream.write(token);
  }
  await stream.close(); // force la validation finale ; n'attendez pas une autre trame
} catch (error) {
  stream.abort(error); // ignore le texte accepté mais non validé
  throw error;
}
```

Le mode par défaut conserve les morceaux acceptés sous forme de chaînes distinctes, puis les fusionne et les valide au plus une fois lors de la trame d'animation suivante. `write()` se résout lorsqu'un morceau entre dans le tampon limité, et non lorsqu'il devient visible, de sorte qu'un producteur asynchrone peut toujours fournir plusieurs jetons à la même trame. Utilisez `await` : une fois que le tampon de 64 Kio est plein, une écriture attendra qu'il y ait de la capacité et toute écriture supplémentaire sera rejetée (reject) au lieu de créer une file d'attente illimitée.

Avec un flux de 200 jetons/s fonctionnant à 60 fps, cela réduit jusqu'à environ 200 passes de mise en page par seconde à au plus 60. Sous charge, cela se dégrade gracieusement : plus le thread principal est occupé, plus les morceaux validés deviennent importants (et _rares_). Un debounce fixe via `setInterval` fait exactement l'inverse.

`appendMarkdown()` reste la solution de secours synchrone. Un appel direct vide d'abord tout le texte du contrôleur précédemment soumis (y compris une écriture sous pression de retour), puis ajoute son propre morceau, de sorte que l'ordre des appels reste exact.

> [!NOTE]
> `scene.markDirty()` fusionne déjà naturellement — trois ajouts dans une même trame définissent un drapeau et coûtent un seul redessin. La partie coûteuse est l'analyse/la mise en page, c'est pourquoi le traitement par lots (batching) doit envelopper `appendMarkdown()` lui-même. `createStream()` fait précisément cela ; il ne crée pas d'autre analyseur ni de chemin de réconciliation.

## Choix de l'API d'ajout

| Contenu                  | API                                                | Coût par validation                                                                     |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Texte brut               | `text.append(chunk)`                               | Passe à froid, mais le mémo de paragraphe réutilise tout paragraphe terminé par `\n`    |
| Spans stylisés           | `richText.appendSpans(spans)`                      | Ajoute des spans ; les mesures des spans précédents sont réutilisées                    |
| Markdown, direct         | `markdown.appendMarkdown(chunk)`                   | API synchrone ; une validation d'ajout par appel                                        |
| Markdown, en flux        | `await stream.write(chunk)` après `createStream()` | Au plus une validation d'ajout par trame d'animation ; pression de retour limitée       |
| N'importe quoi, remplacé | `setText` / `setContent` (anti-modèle de flux)     | Reconstruction complète — ne jamais appeler sur un document grandissant jeton par jeton |

Deux coûts se cachent à l'intérieur de `appendMarkdown` que vous devez connaître :

1. **L'analyse lexicale est incrémentale, indexée sur la queue instable.** Depuis 0.8.1, le chemin worker refait l'analyse lexicale depuis la dernière limite de bloc stable (`lexAppend`) au lieu de re-tokeniser l'ensemble de la source accumulée, donc le coût par morceau suit la queue modifiée, pas la taille du document. Seuls les documents qui utilisent des blocs de définition de liens ou du math `$$` en début de ligne retombent sur une analyse lexicale de tout le document (`lexFull`). L'analyse s'exécute dans un Worker en arrière-plan lorsqu'il est disponible (avec un repli sur l'analyse synchrone dans les environnements sans `Worker`), et la mise à jour de l'entité réutilise tous les blocs terminés.

2. **La mémorisation des paragraphes se fait sur la clé `\n`.** `Text.append` et le metteur à jour de paragraphes Markdown ne remesurent que le paragraphe qui a changé. Une ligne continue sans fin désactive la mémorisation et dégrade la mesure en O(document) par vidage. La sortie LLM a des sauts de paragraphe naturels ; les lignes de journal se terminent par `\n` — vous en bénéficiez généralement gratuitement, mais ne supprimez pas les retours à la ligne.

## Rythme de machine à écrire et cycle de vie

Le traitement par lots pour les performances est la valeur par défaut. Ajoutez un rythme temporel fixe (pacing) uniquement lorsque le produit a besoin d'un effet de révélation type machine à écrire :

```typescript
const stream = markdown.createStream({
  pacing: { graphemesPerSecond: 48 },
  maxBufferedChars: 64 * 1024,
  signal: requestAbort.signal,
});
```

Le rythme (pacing) ne passe jamais à « un jeton par trame ». Il accumule un crédit de `graphemesPerSecond` à partir des horodatages rAF, peut révéler plusieurs graphèmes en une seule trame, et effectue toujours au plus une validation d'ajout. Un plafond d'horodatage de 100 ms empêche un onglet en arrière-plan de déverser une grande quantité de contenu de rattrapage d'un coup.

Le découpage utilise `Intl.Segmenter`, y compris au-delà des limites de morceau/trame, de sorte que les marques combinatoires, les séquences ZWJ d'emojis, les drapeaux et les paires de substitution restent ensemble. Unicode permet à un seul graphème de s'étendre sans limite ; si une entrée hostile remplit la fenêtre délimitée (accepté plus bloqué) complète sans atteindre une limite, le contrôleur valide un point de code Unicode (jamais la moitié d'une paire de substitution) plutôt que de se bloquer ou d'augmenter la mémoire sans limite.

- `flush()` valide de manière synchrone le texte soumis et garde le flux ouvert.
- `close()` admet l'écriture bloquée, libère la fin de graphème retenue, effectue une dernière validation ordonnée et ferme le flux.
- `abort(reason)` ignore le texte non validé. Les opérations en cours et futures seront rejetées avec la raison (reason) conservée.
- `Markdown.setContent()` annule le contrôleur actif avant le remplacement.
- `Markdown.destroy()` annule le contrôleur et supprime les écouteurs rAF/`AbortSignal`.
- Un `Markdown` possède au plus un contrôleur ouvert ; les contrôleurs terminés se désinscrivent pour qu'un flux ultérieur puisse démarrer.

## Mode de rendu et bridage inactif

Les interfaces utilisateur de streaming doivent s'exécuter avec `renderMode: 'onDemand'` :

```typescript
const scene = new Scene(canvas, { renderMode: 'onDemand' });
```

Chaque ajout marque la scène comme sale (dirty), de sorte que les trames ne sont rendues que lorsque le contenu circule et s'arrêtent dès que le flux est inactif — pas de mauvaises surprises liées au bridage automatique à 2 fps et pas de consommation de batterie inutile entre les réponses. Les API d'ajout et les conteneurs de défilement intégrés signalent tous leur mouvement en cours (`hasPendingAnimations()`), de sorte qu'un défilement fluide vers le bas continue de s'animer après l'arrivée du dernier jeton.

Si vous pilotez un mouvement _personnalisé_ par trame pendant le flux (un indicateur de frappe, un curseur clignotant) depuis `update()`, souvenez-vous du [contrat du bridage automatique inactif](/learn/performance/#l-auto-limitation-au-repos-le-piege-cache) : surchargez `hasPendingAnimations()` ou pilotez-le avec `animate()`/`springTo()`.

## Suivre le bas (défilement)

`ScrollView.scrollToBottom()` effectue un **claquement (snap)** à la fin du contenu — en contournant délibérément le ressort de défilement, car recibler un ressort plusieurs fois par seconde ne lui permet jamais de se stabiliser et la fenêtre saute au lieu de suivre le contenu le plus récent. `Markdown.onLayoutUpdated` s'exécute après chaque validation de flux, lorsque la nouvelle hauteur est disponible :

```typescript
let stickToBottom = true;

function nearBottom(sv: ScrollView, slack = 24): boolean {
  const maxScroll = Math.max(0, sv.content.height - sv.height);
  return -sv.content.y >= maxScroll - slack;
}

markdown.onLayoutUpdated = () => {
  if (stickToBottom) transcript.scrollToBottom();
};

for await (const token of llmStream) {
  // Lire l'intention avant que la validation ne modifie la hauteur du contenu.
  stickToBottom = nearBottom(transcript);
  await stream.write(token);
}
await stream.close();
```

Définissez également `stickToBottom = false` à partir de la gestion du défilement utilisateur de l'application ; sinon, un utilisateur qui fait défiler pendant la dernière trame en attente peut être ramené par une intention obsolète. L'ordre est l'invariant : lisez « était en bas » avant que le contenu ne s'agrandisse, ne claquez (snap) qu'après `onLayoutUpdated`.

> [!NOTE]
> `scrollTo(y)` recible le **ressort** de défilement, tandis que `scrollToBottom()` **claque (snaps)**. Un état dérivé de la position lu immédiatement après `scrollTo` voit toujours l'ancienne position — lisez-le lors d'une validation/trame ultérieure.

## Longs transcripts : segmenter, puis virtualiser

Le coût d'ajout et le coût d'analyse lexicale augmentent tous deux avec la taille du document, plafonnez donc le document. Stratégie à deux niveaux pour les interfaces de chat/journaux :

1. **Segmenter par message.** Une entité `Markdown` par message d'assistant, pas une pour toute la conversation. L'entité de flux est toujours petite (uniquement le message en cours), de sorte que l'analyse lexicale par vidage reste bon marché quelle que soit la longueur de la conversation. Les messages terminés ne sont plus jamais analysés.
2. **Virtualiser l'historique.** Une fois que les messages sont des entités distinctes, une [`VirtualList`](/reference/ui-virtuallist/) ne rend que ceux qui sont visibles. Un transcript de mille messages coûte ce que la fenêtre affiche, et non ce que la session a accumulé.

```typescript
function startAssistantMessage(): Markdown {
  const md = new Markdown('', { maxWidth: 640 });
  messages.push(md); // votre source de données VirtualList
  return md; // streamer uniquement dans CETTE entité
}
```

Cela limite également la mémoire : la disposition statique d'un message terminé peut être éliminée (culling), et faire défiler loin en arrière ne déclenche jamais de remise en page de la fin en direct.

## Mesurer une interface utilisateur de streaming

Symptômes et leurs signaux, dans l'ordre de vérification :

| Symptôme                                             | Outil d'analyse                                                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Saccades pendant le streaming                        | DevTools `Streaming/appends` dépasse les trames rendues — utilisez un `createStream()` par message en direct                             |
| `write()` rejeté sous charge                         | Une deuxième écriture est arrivée pendant qu'une autre subissait la pression de retour — utilisez `await` à chaque écriture              |
| Les saccades augmentent avec la taille du transcript | Vous streamez dans une entité en croissance constante — segmentez par message                                                            |
| Toute l'interface bloque sur de longs paragraphes    | Pas de `\n` dans le flux — le mémo de paragraphe ne peut pas se diviser ; vérifiez le formatage de la source                             |
| Le défilement lutte contre l'utilisateur             | `scrollToBottom()` inconditionnel — limitez via l'adhérence « était en bas »                                                             |
| Processeur occupé alors que le flux est inactif      | La scène est laissée en mode `'always'`, ou une animation personnalisée sans `hasPendingAnimations()` ; le rAF du contrôleur est inactif |

Pour de vrais chiffres, utilisez le modèle de mesure en page de [Mesurer les performances réelles](/learn/performance/#mesurer-la-performance-reelle) — les FPS headless ne sont pas représentatifs.

> **Ensuite :** [Performances](/learn/performance/) pour la boîte à outils d'optimisation complète, et [`Markdown`](/reference/ui-markdown/) pour la référence de l'API de streaming.
