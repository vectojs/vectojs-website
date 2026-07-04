import { Scene } from '@vectojs/core';
import { generateWorkload, fontString } from './harness';
import { DomDanmaku } from './dom-danmaku';
import { VectoDanmakuField } from './vecto-danmaku';

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

const TEASER_SEED = 20260704;
const TEASER_COUNT = 800;

function initTeaser(): void {
  const section = $('teaser-compare');
  const domViewport = $('teaser-dom-viewport');
  const canvas = $<HTMLCanvasElement>('teaser-compare-canvas');
  const domHud = $('teaser-dom-hud');
  const vectoHud = $('teaser-vecto-hud');
  if (!section || !domViewport || !canvas || !domHud || !vectoHud) return;

  const measureCtx = document.createElement('canvas').getContext('2d');
  const measure = (text: string, font: string): number => {
    if (!measureCtx) return text.length * 10;
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
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

  const specs = generateWorkload(TEASER_SEED, TEASER_COUNT);
  for (const spec of specs) spec.measuredWidth = measure(spec.text, fontString(spec.fontSize));
  dom.setWorkload(specs);
  vectoField.setWorkload(specs);

  window.addEventListener('resize', () => requestAnimationFrame(fit));
  fit();
  dom.start();
  scene.start();

  setInterval(() => {
    domHud.textContent = `${Math.round(dom.fps)} fps`;
    vectoHud.textContent = `${Math.round(vectoField.fps)} fps`;
  }, 500);

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
    ).observe(section);
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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTeaser);
else initTeaser();
