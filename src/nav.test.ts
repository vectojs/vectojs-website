import { describe, expect, test } from 'bun:test';
import { isSearchCompositionEvent } from './nav';

const keyboardEvent = (
  key: string,
  options: { isComposing?: boolean; keyCode?: number } = {},
): KeyboardEvent =>
  ({
    key,
    isComposing: options.isComposing ?? false,
    keyCode: options.keyCode ?? 0,
  }) as KeyboardEvent;

describe('search keyboard routing', () => {
  test.each(['ArrowDown', 'ArrowUp', 'Enter', 'Escape'])(
    'leaves %s to an active IME composition',
    (key) => {
      expect(isSearchCompositionEvent(keyboardEvent(key, { isComposing: true }))).toBe(true);
    },
  );

  test('recognizes the legacy IME keyCode 229 fallback', () => {
    expect(isSearchCompositionEvent(keyboardEvent('Enter', { keyCode: 229 }))).toBe(true);
  });

  test.each(['ArrowDown', 'ArrowUp', 'Enter', 'Escape'])(
    'keeps normal %s search behavior after composition',
    (key) => {
      expect(isSearchCompositionEvent(keyboardEvent(key))).toBe(false);
    },
  );
});
