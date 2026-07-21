---
title: 'Composants UI'
description: 'Aperçu de la bibliothèque de composants @vectojs/ui : formulaires, conteneurs de mise en page, superpositions et contenu enrichi.'
order: 16
---

# Composants UI

Le paquet `@vectojs/ui` fournit un ensemble de composants prêts à l'emploi et de qualité production, construits par-dessus `@vectojs/core`. Chaque composant se rend entièrement sur canvas ; l'accessibilité provient de la couche shadow DOM A11y automatique.

## Tous les composants étendent `UIComponent`

<figure>
  <img src="/images/entity-hierarchy.svg" alt="Hiérarchie de classes Entity montrant tous les composants UI intégrés" class="diagram" />
  <figcaption>Chaque composant hérite de la position, l'échelle, la rotation, animate() et du système d'événements complet d'Entity.</figcaption>
</figure>

`UIComponent` étend `Entity` et ajoute un modèle de boîte partagé avec hit-testing AABB. Toutes les propriétés héritées (`x`, `y`, `width`, `height`, `opacity`, `interactive`, `animate`, `on`/`off`) fonctionnent sur chaque composant.

> **Note sur `interactive` :** La plupart des composants de formulaire (`Button`, `Input`, `Text`, etc.) définissent `this.interactive = true` dans leurs constructeurs. `Card` est décoratif par défaut — il ne devient interactif que lorsque vous passez une option `label`.

## Conteneurs de mise en page

### `Stack`

Un conteneur de type flexbox — positionne les enfants séquentiellement le long d'un axe principal :

```typescript
import { Stack } from '@vectojs/ui';
import { Button, Text } from '@vectojs/ui';

const col = new Stack({ direction: 'vertical', gap: 12 });
col.add(new Text('Hello'));
col.add(new Button('Click me'));
scene.add(col.setPosition(40, 40));
```

Prend en charge `direction`, `gap`, `align` (axe transversal) et un `wrap` optionnel avec `maxWidth`/`maxHeight`.

### `Flow`

Un `Stack` pré-câblé comme `{ direction: 'horizontal', wrap: true }` — pour les rangées de chips et les nuages de tags :

```typescript
import { Flow } from '@vectojs/ui';

const tags = new Flow({ gap: 8, maxWidth: 400 });
for (const label of ['TypeScript', 'WebGPU', 'Canvas']) {
  tags.add(new Button(label, { bg: '#1e293b', padding: 6 }));
}
scene.add(tags.setPosition(20, 20));
```

### `Card`

Un panneau d'arrière-plan arrondi — ajoutez des enfants par-dessus :

```typescript
import { Card } from '@vectojs/ui';

const card = new Card({
  width: 300,
  height: 200,
  bg: 'rgba(15, 23, 42, 0.8)',
  border: 'rgba(255, 255, 255, 0.1)',
  radius: 16,
  label: 'Settings panel', // makes it interactive + role="group"
});
card.add(toggle.setPosition(24, 24));
scene.add(card.setPosition(100, 100));
```

### `ResizablePanel`

Un système de mise en page à panneaux divisés permettant des divisions redimensionnables imbriquées (horizontales et verticales) :

```typescript
import { PanelGroup, Panel, PanelResizeHandle } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 600, height: 400 });
const leftPanel = new Panel({ minSize: 100, defaultSize: 0.3 });
const rightPanel = new Panel({ minSize: 150 });

group.addPanel(leftPanel);
group.addPanel(rightPanel);
scene.add(group);
```

## Contrôles de formulaire

Tous les contrôles de formulaire projettent un vrai nœud shadow DOM transparent. Les agents et les lecteurs d'écran interagissent via ces éléments natifs ; le canvas rend les visuels. Tous les contrôles de formulaire ont une liaison d'événement `change` standardisée et une exécution de callback `onChange`.

### `Button`

```typescript
import { Button } from '@vectojs/ui';

const btn = new Button('Save', {
  bg: '#2563eb',
  hoverBg: '#3b82f6',
  onClick: () => save(),
});
scene.add(btn.setPosition(20, 20));
```

Se dimensionne automatiquement au libellé. Projette `<button>` → `getByRole('button', { name: 'Save' })`.

### `Input` (une seule ligne)

```typescript
import { Input } from '@vectojs/ui';

const input = new Input({
  width: 300,
  placeholder: 'Search…',
  onChange: (value) => console.log(value),
});
scene.add(input.setPosition(20, 80));
```

Adossé à un **vrai `<input>` transparent** — le navigateur gère nativement toute la saisie, l'IME, le presse-papiers et l'annulation. Le canvas ne dessine que le visuel. Les soulignements de composition IME, le clignotement du caret et la sélection RTL sont tous rendus.

### `TextArea` (multi-lignes)

Même modèle qu'`Input`, adossé à un `<textarea>`. Prend en charge `lineHeight`, le défilement vertical vers le caret et `lineOfOffset(offset)` pour le mappage caret-vers-ligne.

### `Toggle`

```typescript
import { Toggle } from '@vectojs/ui';

const toggle = new Toggle({
  label: 'Dark mode',
  checked: false,
  accent: '#6366f1',
  onChange: (checked) => applyTheme(checked),
});
```

Projette `role="switch"` avec `aria-checked`. Les clics canvas et l'activation clavier passent tous deux par le callback `onChange`.

### `Checkbox`

```typescript
import { Checkbox } from '@vectojs/ui';

const cb = new Checkbox({
  label: 'Subscribe to updates',
  checked: true,
  accent: '#2563eb',
  onChange: (checked) => setSubscribed(checked),
});
```

Adossé à `<input type="checkbox">` — nativement basculable par clavier et technologie d'assistance.

### `RadioGroup`

Sélections d'options mutuellement exclusives rendues sous forme de cercles étiquetés. Prend en charge la navigation au clavier (les touches fléchées font défiler les options) et déclenche un callback `onChange` à la sélection.

```typescript
import { RadioGroup } from '@vectojs/ui';

const radio = new RadioGroup({
  options: [
    { value: 'light', label: 'Light Mode' },
    { value: 'dark', label: 'Dark Mode', disabled: false },
    { value: 'system', label: 'System Default' },
  ],
  value: 'dark', // initially selected value
  gap: 28, // vertical spacing between options, default 28
  color: '#e2e8f0', // label text color
  accent: '#00f0ff', // fill color for the selected circle
  onChange: (val) => setTheme(val),
});
scene.add(radio.setPosition(40, 40));
```

Options clés :

| Option     | Type                  | Défaut      | Description                              |
| ---------- | --------------------- | ----------- | ---------------------------------------- |
| `options`  | `RadioOption[]`       | —           | Tableau de `{ value, label, disabled? }` |
| `value`    | `string`              | `''`        | Valeur sélectionnée initialement         |
| `gap`      | `number`              | `28`        | Espace vertical entre les rangées        |
| `accent`   | `string`              | `'#00f0ff'` | Remplissage du cercle sélectionné        |
| `onChange` | `(v: string) => void` | —           | Callback au changement de sélection      |

Appelez `radio.setValue(val)` à tout moment pour changer la sélection par programme. Projette `role="radiogroup"` avec un `role="radio"` + `aria-checked` individuel sur chaque option.

### `Tabs`

Un conteneur de panneaux à onglets — rend une barre d'onglets horizontale et ne monte que l'`Entity` du volet actif dans la scène. Changer d'onglet démonte le volet précédent et monte le suivant, gardant le VMT minimal.

```typescript
import { Tabs } from '@vectojs/ui';

const settingsPane = new Stack({ direction: 'vertical', gap: 12 });
const previewPane = new Stack({ direction: 'vertical', gap: 12 });

const tabs = new Tabs({
  width: 500,
  height: 360,
  tabs: [
    { id: 'settings', label: 'Settings', content: settingsPane },
    { id: 'preview', label: 'Preview', content: previewPane },
  ],
  activeTabId: 'settings', // default: first tab
  tabHeight: 36, // height of the tab bar, default 36
  selectedColor: '#00f0ff', // active tab underline / text color
  onChange: (tabId) => console.log('Active tab:', tabId),
});
scene.add(tabs.setPosition(20, 20));

// Switch tab programmatically:
tabs.setActiveTab('preview');
```

Options clés :

| Option          | Type                   | Défaut         | Description                             |
| --------------- | ---------------------- | -------------- | --------------------------------------- |
| `tabs`          | `TabItem[]`            | —              | `{ id, label, content: Entity }`        |
| `activeTabId`   | `string`               | premier onglet | Onglet visible initialement             |
| `tabHeight`     | `number`               | `36`           | Hauteur en pixels de la rangée de barre |
| `selectedColor` | `string`               | `'#00f0ff'`    | Couleur d'accent de l'onglet actif      |
| `onChange`      | `(id: string) => void` | —              | Se déclenche au changement d'onglet     |

Projette `role="tablist"` sur la barre et `role="tab"` + `aria-selected` sur chaque bouton. La zone de contenu obtient `role="tabpanel"`.

### `Slider`

```typescript
import { Slider } from '@vectojs/ui';

const slider = new Slider({ min: 0, max: 100, value: 50, width: 200 });
slider.on('change', (e) => console.log(e.value));
```

Curseur (thumb) déplaçable ; valeur arrondie à l'entier le plus proche. Projette `role="slider"`.

### `Dropdown`

```typescript
import { Dropdown } from '@vectojs/ui';

const dd = new Dropdown(['Small', 'Medium', 'Large'], { value: 'Medium' });
dd.on('change', (e) => setSize(e.value));
scene.add(dd.setPosition(20, 160));
```

Ouvre un menu de superposition flottant via `scene.showOverlay()` ; se ferme à la sélection ou avec Échap. Câblage ARIA combobox/listbox complet.

## Texte & Typographie

### `Text`

Texte multi-lignes avec retour à la ligne et séparation de mise en page froide/chaude :

```typescript
import { Text } from '@vectojs/ui';

const label = new Text('Hello, VectoJS!', {
  font: '600 18px "Outfit", sans-serif',
  color: '#e2e8f0',
  maxWidth: 400,
  lineHeight: 28,
});
```

- `setText(text)` — re-mesure (passe froide).
- `append(text)` — chemin de streaming ; ne re-mesure que le dernier paragraphe modifié.
- `setMaxWidth(w)` — reflow uniquement, pas de re-mesure (passe chaude).

### `RichText`

Texte en ligne multi-styles avec des runs gras/italique/couleur/taille, des zones actives de liens et des formes d'exclusion :

```typescript
import { RichText } from '@vectojs/ui';

const rich = new RichText(
  [
    { text: 'Zero DOM, ' },
    { text: 'accessible', style: { bold: true, color: '#38bdf8' } },
    { text: ' and agent-native.' },
  ],
  { maxWidth: 500 },
);
```

Pour le streaming : utilisez `appendSpans(newSpans)` — O(paragraphe modifié).

## Superpositions & Viewports

### `Overlay`

Classe de base pour les superpositions à positionnement absolu. Ancre le contenu flottant par rapport aux entités cibles avec détection automatique de collision avec le viewport et retournement directionnel :

```typescript
import { Overlay } from '@vectojs/ui';

const overlay = new Overlay({
  target: button,
  content: popoverCard,
  placement: 'bottom-start',
});
```

### `Tooltip`

Libellés déclenchés au survol, ancrés par rapport aux entités cibles :

```typescript
import { Tooltip } from '@vectojs/ui';

const tooltip = new Tooltip({
  target: helpIcon,
  content: 'More information',
  delay: 200,
});
```

### `Popover`

Superpositions déclenchées au clic contenant un contenu de mise en page enfant arbitraire :

```typescript
import { Popover } from '@vectojs/ui';

const popover = new Popover({
  target: settingsButton,
  width: 200,
  height: 150,
});
```

### `ContextMenu`

Menus déclenchés au clic droit prenant en charge les raccourcis clavier, icônes, séparateurs et sous-menus imbriqués :

```typescript
import { ContextMenu } from '@vectojs/ui';

const menu = new ContextMenu({
  items: [
    { label: 'Undo', shortcut: 'Ctrl+Z', onClick: () => undo() },
    { separator: true },
    { label: 'Settings', children: [{ label: 'Export', onClick: () => export() }] }
  ]
});
scene.add(menu);
```

### `VirtualList`

Un conteneur de liste haute performance qui ne rend que les éléments dans le viewport, prenant en charge les hauteurs de rangée fixes et variables :

```typescript
import { VirtualList } from '@vectojs/ui';

const list = new VirtualList({
  width: 300,
  height: 500,
  itemHeight: (idx) => measuredHeights[idx], // or number for fixed heights
  itemRenderer: (idx) => createListItemEntity(idx),
});
```

### `TreeView`

Un navigateur de nœuds arborescents de type répertoire. Prend en charge le chargement paresseux asynchrone des éléments enfants à l'expansion d'un nœud :

```typescript
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  nodes: [
    {
      id: 'src',
      label: 'src',
      children: async () => [{ id: 'index.ts', label: 'index.ts' }],
    },
  ],
});
```

### `Modal`

```typescript
import { Modal } from '@vectojs/ui';

const modal = new Modal('Confirm Delete', {
  modalWidth: 420,
  modalHeight: 200,
});
scene.showOverlay(modal);

// From within: modal.close() animates and self-removes.
```

Apparition avec mise à l'échelle animée par ressort. Comprend un bouton de fermeture intégré.

### `ScrollView`

Un viewport rogné avec défilement à physique de ressort :

```typescript
import { ScrollView } from '@vectojs/ui';

const feed = new ScrollView({ width: 360, height: 600 });
for (const item of items) feed.add(new Card({ ... }));
scene.add(feed.setPosition(20, 20));
feed.scrollToBottom();  // e.g. for a chat log
```

La molette, le glisser-tactile et le `scrollTo(y)` programmatique sont tous pris en charge.

## Contenu enrichi

### `Markdown`

Rend une chaîne Markdown dans un sous-arbre du VMT — titres, paragraphes, blocs de code avec coloration syntaxique, tableaux, citations, liens et formatage en ligne :

```typescript
import { Markdown } from '@vectojs/markdown';

const doc = new Markdown('## Hello\n\nThis is **bold** and `code`.', {
  maxWidth: 700,
});
scene.add(doc.setPosition(40, 40));
```

Pour le streaming LLM, utilisez `appendMarkdown(chunk)` — il ré-analyse lexicalement la source complète, puis compare les tokens et réutilise le préfixe rendu inchangé au lieu de reconstruire chaque entité.

```typescript
const md = new Markdown('', { maxWidth: 600 });
scene.add(md);
for await (const token of llmStream) {
  md.appendMarkdown(token);
}
```

### `ProgressBar`

Un indicateur de progression en lecture seule — rend un arrière-plan de piste arrondi et une barre d'accent remplie proportionnelle à `value`. Affiche optionnellement un libellé de pourcentage centré.

```typescript
import { ProgressBar } from '@vectojs/ui';

const progress = new ProgressBar({
  value: 0.45, // 0–1 fraction
  width: 300,
  height: 16,
  showText: true, // render '45%' centered
  accent: '#00f0ff', // fill color
});
scene.add(progress.setPosition(40, 40));

// Update during an async operation:
for await (const chunk of stream) {
  progress.setValue(bytesReceived / totalBytes);
}
```

Options clés :

| Option     | Type      | Défaut                    | Description                     |
| ---------- | --------- | ------------------------- | ------------------------------- |
| `value`    | `number`  | —                         | Fraction de progression `0`–`1` |
| `width`    | `number`  | `200`                     | Largeur totale de la piste      |
| `height`   | `number`  | `16`                      | Hauteur de la piste             |
| `radius`   | `number`  | `8`                       | Rayon des coins                 |
| `bg`       | `string`  | `'rgba(255,255,255,0.1)'` | Arrière-plan de la piste        |
| `accent`   | `string`  | `'#00f0ff'`               | Couleur de la barre remplie     |
| `showText` | `boolean` | `false`                   | Afficher le libellé `"45%"`     |

Appelez `progress.setValue(fraction)` pour mettre à jour — la valeur est bornée à `[0, 1]` et ne déclenche un redessin que lorsque la valeur change réellement. Projette `role="progressbar"` avec `aria-valuenow` défini au pourcentage arrondi.

<figure>
  <img src="/images/component-gallery.svg" alt="Galerie de composants VectoJS montrant Button, Text, Input, Card, ScrollView, Slider, Toggle, Checkbox et Dropdown" class="diagram" />
  <figcaption>Tous les composants se rendent entièrement sur canvas. Les nœuds shadow DOM (invisibles) fournissent le support natif d'accessibilité et d'automatisation.</figcaption>
</figure>

Consultez la [référence des composants UI](/reference/ui-components/) pour les signatures d'options complètes.
