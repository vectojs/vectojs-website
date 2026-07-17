---
title: 'UI: Table'
description: 'Tableau en grille natif sur canvas pour les aperçus de données compacts et la sortie de tableaux Markdown.'
order: 31
---

# `Table`

`Table` expose `role="grid"`, peint son chrome sur le canvas et possède chaque cellule
comme une entité enfant. Les cellules chaîne sont normalisées en `Text` ; les cellules dʼentité fournies
peuvent participer via les capacités publiques `setMaxWidth()` et `setSelectable()`.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Table</span></div>
  <iframe src="/sandbox/ui/component.html?name=table&v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Table" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Utilisez des démos ciblées pour le dimensionnement des colonnes au lieu de déboguer la sortie du tableau dans une grande galerie.</figcaption>
</figure>

## Exemple minimal

```ts
import { Table } from '@vectojs/ui';

const table = new Table({
  width: 520,
  headers: ['Composant', 'Rôle'],
  rows: [
    ['Button', 'button'],
    ['Input', 'textbox'],
  ],
  selectable: true,
});
```

`layout()` contraint chaque cellule, calcule les hauteurs des lignes/tableau et positionne
les enfants avant le rendu. `render()` est réservé au dessin. Appelez `table.layout()` après
avoir modifié une cellule dʼentité fournie en externe ou après avoir muté les données chaîne publiques.
Chaque cellule logique possède une projection de contenu, donc la sélection du navigateur et la
recherche dans la page ne dupliquent pas le texte du tableau.

La sélection est détenue par la cellule plutôt que par le tableau : les cellules chaîne sont normalisées en
`Text` sélectionnable, les entités fournies reçoivent `setSelectable()` lorsquʼil est supporté,
et les tableaux Markdown héritent du même contrat. Un glissement à travers les cellules copie donc
le texte logique de la cellule une fois tandis que le Canvas reste le seul rendu visuel.
Lʼombre structurelle `role="grid"` ne capture pas les événements de pointeur des projections
de cellules. Cette propriété de feuille est ce qui maintient la sélection par glissement entre cellules,
Ctrl/Commande+C et la recherche dans la page alignés avec le texte VMT exactement une fois.

## Liste de vérification pour les mainteneurs

- Maintenez la longueur de `colWidths` alignée avec les en-têtes ; les largeurs valides sont normalisées à la largeur du Table.
- Utilisez une instance dʼentité unique par cellule logique.
- Appelez `layout()` après un changement de contenu ou de dimensions des cellules.
- Utilisez la virtualisation pour les grands ensembles de données ; `Table` est destiné aux grilles compactes.
- Gardez le libellé de la grille descriptif.
- Vérifiez la sélection par glissement à travers les en-têtes/cellules du corps après avoir changé les largeurs ou le zoom de lʼapplication.
