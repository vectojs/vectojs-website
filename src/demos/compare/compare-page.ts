import { Scene } from '@vectojs/core';
import { generateWorkload, fontString, type CommentSpec } from './harness';
import { DomDanmaku } from './dom-danmaku';
import { VectoDanmakuField } from './vecto-danmaku';

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

const SEED = 20260704;

function initCompare(): void {
  const stage = $('compare-stage');
  const domViewport = $('dom-viewport');
  const canvas = $<HTMLCanvasElement>('compare-canvas');
  const countSlider = $<HTMLInputElement>('compare-count');
  const countOut = $('compare-count-out');
  const domHud = $('dom-hud');
  const vectoHud = $('vecto-hud');
  if (!stage || !domViewport || !canvas || !countSlider || !countOut || !domHud || !vectoHud)
    return;

  const measureCtx = document.createElement('canvas').getContext('2d');
  const measure = (text: string, font: string): number => {
    if (!measureCtx) return text.length * 10;
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  };

  /** Fills in `measuredWidth` in place, using the same measurer for both renderers. */
  const withMeasuredWidths = (specs: CommentSpec[]): CommentSpec[] => {
    for (const spec of specs) spec.measuredWidth = measure(spec.text, fontString(spec.fontSize));
    return specs;
  };

  const dom = new DomDanmaku(domViewport);
  const scene = new Scene(canvas, { disableWindowResize: true, maxFPS: 60 });
  const vectoField = new VectoDanmakuField();
  scene.add(vectoField);

  const fit = (): void => {
    const w = domViewport.clientWidth;
    const h = domViewport.clientHeight;
    dom.resize(w);
    scene.resize(w, h);
    vectoField.resize(w);
  };

  const regenerate = (count: number): void => {
    const specs = withMeasuredWidths(generateWorkload(SEED, count));
    dom.setWorkload(specs);
    vectoField.setWorkload(specs);
  };

  countSlider.addEventListener('input', () => {
    const count = Number(countSlider.value);
    countOut.textContent = String(count);
    regenerate(count);
  });

  window.addEventListener('resize', () => requestAnimationFrame(fit));
  fit();
  regenerate(Number(countSlider.value));
  dom.start();
  scene.start();

  setInterval(() => {
    domHud.textContent = `${Math.round(dom.fps)} fps · ${dom.nodeCount} nodes`;
    vectoHud.textContent = `${Math.round(vectoField.fps)} fps · ${vectoField.nodeCount} nodes`;
  }, 500);

  // Pause both live loops off-screen (same pattern as src/demos/graph.ts).
  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) {
          dom.start();
          scene.start();
        } else {
          dom.stop();
          scene.stop();
        }
      },
      { threshold: 0.01 },
    ).observe(stage);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      dom.stop();
      scene.stop();
    } else if (visible) {
      dom.start();
      scene.start();
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCompare);
else initCompare();
