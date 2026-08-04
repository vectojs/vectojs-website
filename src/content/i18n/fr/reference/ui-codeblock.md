---
title: 'UI: CodeBlock'
description: 'Bloc de code canvas à feuille unique utilisé par Markdown pour le code délimité.'
order: 40
---

# `CodeBlock`

`CodeBlock` est le moteur de rendu de code délimité de bas niveau utilisé par `Markdown`. Tous deux vivent dans le paquet autonome
**`@vectojs/markdown`** (sortis de `@vectojs/ui` dans `@vectojs/ui@2.2.0`). Il dessine lui-même lʼarrière-plan et le texte coloré syntaxiquement,
évitant ainsi une entité enfant par jeton.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · CodeBlock</span></div>
  <iframe src="/sandbox/ui/component.html?name=codeblock&v=core-1.25.0-ui-2.6.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de CodeBlock" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Utilisez ceci directement uniquement pour les moteurs de rendu personnalisés ; la documentation normale devrait passer par `Markdown`.</figcaption>
</figure>

## Exemple minimal

````ts
import { CodeBlock, Markdown } from '@vectojs/markdown';

// La plupart des appelants devraient laisser Markdown créer les instances de CodeBlock :
const md = new Markdown('```ts\\nscene.markDirty();\\n```', { maxWidth: 520 });

// Les sous-classes Markdown personnalisées peuvent retourner CodeBlock pour des blocs délimités spécifiques à lʼapplication.
````

Les blocs délimités projettent leur source exacte sous forme de lignes visuelles positionnées individuellement
depuis la même marge intérieure et la même ligne de base que le Canvas. Les longues lignes de source ne
sont donc pas silencieusement renvoyées à la ligne par le navigateur et ne dérivent pas de la copie,
de la recherche dans la page ou de la sélection native. Chaque retour à la ligne dur appartient à la ligne positionnée précédente,
empêchant Firefox de produire un fragment sélectionné à la racine de la projection. La pile par défaut
commence par `ui-monospace`, évitant la substitution de police par Firefox Desktop de la
police du code vers un visage serif proportionné tout en respectant une police personnalisée explicite.
Markdown propage son réglage `selectable` ; les utilisateurs directs de CodeBlock peuvent appeler
`setSelectable(boolean)`.

UI 1.9 utilise la grille de contenu préparé retenu de Core 1.8 à la fois pour la peinture
Canvas colorée syntaxiquement et pour le porteur sémantique. Les tabulations, les emoji/ZWJ, les CJK larges,
le façonnage arabe, les directions mixtes et les limites exactes de source CR/LF/CRLF partagent donc
un seul plan. Lʼétalonnage est un passage de chargement à froid de la police ; la synchronisation stable de la projection
ne lit pas la géométrie Range ni ne remplace les porteurs de cellules.

## Largeur : `setWidth()`

```ts
codeBlock.setWidth(width: number): this
```

Change la largeur de la boîte (`0.9.0+`). Elle ne reconstruit **pas** la grille
et ne relance pas la coloration, volontairement : le code ne se ré-enroule pas.
Les lignes occupent une grille monospace fixe à `col × cellWidth` et une ligne
longue déborde au lieu de passer à la ligne, donc `height` ne dépend que du
**nombre** de lignes et la largeur ne dimensionne que l'arrière-plan arrondi.

Tout ce qui changerait la géométrie des glyphes — la source, le langage, la
police — passe par `setCode()`, qui y invalide la grille. Sans changement de
largeur, l'appel ne fait rien et renvoie `this`.

`Markdown.setMaxWidth()` l'appelle pour chaque bloc de code délimité qu'il
possède ; un appel direct n'est donc nécessaire que si vous construisez
vous-même un `CodeBlock`.

## Liste de vérification pour les mainteneurs

- Gardez le code délimité comme une seule entité feuille.
- Utilisez `setCode()` pour les mises à jour en direct.
- Utilisez `setWidth()` pour un changement de largeur seul ; il évite la reconstruction de grille que fait `setCode()`.
- Maintenez la projection de contenu synchronisée avec la source exacte, la police et la hauteur de ligne.
- Réutilisez une grille préparée pour la peinture Canvas, les curseurs de pointeur, la copie et la recherche.
- Vérifiez Chromium et Firefox à DPR/zoom fractionnaires, y compris les polices substituées et les blocs transformés.
- Préférez le composant de plus haut niveau `Markdown` sauf si vous écrivez une extension de moteur de rendu.
