import { Entity, type IRenderer } from '@vectojs/core';

/**
 * Invisible layout node. Groups children and carries a box, but paints nothing
 * and never accepts a hit — the scroll root, the header row and the footer are
 * all instances of this.
 */
export class Container extends Entity {
  public isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }
  public render(_r: IRenderer): void {}
}

/** A 1px horizontal rule. */
export class DividerLine extends Entity {
  public isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }
  private color: string;
  constructor(width: number, color: string = '#e5e7eb') {
    super();
    this.width = width;
    this.height = 1;
    this.color = color;
  }
  public render(r: IRenderer): void {
    r.beginPath();
    r.moveTo(0, 0);
    r.lineTo(this.width, 0);
    r.stroke(this.color, 1);
  }
}

/**
 * Scroll-linked reading progress indicator, pinned to the top of the viewport.
 *
 * Reads `window.scrollY` in `update()` rather than subscribing to the scroll
 * event so the eased catch-up runs on the frame clock. It marks the scene dirty
 * only while the eased value is still travelling, so an `onDemand` scene goes
 * back to sleep once the bar settles.
 */
export class ReadingProgressBar extends Entity {
  public isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }
  private scrollRef: Container;
  private displayProgress = 0;
  private barColor: string;

  constructor(scrollRef: Container, width: number, barColor: string = '#6366f1') {
    super();
    this.scrollRef = scrollRef;
    this.width = width;
    this.height = 3;
    this.barColor = barColor;
  }

  public override update(dt: number, time: number): void {
    super.update(dt, time);
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    const maxScroll = Math.max(1, this.scrollRef.height - window.innerHeight);
    const target = Math.min(1, Math.max(0, scrollY / maxScroll));

    const diff = target - this.displayProgress;
    if (Math.abs(diff) > 0.001) {
      this.displayProgress += diff * (1 - Math.exp(-18 * (dt / 1000)));
      this.scene?.markDirty();
    } else {
      this.displayProgress = target;
    }
  }

  public render(r: IRenderer): void {
    if (this.displayProgress <= 0) return;
    r.save();
    r.beginPath();
    r.roundRect(0, 0, this.width, this.height, 0);
    r.fill(`${this.barColor}1a`); // 10% opacity background

    r.beginPath();
    r.roundRect(0, 0, this.width * this.displayProgress, this.height, 0);
    r.fill(this.barColor);
    r.restore();
  }
}

/**
 * Article wrapper that fades in once, on the microtask after construction.
 *
 * The opacity transition is declared via `setTransition` rather than driven from
 * `update()`, so the idle throttle can see the pending animation through
 * `hasPendingAnimations()` and keeps rendering until it lands.
 */
export class PageContainer extends Entity {
  public isPointInside(_globalX: number, _globalY: number): boolean {
    return false;
  }
  constructor() {
    super();
    this.opacity = 0;
    this.setTransition({
      opacity: { duration: 340, easing: 'easeOutCubic' },
    });
    Promise.resolve().then(() => {
      this.opacity = 1;
      this.scene?.markDirty();
    });
  }

  public render(_r: IRenderer): void {}
}
