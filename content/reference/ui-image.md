+++
title = "UI: Image"
description = "Canvas image component with ImageSource (url/blob/bitmap), DecodedImage, semanticMode auto, and Visual Flattening trust boundary."
weight = 19
+++

# `Image`

`Image` draws an asynchronously loaded bitmap to canvas and projects a semantic
node that stays crawlable and accessible. The canvas owns pixels; the shadow DOM
owns the accessible name — either a real `<img src alt>` or a
`<div role="img" aria-label>` depending on `ImageSource` and `semanticMode`.

`@vectojs/ui` has no CapGlyph dependency. CapGlyph lives in the application
layer as an `imageResolver` adapter — the package stays generic.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Image</span></div>
  <iframe src="/sandbox/ui/component.html?name=image&v=core-1.39.0-ui-2.20.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Image live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>The placeholder paints until the image load callback marks the scene dirty.</figcaption>
</figure>

## Minimal example

```ts
import { Image } from '@vectojs/ui';

const logo = new Image('/logo.svg', {
  width: 160,
  height: 80,
  alt: 'Vecto logo',
  onLoad: () => scene.markDirty(),
});

// string is shorthand for { kind: 'url', url: '/logo.svg' }
```

## Source model — `ImageSource`, `normalizeSource`, `DecodedImage`

`Image` accepts three backing kinds behind one union. A plain `string` remains
backward-compatible and is normalized to `{ kind: 'url' }`.

```ts
import type { ImageSource, NormalizedImageSource, DecodedImage } from '@vectojs/ui';

type ImageSource =
  | string
  | { kind: 'url'; url: string }
  | { kind: 'blob'; blob: Blob }
  | { kind: 'bitmap'; bitmap: ImageBitmap };

type NormalizedImageSource =
  | { kind: 'url'; url: string }
  | { kind: 'blob'; blob: Blob }
  | { kind: 'bitmap'; bitmap: ImageBitmap };

function normalizeSource(src: ImageSource): NormalizedImageSource {
  return typeof src === 'string' ? { kind: 'url', url: src } : src;
}

interface DecodedImage {
  source: CanvasImageSource; // what IRenderer.drawImage consumes
  width: number; // intrinsic width, px
  height: number; // intrinsic height, px
  dispose?: () => void; // release ImageBitmap / revoke blob: URL
}
```

| `kind`           | Decode path                                                                                                                             | Ownership                                                                                                                | Typical use                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `string` / `url` | `HTMLImageElement` (`new Image().src = url`)                                                                                            | Browser owns bitmap; `dispose` is a no-op.                                                                               | Public CDN / same-origin assets, Markdown `![](url)` default.            |
| `blob`           | `createImageBitmap(blob)` → `ImageBitmap`; fallback `URL.createObjectURL(blob)` + `HTMLImageElement` when `createImageBitmap` is absent | Package owns revocation: `dispose` closes the `ImageBitmap` or revokes the object URL.                                   | Fetched bytes (Derived Raster, `capglyph:` adapter), drag-dropped files. |
| `bitmap`         | Used directly; no decode                                                                                                                | **Caller owns** the `ImageBitmap` — `dispose` is intentionally absent so a shared bitmap is not closed under the caller. | App-decoded image, OffscreenCanvas, WebCodecs.                           |

Decode is decoupled: `renderBitmap` depends only on `decoded.width/height` +
`decoded.source`, never on `HTMLImageElement` directly. `computeImageFit` runs
on `decoded.width/height` and `r.drawImage(decoded.source, dx, dy, dw, dh)` paints
the result. Replaces `setSource(next)` cancel the in-flight generation and
dispose the previous `DecodedImage`.

```ts
// url — classic path
const a = new Image('/avatar.jpg', { width: 96, height: 96, alt: 'Avatar' });

// blob — fetched bytes without ever exposing a blob: URL to the a11y tree
const blob = await fetch('/derived/avatar-96.webp').then((r) => r.blob());
const b = new Image({ kind: 'blob', blob }, { width: 96, height: 96, alt: 'Avatar' });

// bitmap — app owns the ImageBitmap
const bmp = await createImageBitmap(blob);
const c = new Image({ kind: 'bitmap', bitmap: bmp }, { width: 96, height: 96, alt: 'Avatar' });
c.destroy(); // disposes internal state; does NOT close the external bmp

// swap source at runtime — generation + dispose handled internally
c.setSource('/avatar@2x.jpg');
```

`imageSource` / `decodedImage` / `src` accessors:

- `image.imageSource` — original `ImageSource` as supplied.
- `image.decodedImage` — `DecodedImage | null` while loading.
- `image.src` — compat getter: `url` string or `''` for non-url sources; setter is `setSource(string)`.

## Semantic projection — `semanticMode`

`semanticMode` decides the shadow node. Default `'auto'` is the only mode most
callers need — it keeps `blob:`/`bitmap:` bytes off the DOM `src` attribute and
avoids the `blob:` URL lifecycle entirely.

| `semanticMode`   | `ImageSource`     | Shadow node                                     | Attributes                       | When to use                                                                                   |
| ---------------- | ----------------- | ----------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| `auto` (default) | `url`             | `<img>`                                         | `src`, `alt`, `label`            | Public images — crawlable and accessible.                                                     |
| `auto`           | `blob` / `bitmap` | `<div>`                                         | `role="img"`, `aria-label = alt` | Derived Raster / CapGlyph — no `blob:` URL is synthesized.                                    |
| `img`            | `url`             | `<img>`                                         | `src`, `alt`                     | Force `<img>` when you have a real URL.                                                       |
| `img`            | `blob` / `bitmap` | `<div role="img">` + `console.warn` (throttled) | `aria-label`                     | Fallback: never synthesizes a `blob:` URL; provide a `url` source if `<img src>` is required. |
| `role`           | any               | `<div>`                                         | `role="img"`, `aria-label`       | Always hide the URL, even for `url` sources.                                                  |

```ts
// auto — url becomes <img>, blob/bitmap becomes role="img"
new Image('/cover.jpg', { width: 640, height: 360, alt: 'Cover' });
new Image({ kind: 'bitmap', bitmap }, { width: 640, height: 360, alt: 'Cover' });

// explicit overrides
new Image('/cover.jpg', {
  width: 640,
  height: 360,
  alt: 'Cover',
  semanticMode: 'role',
});
new Image({ kind: 'blob', blob }, { width: 64, height: 64, alt: '', semanticMode: 'img' });
// -> warns once, falls back to role="img"
```

`alt` setters and `semanticMode` setters both mark the scene dirty so
`Scene.syncA11y` re-projects on the next frame. `alt` for `<img>` maps to the
`alt` attribute; for `role="img"` it maps to `aria-label`. An empty `alt` still
projects the node (decorative images remain discoverable by automation; omit the
entity entirely if it must be hidden).

Trust note: `role` mode (and `auto` for non-url) **never writes raw
`blob`/`bitmap` bytes into the DOM `src`**. The decoded bitmap is a
canvas-only `CanvasImageSource`; the URL/request never enters the a11y tree.

## Visual Flattening & trust boundary — cookbook

Canvas already collapses the DOM surface: a canvas image has **no native
hit-target**, no native right-click → _Save image as_, and no `<img src>` to
scrape from the render tree. That is Visual Flattening. It eliminates the
canvas hit-target and context-menu entry, but it does **not** by itself remove
the URL from the a11y projection — `Image` would still project
`<img src alt>` for a `url` source. Pair flattening with `semanticMode`
when the URL itself must not appear in the shadow tree.

| Concern                           | What is guaranteed                                                                                                                                                                                        | What is NOT guaranteed                                                                                                                                       | Who owns it                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Master asset                      | **Never enters the client.** Only a Derived Raster (resized, watermarked, format-converted) is fetched/decoded on the client.                                                                             | CDN does not serve the Master even if the Derived URL is known; Master stays server-side.                                                                    | Server / asset pipeline                     |
| CapGlyph                          | **Signal / credential / provenance layer** for the Derived Raster. A `capglyph:` URI carries a capability token, origin proof, and watermark parameters that the server validates before returning bytes. | Not a resize service and not a URL obfuscator — it does not hide the Derived URL and does not re-encode on the fly.                                          | Application adapter (outside `@vectojs/*`)  |
| Visual Flattening                 | **Removes canvas hit-target and native context-menu entry.** The image is `drawImage` pixels; there is no `<img>` in the render tree to hit-test or save.                                                 | Does not remove the shadow `<img src>` when `semanticMode` is `auto`+`url` or `img`; a11y consumers still see the URL unless `role` is chosen.               | `@vectojs/core` + `@vectojs/ui` canvas path |
| `semanticMode: 'auto'` / `'role'` | **Keeps non-url bytes off the DOM.** `blob`/`bitmap` → `<div role="img" aria-label>`; no `blob:` URL is synthesized. `role` also hides a `url` string from the shadow tree.                               | Does not encrypt the Derived bytes in memory and does not prevent a canvas `toDataURL` screenshot of the painted pixels — canvas pixels are always readable. | `@vectojs/ui` `Image.getA11yAttributes()`   |
| `getA11yAttributes()`             | Returns the single source of truth for the shadow node; `Scene.syncA11y` is the only consumer.                                                                                                            | Not a security boundary — it is an accessibility projection; automation that reads the canvas can still extract pixels.                                      | `@vectojs/ui`                               |

Guidance:

- Serve only Derived Rasters to the client; keep the Master server-side. CapGlyph
  is how the client proves it may fetch a specific Derived variant — it is not
  how the client asks for arbitrary sizes.
- In `@vectojs/ui`, use `new Image({ kind: 'blob'|'bitmap', ... }, { semanticMode: 'auto' })`
  for protected content. `auto` already maps to `role="img"`; no `ProtectedImage`
  subclass is needed.
- In `@vectojs/markdown`, supply an `imageResolver` adapter (next section) rather
  than forking the package. Do not add `CapGlyph` imports to `@vectojs/markdown`
  or `@vectojs/ui`.
- If you need **both** a crawlable `<img src>` and protection, serve a public
  Derived URL and keep the Master private — then `semanticMode: 'auto'` is
  correct. `role` is for cases where even the Derived URL must not appear in
  the a11y tree.

## Markdown integration — `imageResolver` + CapGlyph adapter

`@vectojs/markdown` is generic: it maps a Markdown `![](src)` string to an
`ImageSource` through one injectable function. The package ships with an
identity default and no CapGlyph import.

```ts
import type { ImageSource } from '@vectojs/ui';

type MarkdownImageResolver = (src: string) => ImageSource | Promise<ImageSource>;

const defaultMarkdownImageResolver: MarkdownImageResolver = (src) => ({
  kind: 'url',
  url: src,
});

interface MarkdownOptions {
  imageResolver?: MarkdownImageResolver; // default: defaultMarkdownImageResolver
}
```

- Block images construct a real `new Image(resolvedSource, { width, height, alt })`.
- Inline images (inside a paragraph run) decode through the same `blob`/`bitmap`
  paths into an `InlineImageRaster` entry (`source?: CanvasImageSource`,
  `dispose?`).
- Sync and async resolvers both work; `paragraphImage` keeps a guessed 800×480
  box until the resolver settles or the raster decodes, then reflows and
  `scene.markDirty()`.
- `imageResolver` threads through `collectSpans` / `renderInlineToRichText` so
  headings, table cells, and strikethrough-delimited runs all resolve the same
  way.

CapGlyph stays an **application adapter**. The shape below lives in the app, not
in `@vectojs/markdown`:

```ts
import type { MarkdownImageResolver } from '@vectojs/markdown';

const imageResolver: MarkdownImageResolver = async (src) => {
  if (!src.startsWith('capglyph:')) return { kind: 'url', url: src };

  // 1. Parse the capability URI — app-specific; carries credential + provenance
  //    + watermark parameters (e.g. capped size, expiry). Never the Master.
  const cap = parseCapGlyph(src); // -> { endpoint, token, variant }

  // 2. Fetch the Derived Raster — server validates token, returns watermarked bytes
  const res = await fetch(cap.endpoint, {
    headers: { Authorization: `Bearer ${cap.token}` },
  });
  if (!res.ok) throw new Error(`CapGlyph fetch failed: ${res.status}`);
  const blob = await res.blob();

  // 3. Decode to ImageBitmap off the main-thread image path
  //    (falls back to object-URL + HTMLImageElement internally when
  //    createImageBitmap is unavailable, e.g. some test runners / SSR)
  const bitmap = await createImageBitmap(blob);

  // 4. Return as bitmap — Image / InlineImageRaster use it directly;
  //    ownership stays with the caller, no blob: URL enters the a11y tree
  return { kind: 'bitmap', bitmap };
};

// Wire it once at the document root
const md = new Markdown(source, {
  maxWidth: 640,
  imageResolver,
});
```

SSR / worker test runners: the `blob`/`bitmap` decode paths do not require
`globalThis.Image`; an inline raster that cannot decode marks `failed` and the
span arm falls back to alt text, so the document keeps layout without a broken
image gap.

## Fitting, focal cropping, and rounded corners

`fit` controls how the loaded bitmap maps into the `width` × `height` box, and
`focalPoint` refines `'cover'` cropping — both 2.18.0+.

| `fit`       | Behavior                                                                    |
| ----------- | --------------------------------------------------------------------------- |
| `'fill'`    | Stretch to the box (default, legacy behavior).                              |
| `'cover'`   | Preserve aspect ratio, fill the box, crop the overflow around `focalPoint`. |
| `'contain'` | Preserve aspect ratio, fit the whole bitmap inside the box (centered).      |

`focalPoint` is `{ x, y }` with each axis in `0..1` — `0` is top/left, `1` is
bottom/right, default `{ x: 0.5, y: 0.5 }`; only `'cover'` reads it, and values
outside `[0, 1]` are clamped. `radius` now rounds the loaded bitmap's corners,
not just the placeholder, so a rounded avatar with `fit: 'cover'` clips the
cropped overflow to the same silhouette.

```ts
import { Image, type ImageFit, type ImageFocalPoint } from '@vectojs/ui';

const avatar = new Image('/avatar.jpg', {
  width: 96,
  height: 96,
  fit: 'cover',
  focalPoint: { x: 0.5, y: 0.25 }, // bias toward the top of the frame
  radius: 48, // circle-crop the loaded bitmap
  alt: 'Profile photo',
});
```

## Maintainer checklist

- Always provide `width` and `height` — the canvas box and culling need them.
- Provide meaningful `alt` text for non-decorative images; it becomes `alt` or
  `aria-label` depending on `semanticMode`.
- In `onDemand` scenes, call `scene.markDirty()` from `onLoad`.
- The options object is **required** — `new Image(src)` without options throws.
- Pick `semanticMode` deliberately: `auto` (default) for most content, `role`
  when the URL must not appear in the a11y tree, `img` only when a real URL
  should stay crawlable. `img` + non-url falls back to `role` with a throttled
  warning and never synthesizes a `blob:` URL.
- A cross-origin `src` (e.g. a CDN SVG without CORS headers) taints the
  canvas and breaks every later `getImageData`/`toDataURL`. Inline the asset
  as a `data:image/svg+xml` URL for same-origin-safe drawing.
- Keep Masters server-side. CapGlyph is a credential/provenance signal for a
  Derived Raster, not a client-side resize service — the trust boundary is
  "Master never enters client."
- Release external `ImageBitmap`s you own; `Image` does not close a
  `{ kind: 'bitmap' }` bitmap on `dispose`/`destroy`. `blob` bitmaps created
  internally are disposed automatically.
