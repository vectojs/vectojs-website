import { Entity, type IRenderer } from '@vectojs/core';
import { Danmaku } from '../danmaku/danmaku';
import type { CommentSpec } from './harness';

const LANE_HEIGHT = 32;

/**
 * The VectoJS side of the comparison: one `Danmaku` entity per comment,
 * driven by the same per-spec speed/stagger/measuredWidth as `DomDanmaku`,
 * using the identical modulo-cycle motion model so both sides are visually
 * and behaviorally matched, not just similarly-themed.
 */
export class VectoDanmakuField extends Entity {
  private items: Danmaku[] = [];
  private specs: CommentSpec[] = [];
  private elapsed: number[] = [];
  private stageWidth = 0;
  private samples: number[] | null = null;
  fps = 60;

  constructor() {
    super();
    this.interactive = false;
  }

  isPointInside(): boolean {
    return false;
  }
  getBounds(): null {
    return null;
  }
  render(_r: IRenderer): void {}

  get nodeCount(): number {
    // The point of this whole comparison: this stays ~constant regardless of
    // comment count (the entities live in the scene graph, not the DOM).
    return 0;
  }

  setWorkload(specs: CommentSpec[]): void {
    for (const item of this.items) this.remove(item);
    this.items = [];
    this.elapsed = [];
    this.specs = specs;

    for (const spec of specs) {
      const d = new Danmaku();
      d.text = spec.text;
      d.color = spec.color;
      d.fontSize = spec.fontSize;
      d.type = 'scroll';
      d.speed = spec.speed;
      d.measuredWidth = spec.measuredWidth;
      d.y = (spec.lane + 0.5) * LANE_HEIGHT + 8;
      d.x = this.stageWidth;
      this.add(d);
      this.items.push(d);
      this.elapsed.push(-spec.startDelayMs);
    }
  }

  resize(width: number): void {
    this.stageWidth = width;
  }

  startSampling(): void {
    this.samples = [];
  }
  stopSampling(): number[] {
    const s = this.samples ?? [];
    this.samples = null;
    return s;
  }

  update(dt: number, time: number): void {
    super.update(dt, time);
    if (dt > 0) this.fps += (1000 / dt - this.fps) * 0.1;
    if (this.samples && dt > 0) this.samples.push(dt);

    for (let i = 0; i < this.items.length; i++) {
      const d = this.items[i];
      const spec = this.specs[i];
      this.elapsed[i] += dt;
      const elapsed = this.elapsed[i];
      if (elapsed < 0) {
        d.x = this.stageWidth;
        continue;
      }
      const spawnX = this.stageWidth + spec.measuredWidth;
      const cycleMs = spawnX / spec.speed;
      const t = elapsed % cycleMs;
      d.x = spawnX - t * spec.speed;
    }
  }
}
