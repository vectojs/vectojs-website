import { describe, expect, test } from 'bun:test';
import { HOME_STRINGS } from './home';
import { LOCALES } from './config';

const translatedLocales = LOCALES.filter((locale) => locale !== 'en');

function htmlTags(value: string): string[] {
  return [...value.matchAll(/<[^>]+>/g)].map(([tag]) => tag);
}

describe('homepage translations', () => {
  test('keeps body arrays aligned with English and translates every body', () => {
    const english = HOME_STRINGS.en;

    for (const locale of translatedLocales) {
      const translation = HOME_STRINGS[locale];
      expect(translation.features.cards).toHaveLength(english.features.cards.length);
      expect(translation.usecases.tiles).toHaveLength(english.usecases.tiles.length);

      for (const [index, card] of translation.features.cards.entries()) {
        expect(card.body).toBeTruthy();
        expect(card.body).not.toBe(english.features.cards[index].body);
        expect(htmlTags(card.body)).toEqual(htmlTags(english.features.cards[index].body));
      }

      for (const [index, tile] of translation.usecases.tiles.entries()) {
        expect(tile.body).toBeTruthy();
        expect(tile.body).not.toBe(english.usecases.tiles[index].body);
        expect(htmlTags(tile.body)).toEqual(htmlTags(english.usecases.tiles[index].body));
      }
    }
  });
});
