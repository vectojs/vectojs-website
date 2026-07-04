import { describe, expect, test } from 'bun:test';
import { generateWorkload, analyzeCrossover, fontString } from './harness';

describe('generateWorkload', () => {
  test('same seed and count produces an identical descriptor list', () => {
    const a = generateWorkload(42, 50);
    const b = generateWorkload(42, 50);
    expect(a).toEqual(b);
  });

  test('a larger count does not perturb earlier descriptors (stable prefix)', () => {
    const small = generateWorkload(42, 20);
    const large = generateWorkload(42, 200);
    for (let i = 0; i < small.length; i++) {
      expect(large[i]).toEqual(small[i]);
    }
  });

  test('a different seed produces a different sequence', () => {
    const a = generateWorkload(1, 10);
    const b = generateWorkload(2, 10);
    expect(a).not.toEqual(b);
  });

  test('produces exactly `count` descriptors, each with a valid id/lane/speed', () => {
    const specs = generateWorkload(7, 30, 10);
    expect(specs).toHaveLength(30);
    for (let i = 0; i < specs.length; i++) {
      expect(specs[i].id).toBe(i);
      expect(specs[i].lane).toBeGreaterThanOrEqual(0);
      expect(specs[i].lane).toBeLessThan(10);
      expect(specs[i].speed).toBeGreaterThan(0);
      expect(specs[i].text.length).toBeGreaterThan(0);
      expect(specs[i].measuredWidth).toBe(0); // filled in later by the caller, in a real browser
    }
  });

  test('lanes are assigned round-robin across the requested lane count', () => {
    const specs = generateWorkload(1, 25, 5);
    expect(specs.map((s) => s.lane)).toEqual([
      0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4,
    ]);
  });

  test('start delays are staggered from 0 up to (but not including) the loop window', () => {
    const specs = generateWorkload(1, 4);
    expect(specs[0].startDelayMs).toBe(0);
    expect(specs[3].startDelayMs).toBeGreaterThan(specs[0].startDelayMs);
    expect(specs[3].startDelayMs).toBeLessThan(6000);
  });
});

describe('fontString', () => {
  test('matches the format the VectoJS Danmaku entity itself uses', () => {
    expect(fontString(20)).toBe('600 20px "Inter", system-ui, sans-serif');
  });
});

describe('analyzeCrossover', () => {
  test('finds the first count where fps drops below each threshold', () => {
    const series = [
      { count: 200, fps: 60 },
      { count: 500, fps: 59 },
      { count: 1000, fps: 45 },
      { count: 2000, fps: 28 },
      { count: 5000, fps: 12 },
    ];
    expect(analyzeCrossover(series)).toEqual({ droppedBelow60At: 1000, droppedBelow30At: 2000 });
  });

  test('reports null for a threshold never crossed in the series', () => {
    const series = [
      { count: 200, fps: 60 },
      { count: 5000, fps: 58 },
    ];
    expect(analyzeCrossover(series)).toEqual({ droppedBelow60At: null, droppedBelow30At: null });
  });

  test('a series that starts already below threshold reports its first point', () => {
    const series = [
      { count: 200, fps: 25 },
      { count: 500, fps: 20 },
    ];
    expect(analyzeCrossover(series).droppedBelow30At).toBe(200);
  });
});
