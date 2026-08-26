/**
 * VectoJS homepage hero — dogfooded entirely in VectoJS.
 *
 * One <canvas>, zero per-element DOM. A glowing neural field (hundreds of real
 * entities) sits behind an elegant serif title, a tagline, two CTAs, and a live
 * glass stats card. The card's contrast IS the pitch: hundreds of canvas
 * entities, a handful of real DOM nodes. The two buttons are real, operable
 * ARIA shadow nodes (Playwright / an AI agent can getByRole().click() them).
 */
import { Scene, Entity, LayoutEngine, type GlyphMeasurer, type IRenderer } from '@vectojs/core';
import { Button } from '@vectojs/ui';
import { fillRect } from './entities';
import { keepSceneLive } from './keep-live';

const GITHUB_URL = 'https://github.com/vectojs/vectojs';
const TITLE_FONT = '"Playfair Display", Georgia, serif';

const pointer = { x: -1e9, y: -1e9 };
const field = { w: 1280, h: 760 };

/**
 * Every color this scene draws, keyed by concern. Two hand-tuned palettes
 * (not read from the CSS custom properties) — a bespoke illustration like
 * this wants deliberate per-theme color decisions, not a mechanical token
 * remap: e.g. the neuron's warm ember core needs to deepen for contrast
 * against the light theme's pale pastel wash, where "the same color, just
 * less transparent" would still read as washed out.
 */
interface HeroPalette {
  /** 3-stop top-to-bottom title fill gradient. */
  titleGradient: [string, string, string];
  /** Each star picks one of these by index at construction. */
  starColors: [string, string, string];
  gridLine: string;
  /** Neuron filament stroke, as an "r, g, b" triplet so alpha can vary per-draw. */
  filamentRgb: string;
  neuronHalo: string;
  neuronCoreWarm: string;
  neuronCoreHot: string;
  subtitle: string;
  statsCardBg: string;
  statsCardBorder: string;
  statsLabel: string;
  statsEntities: string;
  statsDomNodes: string;
  statsFps: string;
  statsHint: string;
  demosBtnBg: string;
  demosBtnHoverBg: string;
  demosBtnColor: string;
  githubBtnBg: string;
  githubBtnHoverBg: string;
  githubBtnColor: string;
}

const DARK_PALETTE: HeroPalette = {
  titleGradient: ['#ffffff', '#dbe6fb', '#8ea6d6'],
  starColors: ['#cfe0ff', '#5b9cff', '#a7b8e8'],
  gridLine: 'rgba(120, 150, 210, 0.035)',
  filamentRgb: '91, 156, 255',
  neuronHalo: '#3b82f6',
  neuronCoreWarm: '#fcd9a8',
  neuronCoreHot: '#ffffff',
  subtitle: '#aeb9d4',
  statsCardBg: 'rgba(11, 17, 33, 0.62)',
  statsCardBorder: 'rgba(91, 156, 255, 0.22)',
  statsLabel: 'rgba(148, 163, 184, 0.85)',
  statsEntities: '#ffffff',
  statsDomNodes: '#7cb3ff',
  statsFps: '#4ade80',
  statsHint: 'rgba(148, 163, 184, 0.7)',
  demosBtnBg: '#2563eb',
  demosBtnHoverBg: '#3b82f6',
  demosBtnColor: '#ffffff',
  githubBtnBg: 'rgba(255, 255, 255, 0.06)',
  githubBtnHoverBg: 'rgba(255, 255, 255, 0.13)',
  githubBtnColor: '#ffffff',
};

/** Warm ember dots on a cool pastel field — the light theme's complementary
 * counterpart to the dark theme's cool-on-cool look, tuned so nothing pale
 * (white, cream, sky) washes out against the mint/pink/cyan background wash. */
const LIGHT_PALETTE: HeroPalette = {
  titleGradient: ['#3730a3', '#4f46e5', '#0891b2'],
  starColors: ['#6366f1', '#0891b2', '#a855f7'],
  gridLine: 'rgba(99, 102, 241, 0.06)',
  filamentRgb: '79, 70, 229',
  neuronHalo: '#3b82f6',
  neuronCoreWarm: '#fbbf24',
  neuronCoreHot: '#f97316',
  subtitle: '#475569',
  statsCardBg: 'rgba(255, 255, 255, 0.75)',
  statsCardBorder: 'rgba(99, 102, 241, 0.25)',
  statsLabel: 'rgba(71, 85, 105, 0.85)',
  statsEntities: '#0f172a',
  statsDomNodes: '#2563eb',
  statsFps: '#059669',
  statsHint: 'rgba(71, 85, 105, 0.7)',
  demosBtnBg: '#2563eb',
  demosBtnHoverBg: '#3b82f6',
  demosBtnColor: '#ffffff',
  githubBtnBg: 'rgba(15, 23, 42, 0.06)',
  githubBtnHoverBg: 'rgba(15, 23, 42, 0.12)',
  githubBtnColor: '#1e293b',
};

/** Mutable so every entity's render() can pick up a theme change by just
 * reading this reference again next frame — no per-entity update pass needed. */
let theme: HeroPalette = DARK_PALETTE;

/** A drifting, twinkling background star — a real entity (so the count is honest). */
class Star extends Entity {
  private vx: number;
  private vy: number;
  private r: number;
  private phase: number;
  private speed: number;
  private base: number;
  /** Index into the active theme's starColors — resolved at render time so a
      theme change recolors every star without touching the instances. */
  private tintIndex: 0 | 1 | 2;

  constructor() {
    super();
    this.interactive = false;
    this.r = 0.4 + Math.random() * 1.5;
    this.vx = (Math.random() - 0.5) * 0.06;
    this.vy = (Math.random() - 0.5) * 0.06;
    this.phase = Math.random() * Math.PI * 2;
    this.speed = 0.0008 + Math.random() * 0.0014;
    this.base = 0.25 + Math.random() * 0.5;
    this.tintIndex = Math.random() < 0.7 ? 0 : Math.random() < 0.5 ? 1 : 2;
  }

  scatter(): void {
    this.x = Math.random() * field.w;
    this.y = Math.random() * field.h;
  }

  getBounds(): null {
    return null;
  }
  isPointInside(): boolean {
    return false;
  }

  update(dt: number, time: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < 0) this.x += field.w;
    else if (this.x > field.w) this.x -= field.w;
    if (this.y < 0) this.y += field.h;
    else if (this.y > field.h) this.y -= field.h;
    // subtle parallax toward the pointer
    const dx = pointer.x - this.x;
    const dy = pointer.y - this.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 26000) {
      this.x += (dx / 1600) * (this.r * 0.4);
      this.y += (dy / 1600) * (this.r * 0.4);
    }
    this.phase += this.speed * dt;
    void time;
  }

  render(r: IRenderer): void {
    const a = this.base * (0.55 + 0.45 * Math.sin(this.phase));
    r.fillCircle(0, 0, this.r, theme.starColors[this.tintIndex], a);
  }
}

/** A glowing "neuron": warm core, blue halo, radiating filaments — the synapse look. */
class Neuron extends Entity {
  private filaments: Array<{ dx: number; dy: number; mx: number; my: number }> = [];
  private radius: number;
  private phase = Math.random() * Math.PI * 2;
  // home is a fraction of the field box so it repositions on resize
  constructor(
    private fx: number,
    private fy: number,
    scale: number,
  ) {
    super();
    this.interactive = false;
    this.radius = 40 * scale;
    const n = 11 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const len = (110 + Math.random() * 200) * scale;
      const mx = Math.cos(ang) * len * 0.5 + (Math.random() - 0.5) * 44;
      const my = Math.sin(ang) * len * 0.5 + (Math.random() - 0.5) * 44;
      this.filaments.push({
        dx: Math.cos(ang) * len,
        dy: Math.sin(ang) * len,
        mx,
        my,
      });
    }
  }

  place(): void {
    this.x = this.fx * field.w;
    this.y = this.fy * field.h;
  }

  getBounds(): null {
    return null;
  }
  isPointInside(): boolean {
    return false;
  }

  update(dt: number): void {
    this.phase += 0.0012 * dt;
  }

  render(r: IRenderer): void {
    const pulse = 0.7 + 0.3 * Math.sin(this.phase);
    // Filaments: a gentle quadratic curve out to each endpoint, with an end node.
    for (const f of this.filaments) {
      r.beginPath();
      r.moveTo(0, 0);
      // approximate a curve with two segments via the mid control point
      r.lineTo(f.mx, f.my);
      r.lineTo(f.dx, f.dy);
      r.stroke(`rgba(${theme.filamentRgb}, ${0.06 * pulse})`, 1);
      r.fillCircle(f.dx, f.dy, 1.6, theme.starColors[1], 0.5 * pulse);
    }
    // Blue halo: layered translucent circles (fake bloom).
    for (let i = 8; i >= 1; i--) {
      const rr = (this.radius * i) / 2.0;
      r.fillCircle(0, 0, rr, theme.neuronHalo, (0.06 * pulse * (9 - i)) / 8);
    }
    // Warm ember core.
    r.fillCircle(0, 0, this.radius * 0.5, theme.neuronCoreWarm, 0.55 * pulse);
    r.fillCircle(0, 0, this.radius * 0.24, theme.neuronCoreHot, 0.9 * pulse);
  }
}

/** Background container: a faint grid plus the stars + neurons (added as children). */
class NeuralField extends Entity {
  public stars: Star[] = [];
  public neurons: Neuron[] = [];

  constructor(starCount: number) {
    super();
    this.interactive = false;
    for (let i = 0; i < starCount; i++) {
      const s = new Star();
      this.stars.push(s);
      this.add(s);
    }
    const spots: Array<[number, number, number]> = [
      [0.82, 0.26, 1.5],
      [0.16, 0.7, 1.3],
      [0.9, 0.82, 0.9],
      [0.08, 0.2, 0.8],
      [0.62, 0.92, 0.7],
      [0.4, 0.12, 0.6],
    ];
    for (const [fx, fy, sc] of spots) {
      const nu = new Neuron(fx, fy, sc);
      this.neurons.push(nu);
      this.add(nu);
    }
  }

  place(): void {
    for (const s of this.stars) s.scatter();
    for (const n of this.neurons) n.place();
  }

  count(): number {
    return this.stars.length + this.neurons.length;
  }

  getBounds(): null {
    return null;
  }
  isPointInside(): boolean {
    return false;
  }

  render(r: IRenderer): void {
    // Faint square grid.
    const step = 64;
    for (let x = 0; x <= field.w; x += step) {
      r.beginPath();
      r.moveTo(x, 0);
      r.lineTo(x, field.h);
      r.stroke(theme.gridLine, 1);
    }
    for (let y = 0; y <= field.h; y += step) {
      r.beginPath();
      r.moveTo(0, y);
      r.lineTo(field.w, y);
      r.stroke(theme.gridLine, 1);
    }
  }
}

/** One title glyph: an elegant serif letter filled with a white→steel gradient. */
class TitleGlyph extends Entity {
  constructor(
    private char: string,
    public size: number,
  ) {
    super();
    this.interactive = false;
    this.width = size * 0.6;
    this.height = size;
  }

  getBounds() {
    return { x: 0, y: -this.height, width: this.width, height: this.height };
  }
  isPointInside(): boolean {
    return false;
  }

  render(r: IRenderer): void {
    const [top, mid, bottom] = theme.titleGradient;
    const grad = r.createLinearGradient(0, -this.size, 0, 0, [
      { stop: 0, color: top },
      { stop: 0.55, color: mid },
      { stop: 1, color: bottom },
    ]);
    r.fillText(this.char, 0, 0, `800 ${this.size}px ${TITLE_FONT}`, grad);
  }
}

/** The title block — one {@link TitleGlyph} per character, re-centered on resize. */
class Title extends Entity {
  private glyphs: TitleGlyph[] = [];
  private engine = new LayoutEngine(1e9, 1e9, this.measurer());

  constructor(private text: string) {
    super();
    this.interactive = false;
    for (const ch of text) {
      const g = new TitleGlyph(ch, 110);
      this.glyphs.push(g);
      this.add(g);
    }
  }

  private measurer(): GlyphMeasurer | null {
    if (typeof document === 'undefined') return null;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return null;
    const cache = new Map<string, number>();
    return {
      measure: (char: string, fontSize: number): number => {
        const key = char;
        let w = cache.get(key);
        if (w === undefined) {
          ctx.font = `800 100px ${TITLE_FONT}`;
          w = ctx.measureText(char).width / 100;
          cache.set(key, w);
        }
        return w * fontSize;
      },
    };
  }

  place(cx: number, baselineY: number, size: number): void {
    const prepared = this.engine.prepare(this.text, {}, size);
    const laid = this.engine.layoutPrepared(prepared);
    const startX = cx - laid.totalWidth / 2;
    let i = 0;
    for (const node of laid.nodes) {
      const g = this.glyphs[i++];
      if (!g) break;
      g.size = size;
      g.width = node.width;
      g.height = size;
      g.x = startX + node.x;
      g.y = baselineY;
    }
  }

  count(): number {
    return this.glyphs.length;
  }
  isPointInside(): boolean {
    return false;
  }
  render(): void {}
}

/** Centered, letter-tracked single line of text (subtitle / hint). */
class TrackedText extends Entity {
  public cx = 0;
  constructor(
    private get: () => string,
    public font: string,
    public color: string,
    private tracking: number,
    private measure: (s: string, font: string) => number,
  ) {
    super();
    this.interactive = false;
  }
  getBounds(): null {
    return null;
  }
  isPointInside(): boolean {
    return false;
  }
  render(r: IRenderer): void {
    const text = this.get();
    const widths = [...text].map((c) => this.measure(c, this.font) + this.tracking);
    const total = widths.reduce((a, b) => a + b, 0) - this.tracking;
    let x = this.cx - total / 2;
    for (let i = 0; i < text.length; i++) {
      r.fillText(text[i], x, 0, this.font, this.color);
      x += widths[i];
    }
  }
}

/** Glassy live stats card: many canvas entities, a handful of DOM nodes, real FPS. */
class StatsCard extends Entity {
  private fps = 60; // smoothed instantaneous frame rate
  private displayFps = 60; // what we show — refreshed ~1Hz so the digit is readable
  private acc = 0; // throttles the entity / DOM-node recount
  private fpsAcc = 0; // throttles the FPS display refresh
  private entities = 0;
  private domNodes = 0;

  constructor(private getEntities: () => number) {
    super();
    this.interactive = false;
    this.width = 300;
    this.height = 150;
  }

  getBounds() {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }
  isPointInside(): boolean {
    return false;
  }

  update(dt: number): void {
    if (dt > 0) this.fps += (1000 / dt - this.fps) * 0.08;
    this.fpsAcc += dt;
    if (this.fpsAcc >= 1000) {
      this.fpsAcc = 0;
      this.displayFps = this.fps;
    }
    this.acc += dt;
    if (this.acc < 1000 && this.entities) return;
    this.acc = 0;
    this.entities = this.getEntities();
    this.domNodes = document.querySelectorAll('[data-vecto-id]').length;
  }

  private cell(r: IRenderer, x: number, y: number, label: string, value: string, color: string) {
    r.fillText(label, x, y, '600 11px Inter, sans-serif', theme.statsLabel);
    r.fillText(value, x, y + 30, '700 27px Inter, sans-serif', color);
  }

  render(r: IRenderer): void {
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 16);
    r.fill(theme.statsCardBg);
    r.stroke(theme.statsCardBorder, 1);
    const padX = 22;
    const colW = (this.width - padX * 2) / 2;
    this.cell(r, padX, 30, 'ENTITIES', this.entities.toLocaleString(), theme.statsEntities);
    this.cell(r, padX + colW, 30, 'DOM NODES', String(this.domNodes), theme.statsDomNodes);
    this.cell(r, padX, 96, 'FPS', `${Math.round(this.displayFps)}`, theme.statsFps);
    r.fillText(
      'real ARIA shadow nodes · zero reflow',
      padX,
      this.height - 14,
      '500 10.5px Inter, sans-serif',
      theme.statsHint,
    );
  }
}

/**
 * Hero background: two soft radial glows (top-right blue, bottom-left violet)
 * over a vignette wash, all approximated with concentric circles because the
 * renderer abstraction only offers linear gradients.
 */
export class HeroBackground extends Entity {
  public isPointInside(): boolean {
    return false;
  }
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    super();
    this.width = width;
    this.height = height;
    this.interactive = false;
  }

  public render(r: IRenderer): void {
    r.save();
    fillRect(
      r,
      0,
      0,
      this.width,
      this.height,
      document.documentElement.getAttribute('data-theme') === 'light' ? '#eef2f7' : '#070b16',
    );
    const glow = (cx: number, cy: number, radius: number, rgb: string, peak: number): void => {
      for (let i = 0; i < 20; i++) {
        const t = i / 20;
        r.beginPath();
        r.arc(cx, cy, radius * (1 - t * 0.96), 0, Math.PI * 2);
        r.fill(`rgba(${rgb},${peak * (1 - t) * 0.6})`);
      }
    };
    glow(
      this.width * 0.78,
      this.height * 0.22,
      Math.min(this.width, this.height) * 0.45,
      '59, 130, 246',
      0.12,
    );
    glow(
      this.width * 0.16,
      this.height * 0.78,
      Math.min(this.width, this.height) * 0.4,
      '99, 102, 241',
      0.1,
    );
    r.restore();
  }
}

export interface HeroSectionOptions {
  scene: Scene;
  width: number;
  height: number;
  title: string;
  galleryLabel: string;
  galleryUrl: string;
}

/** Keep the hero title inside the canvas while retaining the locale's copy. */
export function fitHeroTitleSize(text: string, width: number, mobile: boolean): number {
  const baseSize = Math.min(mobile ? 68 : 132, width * 0.18);
  const maxWidth = Math.max(1, width - (mobile ? 32 : 64));
  return Math.min(baseSize, maxWidth / Math.max(text.length * 0.75, 1));
}

/**
 * Assemble the homepage hero (neural field + serif title + CTAs + stats card)
 * into an existing scene. The scene must be live (see keepSceneLive) for the
 * drifting starfield to animate. Geometry is fixed at call time; call again
 * (or resize) on window resize.
 */
export function buildHeroSection(opts: HeroSectionOptions): () => void {
  const { scene, width, height, title: titleText, galleryLabel, galleryUrl } = opts;
  // `scene` may be a container inside a scene; resolve the real Scene for
  // markDirty() and the keep-alive pump. Entities still attach to the passed
  // container so they scroll with the page.
  const host = (scene as unknown as { scene?: Scene }).scene ?? (scene as Scene);

  // a small measurer for tracked sans text
  const sansCtx = document.createElement('canvas').getContext('2d');
  const measureSans = (s: string, font: string): number => {
    if (!sansCtx) return s.length * 8;
    sansCtx.font = font;
    return sansCtx.measureText(s).width;
  };

  const bg = new HeroBackground(width, height);
  scene.add(bg);

  const field = { w: width, h: height };
  const neural = new NeuralField(560);
  neural.place();
  scene.add(neural);

  const title = new Title(titleText);
  scene.add(title);

  const subtitle = new TrackedText(
    () => 'ZERO-DOM · ACCESSIBLE · AGENT-NATIVE',
    '600 19px Inter, sans-serif',
    theme.subtitle,
    3,
    measureSans,
  );
  scene.add(subtitle);

  const galleryBtn = new Button(`→  ${galleryLabel}`, {
    onClick: () => (location.href = galleryUrl),
    bg: theme.demosBtnBg,
    hoverBg: theme.demosBtnHoverBg,
    color: theme.demosBtnColor,
    font: '600 16px Inter, sans-serif',
    padding: 16,
    radius: 12,
  });
  const githubBtn = new Button('GitHub', {
    onClick: () => window.open(GITHUB_URL, '_blank', 'noopener'),
    bg: theme.githubBtnBg,
    hoverBg: theme.githubBtnHoverBg,
    color: theme.githubBtnColor,
    font: '600 16px Inter, sans-serif',
    padding: 16,
    radius: 12,
  });
  scene.add(galleryBtn);
  scene.add(githubBtn);

  const stats = new StatsCard(() => neural.count() + title.count() + 2);
  scene.add(stats);

  // Repaint with the other palette on every theme change (toggle click, or the
  // pre-paint script on first load if it picked something other than dark).
  // A MutationObserver on data-theme (rather than hooking the toggle buttons
  // directly) catches every trigger source, not just this page's own toggle.
  const applyTheme = (next: HeroPalette): void => {
    theme = next;
    subtitle.color = theme.subtitle;
    galleryBtn.bg = theme.demosBtnBg;
    galleryBtn.hoverBg = theme.demosBtnHoverBg;
    galleryBtn.color = theme.demosBtnColor;
    githubBtn.bg = theme.githubBtnBg;
    githubBtn.hoverBg = theme.githubBtnHoverBg;
    githubBtn.color = theme.githubBtnColor;
    host.markDirty();
  };
  const syncTheme = (): void => {
    applyTheme(
      document.documentElement.getAttribute('data-theme') === 'light'
        ? LIGHT_PALETTE
        : DARK_PALETTE,
    );
  };
  try {
    syncTheme();
  } catch (err) {
    const w = window as unknown as { __heroErr?: string };
    if (typeof window !== 'undefined') {
      w.__heroErr = String(err instanceof Error ? err.message : err);
    }
    throw err;
  }
  const observer = new MutationObserver(syncTheme);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  const layout = (w: number, h: number): void => {
    field.w = w;
    field.h = h;
    const mobile = w < 720;
    const titleSize = fitHeroTitleSize(titleText, w, mobile);
    const cx = w / 2;

    const titleBaseline = h * 0.46;
    title.place(cx, titleBaseline, titleSize);

    // Vertical lockup. The subtitle's font must shrink with the fitted title —
    // a fixed 19px face next to a fit-to-width title left the two lines
    // overlapping on long locales, and any zoom/DPR change that shrank the
    // viewport (titleSize ∝ width) densified the collision further. The offset
    // is explicit ink math: title descender band + subtitle ascent + a daylight
    // floor (8px, growing with the title) — the old 0.42×titleSize rhythm was
    // smaller than that ink sum at fit-to-width sizes, which is the overlap.
    const subtitleSize = Math.round(Math.max(13, Math.min(19, titleSize * 0.34)));
    subtitle.font = `600 ${subtitleSize}px Inter, sans-serif`;
    const daylight = Math.max(8, titleSize * 0.18);
    const subtitleOffset = titleSize * 0.24 + subtitleSize * 0.75 + daylight;
    subtitle.cx = cx;
    subtitle.setPosition(0, titleBaseline + subtitleOffset);

    const gap = 16;
    const ctaY = titleBaseline + subtitleOffset + subtitleSize + 40;
    const ctaW = galleryBtn.width + gap + githubBtn.width;
    galleryBtn.setPosition(cx - ctaW / 2, ctaY);
    githubBtn.setPosition(cx - ctaW / 2 + galleryBtn.width + gap, ctaY);

    const margin = mobile ? 16 : 32;
    stats.setPosition(w - stats.width - margin, h - stats.height - margin);
  };
  try {
    layout(width, height);
  } catch (err) {
    const w = window as unknown as { __heroErr?: string };
    if (typeof window !== 'undefined') {
      w.__heroErr = 'layout: ' + String(err instanceof Error ? err.message : err);
    }
    throw err;
  }

  // The starfield drifts every frame; keep the scene live so the idle
  // auto-throttle doesn't drop it (and the on-canvas FPS readout) to ~2.
  const stopPump = keepSceneLive(host, () => !document.hidden);
  return () => {
    stopPump();
    observer.disconnect();
  };
}
