import { Scene } from '@vectojs/core';
import { generateWorkload, fontString, analyzeCrossover, type CommentSpec } from './harness';
import { measurePerformance } from '../report';
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
  const benchmarkBtn = $<HTMLButtonElement>('compare-benchmark');
  const resultsPanel = $('compare-results');
  const crossoverEl = $('compare-crossover');
  const cardsEl = $('compare-cards');
  if (
    !stage ||
    !domViewport ||
    !canvas ||
    !countSlider ||
    !countOut ||
    !domHud ||
    !vectoHud ||
    !benchmarkBtn ||
    !resultsPanel ||
    !crossoverEl ||
    !cardsEl
  )
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

  const SWEEP_COUNTS = [200, 500, 1000, 2000, 3500, 5000];
  const SWEEP_SECONDS = 3;

  /**
   * The full per-point measurement used for display. `analyzeCrossover` only
   * needs `{count, fps}` (kept minimal and separately tested in harness.ts) —
   * this richer shape is purely for rendering the result cards, so the DOM
   * node count (the objective, threading-independent proof) and fps-min /
   * jank% are visible too, not just the mean fps.
   */
  interface BenchPoint {
    count: number;
    fpsMean: number;
    fpsMin: number;
    domNodes: number;
    jankPct: number;
  }

  const renderResults = (domSeries: BenchPoint[], vectoSeries: BenchPoint[]): void => {
    const domCrossover = analyzeCrossover(
      domSeries.map((p) => ({ count: p.count, fps: p.fpsMean })),
    );
    const vectoCrossover = analyzeCrossover(
      vectoSeries.map((p) => ({ count: p.count, fps: p.fpsMean })),
    );
    const ceiling = SWEEP_COUNTS[SWEEP_COUNTS.length - 1];

    crossoverEl.textContent = domCrossover.droppedBelow30At
      ? `DOM fell below 30fps at ~${domCrossover.droppedBelow30At} comments; VectoJS ${
          vectoCrossover.droppedBelow30At
            ? `fell below 30fps at ~${vectoCrossover.droppedBelow30At}`
            : `held above 30fps through ${ceiling}`
        } on this hardware.`
      : `Neither side dropped below 30fps up to ${ceiling} comments on this hardware.`;

    cardsEl.innerHTML = '';
    for (const { label, series } of [
      { label: 'Plain DOM', series: domSeries },
      { label: 'VectoJS', series: vectoSeries },
    ]) {
      const card = document.createElement('div');
      card.className = 'compare-card';
      const rows = series
        .map(
          (p) =>
            `<tr><td>${p.count}</td><td>${p.fpsMean.toFixed(1)} fps</td><td>${p.fpsMin.toFixed(
              1,
            )} fps min</td><td>${p.domNodes} DOM nodes</td><td>${p.jankPct.toFixed(
              1,
            )}% jank</td></tr>`,
        )
        .join('');
      card.innerHTML = `<h3>${label}</h3><table><thead><tr><td>Count</td><td>FPS mean</td><td>FPS min</td><td>DOM nodes</td><td>Jank</td></tr></thead>${rows}</table>`;
      cardsEl.appendChild(card);
    }
    resultsPanel.hidden = false;
  };

  const runBenchmark = async (): Promise<void> => {
    benchmarkBtn.disabled = true;
    const originalLabel = benchmarkBtn.textContent;
    const domSeries: BenchPoint[] = [];
    const vectoSeries: BenchPoint[] = [];

    dom.stop();
    scene.stop();

    for (const count of SWEEP_COUNTS) {
      const specs = withMeasuredWidths(generateWorkload(SEED, count));

      benchmarkBtn.textContent = `Measuring DOM @ ${count}…`;
      dom.setWorkload(specs);
      dom.start();
      const domReport = await measurePerformance({
        seconds: SWEEP_SECONDS,
        frameSampler: { start: () => dom.startSampling(), stop: () => dom.stopSampling() },
      });
      dom.stop();
      domSeries.push({
        count,
        fpsMean: domReport.sceneFpsMean,
        fpsMin: domReport.sceneFpsMin,
        domNodes: domReport.domNodes,
        jankPct: domReport.jankPct,
      });

      benchmarkBtn.textContent = `Measuring VectoJS @ ${count}…`;
      vectoField.setWorkload(specs);
      scene.start();
      const vectoReport = await measurePerformance({
        seconds: SWEEP_SECONDS,
        frameSampler: {
          start: () => vectoField.startSampling(),
          stop: () => vectoField.stopSampling(),
        },
      });
      scene.stop();
      vectoSeries.push({
        count,
        fpsMean: vectoReport.sceneFpsMean,
        fpsMin: vectoReport.sceneFpsMin,
        domNodes: vectoReport.domNodes,
        jankPct: vectoReport.jankPct,
      });
    }

    // Restore the live view at the slider's current count.
    regenerate(Number(countSlider.value));
    dom.start();
    scene.start();

    renderResults(domSeries, vectoSeries);
    benchmarkBtn.disabled = false;
    benchmarkBtn.textContent = originalLabel;
  };

  benchmarkBtn.addEventListener('click', () => {
    void runBenchmark();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCompare);
else initCompare();
