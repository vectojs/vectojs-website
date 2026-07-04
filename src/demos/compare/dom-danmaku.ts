import type { CommentSpec } from './harness';

const LANE_HEIGHT = 32;

/**
 * A steelmanned plain-DOM danmaku renderer: a fixed element pool (never
 * created/destroyed per comment, only ever recreated on a full workload
 * change), moved with `transform: translate3d` (compositor-friendly, no
 * `left`/`top` layout thrash), text set once per element.
 *
 * Deliberately no `will-change` on every element: a competent engineer knows
 * that promoting thousands of elements to their own compositor layer makes
 * things WORSE at this scale, not better, so omitting it here is the honest,
 * well-built choice, not an oversight. What still costs real time at scale is
 * exactly what this comparison exists to show: compositing thousands of
 * layers and painting thousands of text nodes per frame.
 */
export class DomDanmaku {
  private els: HTMLDivElement[] = [];
  private specs: CommentSpec[] = [];
  private elapsed: number[] = [];
  private width = 0;
  private raf = 0;
  private lastTime = 0;
  private samples: number[] | null = null;
  fps = 60;

  constructor(private container: HTMLElement) {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
  }

  get nodeCount(): number {
    return this.els.length;
  }

  /** Rebuild the fixed pool for a new workload (called once per slider change, not per frame). */
  setWorkload(specs: CommentSpec[]): void {
    for (const el of this.els) el.remove();
    this.els = [];
    this.elapsed = [];
    this.specs = specs;

    for (const spec of specs) {
      const el = document.createElement('div');
      el.className = 'dom-danmaku-item';
      el.textContent = spec.text;
      el.style.position = 'absolute';
      el.style.top = `${spec.lane * LANE_HEIGHT}px`;
      el.style.left = '0';
      el.style.color = spec.color;
      el.style.fontSize = `${spec.fontSize}px`;
      el.style.fontWeight = '600';
      el.style.fontFamily = '"Inter", system-ui, sans-serif';
      el.style.whiteSpace = 'nowrap';
      el.style.transform = 'translate3d(0, 0, 0)';
      this.container.appendChild(el);
      this.els.push(el);
      this.elapsed.push(-spec.startDelayMs);
    }
  }

  resize(width: number): void {
    this.width = width;
  }

  startSampling(): void {
    this.samples = [];
  }
  stopSampling(): number[] {
    const s = this.samples ?? [];
    this.samples = null;
    return s;
  }

  private tick = (time: number): void => {
    const dt = this.lastTime ? time - this.lastTime : 0;
    this.lastTime = time;
    if (dt > 0) this.fps += (1000 / dt - this.fps) * 0.1;
    if (this.samples && dt > 0) this.samples.push(dt);

    for (let i = 0; i < this.els.length; i++) {
      const spec = this.specs[i];
      this.elapsed[i] += dt;
      const elapsed = this.elapsed[i];
      if (elapsed < 0) continue; // still waiting out its stagger delay, stays at its initial position

      const spawnX = this.width + spec.measuredWidth;
      const cycleMs = spawnX / spec.speed;
      const t = elapsed % cycleMs;
      const x = spawnX - t * spec.speed;
      this.els[i].style.transform = `translate3d(${x}px, 0, 0)`;
    }

    this.raf = requestAnimationFrame(this.tick);
  };

  start(): void {
    this.lastTime = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  destroy(): void {
    this.stop();
    for (const el of this.els) el.remove();
    this.els = [];
  }
}
