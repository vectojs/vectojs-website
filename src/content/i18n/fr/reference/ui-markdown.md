---
title: 'Markdown'
description: 'Moteur de rendu Markdown natif sur canvas avec texte enrichi, blocs de code, tableaux, ajout en flux et callbacks de lien — le paquet autonome @vectojs/markdown.'
order: 14
---

# `Markdown` — `@vectojs/markdown`

`Markdown` et `CodeBlock` vivent dans le paquet autonome **`@vectojs/markdown`**
(depuis `@vectojs/ui@2.2.0` ils ne font plus partie de `@vectojs/ui`, de sorte que
les dépendances `marked` + `@vectojs/tex` ne se chargent que lorsque vous rendez du
Markdown). Il compose des composants `@vectojs/ui`, alors installez-le aux côtés de
`@vectojs/ui` et `@vectojs/core` : `bun add @vectojs/markdown @vectojs/ui @vectojs/core`.

`Markdown` analyse le Markdown avec `marked` et rend le résultat dans un sous-arbre dʼentités VectoJS.
Les paragraphes et titres deviennent des `RichText`, le code délimité devient `CodeBlock`, et les tableaux GFM deviennent
`Table`.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.32.6-ui-2.15.0" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Démonstration live de Markdown" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Lʼéchantillon conserve prose, liens, code en ligne et un bloc délimité dans une seule zone dʼaffichage ciblée afin que les défauts de mise en page soient visibles.</figcaption>
</figure>

## Exemple minimal

```ts
import { Markdown } from '@vectojs/markdown';

const md = new Markdown(source, {
  maxWidth: 640,
  selectable: true,
  onLinkClick(href) {
    router.open(href);
  },
});

scene.add(md.setPosition(24, 24));
```

## Constructeur

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean; // default true
  userTiming?: boolean; // emit a `vecto:markdown:parse` measure, default false
}
```

`selectable` se propage aux titres actuels et futurs, à la prose, aux listes, au code
délimité et aux cellules de tableau. Modifiez-le à lʼexécution avec `markdown.setSelectable(false)`.
Le navigateur gère la sélection par glissement, Ctrl/Commande+C et la recherche dans la page ; les entités VMT
possèdent toujours la mise en page et les pixels. Les éléments de liste ordonnée et non ordonnée utilisent un
`RichText` sélectionnable ; chaque cellule de tableau GFM possède une projection sélectionnable. Lʼordre
logique de la source et les séparateurs durs/mous restent intacts dans la sortie Markdown imbriquée.
Core 1.8 achemine la prose transformée à travers une géométrie de caret bidimensionnelle et le
code délimité à travers la grille préparée partagée, de sorte que les listes, les tableaux GFM, le texte
arabe/RTL enveloppé et le code conservent un ordre de copie logique à DPR et zoom fractionnaires.
Lorsquʼune application gère le dimensionnement du conteneur ou le zoom CSS, notifiez la Scene avec
`scene.resize(width, height)` afin que Firefox puisse recalibrer les métriques natives Range.

## Largeur responsive : `setMaxWidth()`

```ts
markdown.setMaxWidth(width: number): this
```

Ré-enroule chaque bloc déjà rendu à une nouvelle largeur (`0.9.0+`). Appelez-la
lors d'un redimensionnement au lieu d'affecter `maxWidth`, qui définit le champ
sans rien changer de visible : la largeur est lue au moment où chaque bloc est
**construit**, donc une affectation laisse les blocs existants mesurés à
l'ancienne largeur.

```ts
window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
  markdown.setMaxWidth(window.innerWidth - INSET * 2);
});
```

Elle refait la mise en page sur place plutôt que de reconstruire, ce qui la rend
utilisable en pleine diffusion :

- les mêmes **instances** d'entités de bloc survivent, donc tout ce qui détient
  une référence à l'une d'elles (une ancre de défilement, une cible de clic, une
  sélection devtools) continue de fonctionner ;
- un rédacteur [`createStream()`](#flux-en-continu) ouvert n'est pas touché et continue
  d'ajouter du contenu ;
- rien n'est ré-analysé lexicalement.

Mesuré sur un document de cinq blocs dans les deux moteurs : 520 → 260 px a fait
passer le nombre de lignes projetées de 2 à 4 et la hauteur de 88 à 160 sur les
deux mêmes instances de paragraphe, le rédacteur restant `open` et **zéro**
caractère supplémentaire transmis à l'analyseur lexical.

Sans changement de largeur, l'appel ne fait rien : un redimensionnement en
hauteur seule ne coûte donc rien et l'appelant n'a pas besoin de garde. Une
largeur négative est bornée à 0.

> [!NOTE]
> Avant `0.9.0`, le seul contournement correct était une reconstruction
> complète — libérer le flux, rejouer la source révélée via `setContent()`,
> ouvrir un nouveau rédacteur et reporter le décalage de défilement à la main.
> Cela reproduit correctement le document, ce qui explique qu'on le conservait
> facilement : une reconstruction produit aussi une géométrie correcte. Son coût
> était une réanalyse lexicale de tout le document et la perte de chaque
> instance d'entité, à chaque redimensionnement.

Les formules en display gardent volontairement leur propre largeur : `@vectojs/tex`
dimensionne une boîte composée à partir de métriques relatives à `ex` et non de
la largeur disponible, donc l'étirer déformerait la formule. Le code délimité
n'est pas ré-enroulé non plus — il a une grille monospace fixe et les lignes
longues débordent par conception — seul son arrière-plan est redimensionné.

L'appeler depuis un rappel [`onStable`](#achèvement-unique--onstable) lève une exception, pour la
même raison que `setContent()` : ce rappel s'exécute à l'intérieur du commit
qu'il invaliderait.

## Couverture GFM

Au-delà des paragraphes, titres, listes, code délimité et tableaux :

| Construction        | Rendu sous forme de                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `~~strikethrough~~` | Un texte barré — un seul trait par suite fusionnée, dont l'épaisseur suit la taille de police (`0.8.0+`)           |
| `- [ ]` / `- [x]`   | Un glyphe ☐ ou ☑ suivi d'une espace, qui remplace la puce ; `1.` puis le glyphe dans une liste ordonnée (`0.8.0+`) |
| `\|:--\|--:\|:-:\|` | L'alignement des colonnes, transmis à `Table.align` (`0.8.0+`)                                                     |
| `$…$` / ` ```math ` | Une formule composée par `@vectojs/tex` (en ligne / en bloc), convertie seulement une fois le délimiteur fermé     |

## En-tête de métadonnées (Front matter)

Un bloc YAML délimité par `---` en tête de document est une métadonnée, pas du
contenu (`0.8.0+`) :

```ts
const md = new Markdown('---\ntitle: Release notes\ndate: 2026-08-03\n---\n# Body');

md.frontMatter; // 'title: Release notes\ndate: 2026-08-03\n'
md.frontMatterFields; // { title: 'Release notes', date: '2026-08-03' }
```

Avant `0.8.0`, ce bloc était rendu comme du contenu : `marked` n'a aucune notion
d'en-tête de métadonnées, donc le `---` ouvrant déclenchait la règle du filet
horizontal et le `---` fermant **soulignait les clés comme un titre setext**. Un
document doté de métadonnées peignait donc un filet horizontal suivi d'un titre
gras de 28px composé de ses propres clés.

`frontMatterFields` est une commodité étroite, pas du YAML — les lignes indentées
sont ignorées, de sorte que les mappages et séquences imbriqués ne débordent
jamais sous forme de clés de premier niveau (la clé parente est présente avec une
valeur vide). Pour tout besoin plus riche, confiez `md.frontMatter` à un véritable
analyseur. `scanFrontMatter(text, complete)` et `parseFrontMatterFields(raw)` sont
tous deux exportés pour être utilisés sur du texte brut.

La reconnaissance est délibérément conservatrice, car un faux positif supprime
silencieusement le début d'un document. Un `---` en tête n'est un en-tête de
métadonnées que si la ligne suivante est une entrée de mappage YAML — `key: value`,
avec une espace après le deux-points comme YAML l'exige — **et** qu'un `---` ou
`...` fermant suit. Ainsi `---\n\n# Title`, `---\n# Title\n---`,
`----\nkey: v\n----` et `---\n- a\n---` continuent tous de rendre un filet
horizontal.

Pendant le streaming, un fragment qui atterrit à l'intérieur d'un bloc non fermé
est retenu plutôt qu'analysé lexicalement, afin que le document ne peigne pas un
filet que le délimiteur fermant devrait ensuite démolir. Un bloc encore ouvert à
la fermeture du flux est libéré comme contenu, et la retenue est bornée, si bien
qu'un filet horizontal en tête d'un long document ne peut pas le bloquer.

## Flux en continu

`createStream()` lie à ce `Markdown` un unique writer qui regroupe les écritures par
trame. Faites `await write()` pendant que vous consommez la source ; `close()`
valide de force la fin sans attendre une nouvelle trame d'animation :

```ts
const stream = markdown.createStream();

try {
  for await (const token of llmStream) {
    await stream.write(token);
  }
  await stream.close();
} catch (error) {
  stream.abort(error);
  throw error;
}
```

```ts
interface StreamControllerOptions {
  maxBufferedChars?: number; // default 64 * 1024 UTF-16 code units
  pacing?: {
    graphemesPerSecond: number;
  };
  signal?: AbortSignal;
  incompleteMode?: IncompleteMarkdownMode; // default 'literal'
  onStable?: (blocks: readonly Entity[]) => void;
}

type IncompleteMarkdownMode = 'literal' | 'optimistic';

type StreamControllerState = 'open' | 'closed' | 'aborted';

interface StreamController {
  readonly state: StreamControllerState;
  readonly bufferedChars: number; // accepted + one blocked write
  write(chunk: string): Promise<void>;
  flush(): void;
  close(): Promise<void>;
  abort(reason?: unknown): void;
  destroy(): void;
}
```

Le mode par défaut regroupe en une seule validation parse/layout tous les fragments
acceptés avant la trame suivante. `write()` se résout à l'admission dans un tampon
borné, pas à l'affichage. Quand la capacité est insuffisante, une écriture attend ;
une autre écriture pendant que cet attendant existe est rejetée, si bien qu'un
producteur qui ignore la contre-pression ne peut pas faire croître une file non bornée.

`pacing.graphemesPerSecond` ajoute une cadence de machine à écrire fixe en temps réel
tout en conservant le plafond d'une validation par trame. `Intl.Segmenter` garde
ensemble les séquences combinantes ordinaires, les clusters ZWJ d'emoji, les drapeaux
et les paires de substitution au travers des frontières de fragment et de trame. Le
cycle de vie complet, le repli borné pour les clusters pathologiques, le motif de
suivi du bas et la stratégie de transcript sont dans
[Streaming & Texte en temps réel](/learn/streaming/).

### Syntaxe non fermée de fin : `incompleteMode`

Un flux est constamment coupé au milieu d'un token, de sorte que les derniers caractères d'un morceau
forment couramment la moitié d'une construction. `incompleteMode` détermine comment cette fin de texte est rendue pendant
que le contrôleur est ouvert :

| Mode                   | En streamant `a **bo`                                    |
| ---------------------- | -------------------------------------------------------- |
| `'literal'` _(défaut)_ | texte `a **bo` — les astérisques sont du texte ordinaire |
| `'optimistic'`         | texte `a bo`, avec `bo` en gras — syntaxe cachée         |

`'optimistic'` devine que la dernière construction non fermée de type
strong/emphasis/inline-code/link du paragraphe final va se fermer. La prédiction est
**uniquement pour l'affichage** — l'état du token n'est jamais modifié — et elle est annulée lors du
`close()`, de sorte qu'un flux `'literal'` et `'optimistic'` provenant de la même source se terminent
par un document identique au niveau des octets. `'literal'` est ce que chaque version précédant
cette option utilisait.

Le mode est interprété par `Markdown`, et non par le contrôleur : le contrôleur
gère la mise en mémoire tampon et le rythme, tandis que la prédiction est une transformation au moment du rendu sur le
paragraphe de fin.

### Achèvement unique : `onStable`

```ts
const stream = markdown.createStream({
  onStable: (blocks) => {
    // S'exécute une fois, avec le document terminé. Endroit sûr pour le travail qui serait
    // gaspillé en cours de flux.
    console.log(`settled with ${blocks.length} top-level blocks`);
  },
});
```

Se déclenche **exactement une fois**, après que `close()` a validé le texte final _et_ qu'une
éventuelle analyse de worker en cours a été appliquée, avec un instantané des
entités de bloc de premier niveau du document à ce moment. Indépendant de `incompleteMode`, donc il
fonctionne avec le défaut `'literal'`.

Ce n'est délibérément pas un hook général de "progression du flux" :

- **Jamais déclenché par `flush()`, `abort()` ou `destroy()`.** Aucun de ces appels
  ne signifie que le contenu a fini de changer.
- L'appel de `appendMarkdown()` ou `setContent()` depuis l'intérieur du callback **déclenche une erreur
  synchrone** — une mutation réentrante invaliderait l'instantané qui vient de lui être remis.
- Une exception lancée depuis le callback rejette la promesse de `close()`. Le contrôleur est
  libéré dans tous les cas.

Destiné au travail ponctuel d'après-flux — précalculer un cache de coloration,
lancer une animation d'entrée — qui ne devrait pas s'exécuter en cours de flux sur
un contenu encore susceptible de changer.

Un seul contrôleur peut être ouvert pour un `Markdown`. `setContent()` l'interrompt
avant le remplacement ; `destroy()` l'interrompt et retire les écouteurs
rAF/`AbortSignal`. Les contrôleurs terminaux se désinscrivent. L'API publique
`appendMarkdown()` reste synchrone : elle vide d'abord chaque fragment de contrôleur
soumis auparavant, puis applique le fragment direct dans l'ordre exact des appels.

Évitez d'appeler `setContent(fullDocumentSoFar)` pour chaque jeton ; cela reconstruit
tout le sous-arbre.

## Modèle de performance

Ce que coûte réellement chaque appel, afin que le code de streaming puisse être raisonné :

- **L'analyse est hors thread par défaut.** `appendMarkdown` poste la source accumulée vers un `Worker` construit à partir d'un bundle intégré (aucune requête réseau) ; le diff de jetons et les mises à jour d'entités s'appliquent lorsque l'analyse revient. Les environnements sans `Worker` (certains exécuteurs de tests, SSR) tombent en analyse lexicale synchrone — même résultat, coût sur le thread principal.
- **L'analyse lexicale est O(document) par ajout**, pas O(morceau) : toute la source accumulée est re-tokenisée à chaque appel. Utilisez `createStream()` pour regrouper par trame et segmentez les longs transcripts en une entité `Markdown` par message pour que le document en direct reste petit.
- **Les blocs terminés sont réutilisés, pas reconstruits.** `appendMarkdown` fait correspondre par préfixe la nouvelle liste de jetons avec l'ancienne via la source brute ; chaque bloc déjà rendu conserve son instance d'entité. Le cas de streaming courant — le dernier paragraphe a grandi — met à jour les étendues de ce paragraphe sur place.
- **`setContent()` ne réutilise rien.** Il supprime chaque enfant et réaffiche la liste complète des jetons. C'est l'appel correct pour _remplacer_ un document, et l'appel incorrect pour _agrandir_ un document.

## Point d'extension

`renderToken(token)` est protégé, de sorte que des renderers personnalisés peuvent
sous-classer `Markdown` pour des blocs spécifiques à l'application tout en déléguant
les tokens normaux au renderer intégré.

## Liste de vérification pour les mainteneurs

- Les callbacks de lien doivent être transmis aux nœuds `RichText` des paragraphes, titres et listes.
- Les blocs de code doivent rester une seule entité feuille, pas une entité par jeton ou segment de ligne.
- Le code délimité doit projeter son texte source exact et ses sauts de ligne.
- Les en-têtes de tableau utilisent le style gras/couleur des titres, tandis que chaque cellule logique possède exactement une projection de contenu.
- La propriété du pointeur reste avec la projection de texte/code feuille ; les entités structurelles de liste et de tableau ne doivent pas intercepter la sélection native.
- Lʼajout en flux doit réutiliser les entités de préfixe inchangées.

Voir aussi : [`RichText`](/reference/ui-components/#richtext), [`CodeBlock`](/reference/ui-components/#codeblock), [`Table`](/reference/ui-components/#table).
