---
title: 'Streaming et texte en temps réel'
description: "Création d'interfaces de chat, de visionneuses de logs et de tableaux de bord en direct : coalescence par trames, les API d'append, interaction avec le throttling d'inactivité et stratégie pour les longues transcriptions."
order: 18
---

# Streaming et texte en temps réel

Les flux de tokens (chat LLM), les queues de logs et les flux de données en direct sont
l'endroit où le code VectoJS naïf tombe le plus souvent de la falaise. Le moteur vous donne
des primitives rapides — `Text.append()`, `Markdown.appendMarkdown()`, mémorisation de la
mise en page au niveau du paragraphe, analyse Markdown hors-thread — mais les câbler
token par token au lieu de trame par trame en gaspille la plus grande partie. Cette page
est la recette de bout en bout.

## La règle d'or : grouper par trame, pas par token

Un flux livre des tokens bien plus vite que l'écran ne se rafraîchit. Chaque
appel à `append()`/`appendMarkdown()` paie une passe de mise en page, et toute mise en page
entre deux trames affichées sauf la dernière est un **travail invisible**. Le correctif
tient en quatre lignes : mettre les tokens en tampon au fur et à mesure, les vider une fois
par trame d'animation.

```typescript
let pending = '';
let scheduled = false;

function pushToken(token: string) {
  pending += token;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const chunk = pending;
    pending = '';
    markdown.appendMarkdown(chunk); // UNE mise en page pour tous les tokens de la trame
    transcript.scrollToBottom();
  });
}

for await (const token of llmStream) pushToken(token);
```

Avec un flux de 200 tokens/s à 60 ips, cela transforme ~200 passes de mise en page
par seconde en ~60 — et sous charge, la dégradation est gracieuse : plus le thread
principal est occupé, plus les fragments vidés sont gros (et _plus rares_). Le
mécanisme est autorégulé ; un `setInterval` fixe ne l'est pas.

> [!NOTE]
> `scene.markDirty()` se coalesce déjà naturellement — trois appends dans une même trame
> plantent un seul drapeau et coûtent un seul repaint. La partie coûteuse d'un append est
> la **mise en page**, pas le drapeau dirty, c'est pourquoi le groupement doit
> envelopper l'append lui-même.

## Choisir l'API d'append

| Contenu                  | API                                    | Coût par appel                                                                                                                                 |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Texte brut               | `text.append(chunk)`                   | Passe à froid, mais le mémo de paragraphe réutilise tout paragraphe terminé par `\n`                                                           |
| Étendues stylisées       | `richText.appendSpans(spans)`          | Ajoute des spans ; les mesures des spans précédents sont réutilisées                                                                           |
| Markdown                 | `markdown.appendMarkdown(chunk)`       | Re-lexe la source brute (hors-thread quand un `Worker` existe), réutilise les entités de bloc terminées, étend le dernier paragraphe sur place |
| N'importe quoi, remplacé | `setText` / `setContent` (anti-patron) | Reconstruction complète — ne jamais appeler avec un document qui croît token par token                                                         |

Deux coûts se cachent dans `appendMarkdown` que vous devez connaître :

1. **Le lexing est O(document), pas O(fragment).** Chaque appel re-tokenise toute la
   source accumulée. L'analyse s'exécute dans un Worker en arrière-plan quand il est
   disponible (avec repli sur le lexing synchrone dans les environnements sans `Worker`),
   et les mises à jour d'entités réutilisent tout bloc terminé — mais une transcription
   de 100 000 caractères paie toujours un lex de 100 000 caractères par vidage. Le
   groupement par trame divise cela par le facteur tokens-par-trame ; la segmentation
   des transcriptions (ci-dessous) le plafonne.

2. **La mémorisation des paragraphes utilise `\n`.** `Text.append` et le metteur à jour
   de paragraphe Markdown ne remesurent que le paragraphe qui a changé. Une ligne
   interminable sans saut défait le mémo et dégrade en mesure O(document) par vidage.
   La sortie LLM a des sauts de paragraphe naturels ; les lignes de log se terminent
   par `\n` — vous l'obtenez généralement gratuitement, mais ne supprimez pas les
   retours à la ligne.

## Mode de rendu et throttling d'inactivité

Les UIs en streaming devraient utiliser `renderMode: 'onDemand'` :

```typescript
const scene = new Scene(canvas, { renderMode: 'onDemand' });
```

Chaque append marque la scène comme sale, donc les trames s'affichent exactement
pendant que le contenu coule et s'arrêtent dès que le flux s'inactive — pas de
surprise de throttling automatique à 2 ips et pas de consommation batterie au repos
entre les réponses. Les API d'append et les conteneurs de défilement intégrés
signalent tous leur mouvement en vol (`hasPendingAnimations()`), donc le défilement
doux vers le bas continue d'animer après l'arrivée du dernier token.

Si vous pilotez un _mouvement personnalisé_ par trame pendant le flux (un
indicateur de frappe, un curseur pulsant) depuis `update()`, souvenez-vous du
[contrat de throttling d'inactivité](/learn/performance/#lauto-limitation-au-repos-le-piège-caché) :
surchargez `hasPendingAnimations()` ou pilotez-le avec `animate()`/`springTo()`.

## Suivre le bas

`ScrollView.scrollToBottom()` **saute** à la fin du contenu — contournant
délibérément le ressort de défilement, car re-cibler un ressort plusieurs fois par
seconde ne lui permet jamais de se stabiliser et la fenêtre d'affichage tremble au
lieu de suivre le contenu le plus récent. Appelez-le dans le même vidage rAF que
l'append (comme dans la recette ci-dessus) pour que la cible soit calculée _après_
la nouvelle mise en page.

Pour une interface de chat, suivez l'intention de l'utilisateur : restez en bas
seulement s'ils y étaient déjà. `content` est public et son `y` contient la
translation négative du défilement, donc « en bas » est :

```typescript
function nearBottom(sv: ScrollView, slack = 24): boolean {
  const maxScroll = Math.max(0, sv.content.height - sv.height);
  return -sv.content.y >= maxScroll - slack;
}

// Dans le vidage : lire l'accroche AVANT d'ajouter, appliquer APRÈS.
const stick = nearBottom(transcript);
markdown.appendMarkdown(chunk);
if (stick) transcript.scrollToBottom();
```

L'ordre lecture-append-défilement dans un même vidage est le point crucial : mesurer
« était en bas » après l'append répond toujours « non » une fois que le contenu
a grandi.

> [!NOTE]
> Les deux API de défilement sont délibérément asymétriques : `scrollTo(y)`
> re-cible le **ressort** de défilement (donc `content.y` anime vers là dans les
> trames suivantes), tandis que `scrollToBottom()` **saute**. L'état dérivé de la
> position lu immédiatement après un `scrollTo` voit l'ancienne position — lisez-le
> au prochain vidage, comme le motif d'accroche ci-dessus le fait naturellement.

## Longues transcriptions : segmenter, puis virtualiser

Le coût d'append et le coût de lexing croissent avec la taille du document, donc
plafonnez le document. Stratégie à deux niveaux pour les UIs de chat/log :

1. **Segmentation par message.** Une entité `Markdown` par message de l'assistant,
   pas une pour toute la conversation. L'entité en streaming est toujours petite
   (seulement le message en cours), donc le lexing par vidage reste économique
   quelle que soit la longueur de la conversation. Les messages terminés ne sont
   jamais re-lexés.
2. **Virtualiser l'historique.** Une fois les messages en entités séparées, une
   [`VirtualList`](/reference/ui-virtuallist/) n'affiche que les visibles.
   Une transcription de mille messages coûte ce que montre la fenêtre, pas ce que
   la session a accumulé.

```typescript
function startAssistantMessage(): Markdown {
  const md = new Markdown('', { maxWidth: 640 });
  messages.push(md); // votre source de données VirtualList
  return md; // streamer UNIQUEMENT dans cette entité
}
```

Cela borne aussi la mémoire : la mise en page d'un message terminé est statique et
supprimable, et défiler loin en arrière ne déclenche jamais de re-mise en page de
la queue en direct.

## Mesurer une UI en streaming

Symptômes et leurs signaux, dans l'ordre à vérifier :

| Symptôme                                      | Sonde                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| À-coups pendant le streaming                  | Comptez les appends par seconde vs. les trames par seconde — si appends ≫ trames, il manque le lot rAF |
| Les à-coups croissent avec la transcription   | Vous streamer dans une entité qui grandit sans fin — segmentez par message                             |
| Toute l'UI se bloque sur de longs paragraphes | Pas de `\n` dans le flux — le mémo de paragraphe ne peut pas diviser ; vérifiez le formatage source    |
| Le défilement lutte avec l'utilisateur        | `scrollToBottom()` inconditionnel — conditionnez avec l'accroche « était en bas »                      |
| CPU occupée alors que le flux est inactif     | Scène en mode `'always'`, ou animation personnalisée sans `hasPendingAnimations()`                     |

Pour des chiffres réels, utilisez le motif de mesure en page de
[Mesurer les performances réelles](/learn/performance/#mesurer-la-performance-réelle) —
le FPS headless n'est pas représentatif.

> **Suivant :** [Performances](/learn/performance/) pour la boîte à outils
> d'optimisation complète, et [`Markdown`](/reference/ui-markdown/) pour la
> référence de l'API de streaming.
