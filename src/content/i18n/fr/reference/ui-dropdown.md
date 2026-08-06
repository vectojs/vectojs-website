---
title: 'UI: Dropdown'
description: 'Contrôle de type combobox avec une liste superposée et une navigation au clavier.'
order: 27
---

# `Dropdown`

`Dropdown` enveloppe un bouton canvas, projette `role="combobox"` et ouvre une liste superposée.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Dropdown</span></div>
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Dropdown" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Ouvrez-le avec le pointeur ou le clavier ; le menu se monte via le chemin de superposition de la scène.</figcaption>
</figure>

## Exemple minimal

```ts
import { Dropdown } from '@vectojs/ui';

const backend = new Dropdown(['Canvas', 'WebGL', 'WebGPU'], {
  label: 'Renderer backend',
  width: 220,
  onChange: (value) => setBackend(value),
});
```

> **Définissez `label`.** Un `role=\"combobox\"` sans nom accessible est annoncé comme simple "combobox" (WCAG 4.1.2); la valeur sélectionnée seule ne dit pas à quoi sert le contrôle. Toute étiquette visuelle dessinée sur le canvas n'atteint pas la couche sémantique, alors passez-la ici aussi. Disponible depuis `@vectojs/ui@2.2.0`.

Le déclencheur fermé prend `bg`/`color` ; les lignes d'option du menu ouvert prennent leurs cinq propres props, toutes ajoutées en 2.7.0 :

| Prop              | Défaut                      | S'applique à                          |
| ----------------- | --------------------------- | ------------------------------------- |
| `menuBg`          | `'rgba(15, 23, 42, 0.95)'`  | chaque ligne d'option                 |
| `menuColor`       | `'#fff'`                    | le texte des lignes d'option          |
| `menuSelectedBg`  | `'rgba(0, 240, 255, 0.25)'` | la ligne sélectionnée                 |
| `menuHighlightBg` | `'rgba(0, 240, 255, 0.4)'`  | la ligne surlignée au clavier         |
| `focusColor`      | `'#00f0ff'`                 | le déclencheur et les lignes d'option |

```ts
new Dropdown(['1x', '1.5x', '2x'], {
  label: 'Playback rate',
  bg: 'rgba(18, 23, 34, 0.98)',
  menuBg: 'rgba(18, 23, 34, 0.98)',
  menuColor: '#e2e8f0',
  menuSelectedBg: 'rgba(244, 63, 94, 0.30)',
  menuHighlightBg: 'rgba(244, 63, 94, 0.55)',
  focusColor: '#60a5fa',
});
```

Avant leur existence, le déclencheur était thématisable mais pas le menu, donc une liste déroulante stylée pour une palette claire ou chaude ouvrait un panneau ardoise sombre avec une sélection cyan — ce qui ressemble à un bug de rendu plutôt qu'à un choix de style.

Deux choses à savoir lors du choix des valeurs :

- **Les deux états de ligne peuvent s'appliquer en même temps**, et ouvrir le menu surligne la ligne sélectionnée, donc `menuHighlightBg` doit se lire comme le plus fort des deux.
- **Les lignes d'option sont elles-mêmes focusables** (`role="option"`), donc l'anneau `focusColor` est dessiné _sur_ une ligne surlignée. Gardez au moins 3:1 (WCAG SC 1.4.11) entre l'anneau et `menuHighlightBg` — pousser l'alpha du surlignage assez loin pour le séparer de `menuSelectedBg` peut discrètement faire passer l'anneau sous ce seuil.

Les fonds de menu quasi opaques sont généralement les bons : un menu translucide sur un contenu canvas animé reste lisible par contraste mais se perçoit comme du bruit.

## Liste de vérification pour les mainteneurs

- Maintenez les métadonnées `expanded`, `controls` et `activedescendant` synchronisées.
- Fermez la superposition lors dʼun clic à lʼextérieur et avec la touche Échap.
- Testez les touches Flèche Haut, Flèche Bas, Entrée, Espace et Échap.
