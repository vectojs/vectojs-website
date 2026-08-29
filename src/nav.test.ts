import { describe, expect, test } from 'bun:test';
import { routeSearchKey } from './nav';

const SEARCH_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'] as const;

function runSearchKey(
  key: string,
  eventOptions: { isComposing?: boolean; keyCode?: number } = {},
  stateOptions: { rowCount?: number; selectedIndex?: number } = {},
) {
  const calls = {
    close: 0,
    select: [] as number[],
    activate: [] as number[],
    preventDefault: 0,
  };
  routeSearchKey(
    {
      key,
      isComposing: eventOptions.isComposing ?? false,
      keyCode: eventOptions.keyCode ?? 0,
      preventDefault: () => {
        calls.preventDefault += 1;
      },
    },
    {
      modalOpen: true,
      rowCount: stateOptions.rowCount ?? 3,
      selectedIndex: stateOptions.selectedIndex ?? 1,
      close: () => {
        calls.close += 1;
      },
      select: (index) => calls.select.push(index),
      activate: (index) => calls.activate.push(index),
    },
  );
  return calls;
}

describe('search keyboard routing', () => {
  for (const [signal, options] of [
    ['isComposing', { isComposing: true }],
    ['keyCode 229', { keyCode: 229 }],
  ] as const) {
    test.each(SEARCH_KEYS)(`leaves %s to IME when ${signal} is active`, (key) => {
      expect(runSearchKey(key, options)).toEqual({
        close: 0,
        select: [],
        activate: [],
        preventDefault: 0,
      });
    });
  }

  test('keeps normal Escape close behavior after composition', () => {
    expect(runSearchKey('Escape')).toEqual({
      close: 1,
      select: [],
      activate: [],
      preventDefault: 0,
    });
  });

  test('keeps normal ArrowDown result selection after composition', () => {
    expect(runSearchKey('ArrowDown')).toEqual({
      close: 0,
      select: [2],
      activate: [],
      preventDefault: 1,
    });
  });

  test('keeps normal ArrowUp result selection after composition', () => {
    expect(runSearchKey('ArrowUp')).toEqual({
      close: 0,
      select: [0],
      activate: [],
      preventDefault: 1,
    });
  });

  test('keeps normal Enter result activation after composition', () => {
    expect(runSearchKey('Enter')).toEqual({
      close: 0,
      select: [],
      activate: [1],
      preventDefault: 1,
    });
  });

  test('keeps navigation clamped to the available result range', () => {
    expect(runSearchKey('ArrowDown', {}, { selectedIndex: 2 }).select).toEqual([2]);
    expect(runSearchKey('ArrowUp', {}, { selectedIndex: 0 }).select).toEqual([0]);
  });

  test('does not consume navigation or Enter when there are no results', () => {
    expect(runSearchKey('ArrowDown', {}, { rowCount: 0 }).preventDefault).toBe(0);
    expect(runSearchKey('Enter', {}, { rowCount: 0 }).preventDefault).toBe(0);
  });

  test('does not consume Enter before a result is selected', () => {
    expect(runSearchKey('Enter', {}, { selectedIndex: -1 })).toEqual({
      close: 0,
      select: [],
      activate: [],
      preventDefault: 0,
    });
  });
});
