---
title: 'Markdown'
description: 'Moteur de rendu Markdown natif sur canvas avec texte enrichi, blocs de code, tableaux, ajout en flux et callbacks de lien.'
order: 14
---

# `Markdown`

`Markdown` analyse le Markdown avec `marked` et rend le résultat dans un sous-arbre dʼentités VectoJS.
Les paragraphes et titres deviennent des `RichText`, le code délimité devient `CodeBlock`, et les tableaux GFM deviennent
`Table`.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Démonstration live de Markdown" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Lʼéchantillon conserve prose, liens, code en ligne et un bloc délimité dans une seule zone dʼaffichage ciblée afin que les défauts de mise en page soient visibles.</figcaption>
</figure>

## Exemple minimal

```ts
import { Markdown } from '@vectojs/ui';

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

## Flux en continu

Pour les flux de jetons, ajoutez uniquement le nouveau delta :

```ts
for await (const token of llmStream) {
  markdown.appendMarkdown(token);
  scrollView.scrollToBottom();
}
```

Évitez dʼappeler `setContent(fullDocumentSoFar)` pour chaque jeton ; cela reconstruit tout le sous-arbre.

## Point dʼextension

`renderToken(token)` est protégé, donc les moteurs de rendu personnalisés peuvent sous-classer `Markdown` pour des blocs
spécifiques à lʼapplication tout en déléguant les jetons normaux au moteur de rendu intégré.

## Liste de vérification pour les mainteneurs

- Les callbacks de lien doivent être transmis aux nœuds `RichText` des paragraphes, titres et listes.
- Les blocs de code doivent rester une seule entité feuille, pas une entité par jeton ou segment de ligne.
- Le code délimité doit projeter son texte source exact et ses sauts de ligne.
- Les en-têtes de tableau utilisent le style gras/couleur des titres, tandis que chaque cellule logique possède exactement une projection de contenu.
- La propriété du pointeur reste avec la projection de texte/code feuille ; les entités structurelles de liste et de tableau ne doivent pas intercepter la sélection native.
- Lʼajout en flux doit réutiliser les entités de préfixe inchangées.

Voir aussi : [`RichText`](/reference/ui-components/#richtext), [`CodeBlock`](/reference/ui-components/#codeblock), [`Table`](/reference/ui-components/#table).
