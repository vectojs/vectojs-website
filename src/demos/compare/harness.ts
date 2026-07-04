import { COMMENTS } from '../danmaku/corpus';

/**
 * One comment's full, deterministic description. Both the DOM and VectoJS
 * renderers consume the same array — this is what makes the comparison fair
 * by construction, not just "similar-looking."
 */
export interface CommentSpec {
  id: number;
  text: string;
  color: string;
  fontSize: number;
  lane: number;
  speed: number; // px/ms, horizontal scroll speed
  startDelayMs: number; // stagger before this slot's first spawn
  measuredWidth: number; // filled in by the caller (needs a canvas 2D context, unavailable in pure-logic tests) via `measure()` + `fontString()`
}

const COLORS = ['#ffffff', '#ff6b9d', '#7cb3ff', '#ffd166', '#86efac', '#c4b5fd'];
const BASE_FONT_SIZE = 20;
const LARGE_FONT_SIZE = 26;
const LARGE_FONT_CHANCE = 0.12;
const BASE_SPEED = 0.05; // px/ms
const SPEED_JITTER = 0.05; // px/ms
const STAGGER_WINDOW_MS = 6000;

/**
 * Deterministic PRNG (mulberry32) — same seed always produces the same
 * sequence. Copied from `src/demos/graph/layout.ts`, which does not export it.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Matches `Danmaku.font`'s exact format in `src/demos/danmaku/danmaku.ts`, so both renderers measure identically. */
export function fontString(fontSize: number): string {
  return `600 ${fontSize}px "Inter", system-ui, sans-serif`;
}

/**
 * Generate `count` comment descriptors for `seed`. Deterministic: the same
 * `(seed, i)` always yields the same descriptor regardless of `count` — the
 * PRNG is consumed in a fixed number of calls per index, so requesting more
 * comments never perturbs the ones already generated (same principle as
 * `graph/layout.ts`'s per-cluster seeding, which keeps the node-count slider
 * stable).
 */
export function generateWorkload(seed: number, count: number, laneCount = 20): CommentSpec[] {
  const rand = mulberry32(seed);
  const specs: CommentSpec[] = [];
  for (let i = 0; i < count; i++) {
    const text = COMMENTS[Math.floor(rand() * COMMENTS.length)];
    const color = COLORS[Math.floor(rand() * COLORS.length)];
    const fontSize = rand() < LARGE_FONT_CHANCE ? LARGE_FONT_SIZE : BASE_FONT_SIZE;
    const speed = BASE_SPEED + rand() * SPEED_JITTER;
    specs.push({
      id: i,
      text,
      color,
      fontSize,
      lane: i % laneCount,
      speed,
      startDelayMs: ((i * STAGGER_WINDOW_MS) / 4000) % STAGGER_WINDOW_MS,
      measuredWidth: 0,
    });
  }
  return specs;
}

export interface SeriesPoint {
  count: number;
  fps: number;
}

export interface CrossoverReport {
  droppedBelow60At: number | null;
  droppedBelow30At: number | null;
}

function findFirstBelow(series: SeriesPoint[], threshold: number): number | null {
  for (const point of series) {
    if (point.fps < threshold) return point.count;
  }
  return null;
}

/** Given an ascending-by-count FPS series, find where it first drops below 60fps and 30fps. */
export function analyzeCrossover(series: SeriesPoint[]): CrossoverReport {
  return {
    droppedBelow60At: findFirstBelow(series, 60),
    droppedBelow30At: findFirstBelow(series, 30),
  };
}
