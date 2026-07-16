---
title: 'Renderers'
description: 'Le sous-chemin @vectojs/core/renderer : le contrat IRenderer indépendant du backend, CanvasRenderer, SVGRenderer, la couche WebGL points/rects/sprites/MSDF, la projection de contenu Entity, et parseColorToRGBA.'
order: 5
---

# Renderers — `@vectojs/core/renderer`

Partie de [`@vectojs/core`](/reference/core-api/).

## IRenderer

Surface de dessin indépendante du backend que chaque `Entity.render` reçoit.

```ts
interface IRenderer {
  clear(): void;
  save(): void;
  restore(): void;
  translate(x, y): void;
  scale(x, y): void;
  rotate(angle): void; // radians, sens horaire
  setGlobalAlpha(alpha): void; // [0,1]
  clip(x, y, width, height): void; // intersecte le rect de clip (encadrer dans save/restore)

  beginPath(): void;
  moveTo(x, y): void;
  lineTo(x, y): void;
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y): void;
  closePath(): void;
  arc(x, y, radius, startAngle, endAngle, counterclockwise?): void;
  roundRect(x, y, width, height, radii: number | number[]): void;

  drawImage(source: CanvasImageSource, dx, dy, dw, dh): void;
  fill(colorOrGradient: string | any): void;
  stroke(colorOrGradient: string | any, lineWidth = 1): void;
  fillText(text, x, y, font, color): void; // font = notation CSS rapide, p. ex. '16px monospace'

  fillCircle(cx, cy, radius, color, alpha = 1): void; // lot préservant l'ordre, même style
  flush(): void; // valider le lot en attente (sans opération quand inactif)
  present?(): void; // validation optionnelle de fin d'image
  createLinearGradient(x0, y0, x1, y1, colorStops: { stop; color }[]): any;
  dispose?(): void; // nettoyage idempotent du backend ; Scene.destroy() l'appelle
}
```

`fillCircle` fusionne les appels consécutifs de même `color`/`alpha` en un seul chemin,
validé sur `flush()` (ou quand le style change). La Scène vide à la fin de chaque
groupe frère et de chaque image, préservant l'ordre du peintre.

## `Entity.getContentProjection()`

```ts
getContentProjection(): ContentProjection | null // défaut null
// ContentProjection: {
//   text: string; font?: string; lineHeight?: number; selectable?: boolean;
//   contentX?: number; contentY?: number; baseline?: number;
//   lines?: Array<{ text; x; y; baseline; font?; lineHeight?; runs? }>;
//   grid?: PreparedContentGrid;
// }
```

Hook optionnel pour les entités qui rendent du texte statique : la Scène reflète la
chaîne retournée comme un nœud DOM transparent, synchronisé en position (paresseux
sur le viewport, vérifié par saleté, `aria-hidden` quand l'entité est interactive),
rendant le texte du canvas trouvable, visible par les lecteurs d'écran/crawlers,
traduisible et — avec `selectable: true` — natif sélectionnable. `TextEntity`/`MSDFTextEntity`
(voir [Texte et Bidi](/reference/core-text/)) l'implémentent. Interrupteur général
pour la scène : `new Scene(canvas, { contentProjection: false })`.

La Scène préserve l'ordre VMT quand les nœuds de projection apparaissent ou
disparaissent, supprime les projections descendantes avec leur sous-arbre d'entité,
et cache une projection quand elle est entièrement hors du viewport ou d'un ancêtre
`clipChildren`. Les outils peuvent inspecter un miroir actuellement matérialisé sans
interroger le DOM :

```ts
scene.getContentElement(entityId): HTMLElement | undefined;
```

Le texte virtualisé ou hors viewport non matérialisé n'est pas consultable jusqu'à ce
que l'application le ramène dans la scène active.

> Nécessite Core 1.6.0 ou ultérieur : Canvas accepte les positions de texte comme
> lignes de base tandis que CSS accepte les boîtes de ligne. Pour une géométrie de
> sélection exacte, fournissez `contentX`/`contentY` et `baseline` pour un passage de
> texte simple, ou une entrée `lines` explicite par ligne visuelle quand le composant
> possède déjà l'enroulement, les insertions ou la typographie mixte. La Scène
> mappe ces coordonnées locales à travers la transformation de l'entité et
> synchronise les boîtes de ligne CSS avec les métriques de police Canvas.

```ts
getContentProjection() {
  return {
    text: 'small large',
    selectable: true,
    lines: [{
      text: 'small large', x: 18, y: 12, baseline: 25,
      font: '28px sans-serif', lineHeight: 42,
      runs: [
        { text: 'small ', font: '16px sans-serif' },
        { text: 'large', font: 'bold 28px sans-serif' },
      ],
    }],
  };
}
```

Utilisez `cssLineBoxBaseline(font, lineHeight)` dans les éditeurs Canvas natifs
personnalisés quand le même texte doit s'aligner avec un contrôle natif ou une
projection de contenu.

> Core 1.8 ajoute `prepareContentGrid(source, metrics)` pour les renderers de type
> code. Retournez son résultat immuable comme `ContentProjection.grid` et utilisez les
> mêmes cellules pour la peinture Canvas. La grille conserve les plages source UTF-16,
> les carets de graphème légaux, les séparateurs CR/LF/CRLF, les tabulations, les
> avancées CJK larges et emoji, le shape arabe et les positions bidi Unicode tandis que
> le DOM projeté conserve la source logique exacte pour la copie et la recherche.

```ts
const grid = prepareContentGrid(source, {
  font: codeFont,
  cellWidth,
  lineHeight: 24,
  baseline: 18,
});

getContentProjection() {
  return { text: source, selectable: true, grid };
}
```

Core calibre les porteurs retenus après le chargement des polices et achemine la
sélection du pointeur dans l'espace local de la grille. La substitution de police
Firefox, le DPR, le zoom du navigateur, les transformations de rotation, miroir
et d'échelle non uniforme utilisent donc un seul plan de géométrie. Les sondes
de calibrage héritent du contexte de zoom de la projection et tiennent compte des
métriques de repli des glyphes manquants de Firefox ; les propriétaires personnalisés
de redimensionnement/zoom doivent appeler `scene.resize()` pour invalider le calibrage
retenu. Les projections `lines` ordinaires et les projections personnalisées sans lignes
utilisent aussi une géométrie de caret de graphème transformée en deux dimensions.

`present()` est appelé par la Scène exactement **une fois** à
la fin de chaque passe de rendu. Les backends retenus qui soumettent une image entière
à la fois (par exemple `ThreeRenderer` de [`@vectojs/three`](/reference/three-renderer/))
devraient faire leur validation coûteuse unique ici et garder `flush()` bon marché — la
Scène appelle `flush()` autour de chaque nœud non mis en lot, donc un `flush()` coûteux
rend le coût de l'image quadratique par rapport au nombre d'entités.

## CanvasRenderer

```ts
new CanvasRenderer(canvas: HTMLCanvasElement)
```

`IRenderer` par défaut. Applique le facteur `devicePixelRatio` à la construction.
Limite chaque `fill()` mis en lot à `MAX_BATCH = 64` sous-chemins (un seul `fill()` Canvas2D
est superlinéaire par rapport au nombre de sous-chemins). Obtenez un handle via
`scene.getRenderer()`.

## SVGRenderer

```ts
new SVGRenderer(width: number, height: number)
toXMLString(): string
```

`IRenderer` logiciel qui enregistre les dessins dans une chaîne SVG plate (piles de
matrice/alpha/clip, déduplication des dégradés). Le texte et les valeurs d'attributs
sont échappés XML, et les URL d'images externes rejettent les schémas
exécutable/data/file/personnalisé (les URL de données rastérisées générées par Canvas
restent supportées). Alimente `scene.toSVG()`. `SVGLinearGradient` est le type de
descripteur de dégradé.

## Couche WebGL points

```ts
createWebGLPointRenderer(canvas: HTMLCanvasElement): PointRenderer | null   // null si WebGL2 / shader indisponible

interface PointRenderer {
  resize(width, height): void;                 // taille logique ; applique DPR
  begin(): void;                               // réinitialise les tampons par image
  addCircle(x, y, radius, color, alpha?): void;         // coordonnées monde
  addRect(x, y, width, height, color, alpha?, rotation?): void;
  setTexture(source: TexImageSource): void;
  addSprite(x, y, width, height, u0, v0, u1, v1, color?, alpha?, rotation?): void;
  setMSDFTexture(source: TexImageSource, distanceRange: number): void;
  addGlyph(x, y, width, height, u0, v0, u1, v1, color?, alpha?, rotation?): void;
  flush(): void;                               // efface + dessine toutes les primitives accumulées
  destroy(): void;
}
```

Un canvas WebGL2, quatre programmes mis en lot : points (ronds, AA via `gl_PointSize`),
rects (triangles étendus), sprites texturés et glyphes MSDF (reconstruction de distance
médiane-de-3, nette à tout zoom). `color` teinte ; les texels blancs passent
inchangés. Les ajouts de sprite/glyphe sont sans opération jusqu'à ce que leur texture
soit définie. La Scène achemine `getBatchCircle`/`getBatchRect` (et les particules CPU,
le texte MSDF) ici quand `pointBackend: 'webgl'`. Les feuilles sous des
transformations que la primitive GPU ne peut pas représenter exactement (par exemple
l'échelle non uniforme ou le cisaillement) tombent en repli sur le renderer normal.

> Les hooks d'entité `getBatchCircle()` → `{ radius, color }` et `getBatchRect()` →
> `{ width, height, color }` (voir [`Entity`](/reference/core-entity/#hooks-a11y--lot-redéfinir-pour-adhérer))
> sont les adhésions par entité qui alimentent cette couche.

## parseColorToRGBA

```ts
parseColorToRGBA(css: string): RGBA           // RGBA = [number, number, number, number] in [0,1]
```

Chemins rapides pour `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` et `rgb()`/`rgba()` ; autres
formes (nommées, `hsl()`, …) se résolvent via un canvas 1×1 mis en cache quand un DOM
existe. Les résultats sont **mis en cache et partagés par identité — traitez le
tableau retourné comme en lecture seule.** Entrée non analysable sans DOM → noir
opaque `[0,0,0,1]`.

## Associé

[`Entity`](/reference/core-entity/) (hooks de lot, projection de contenu) ·
[`ComputeParticleEntity`](/reference/core-particles/) (consommateur WebGL/WebGPU) ·
[Texte et Bidi](/reference/core-text/) (consommateur de glyphes MSDF) ·
[`@vectojs/three`'s `ThreeRenderer`](/reference/three-renderer/) (un `IRenderer` alternatif) ·
[`@vectojs/core` overview](/reference/core-api/)
