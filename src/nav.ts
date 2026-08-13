import { Entity, type IRenderer, type Scene } from '@vectojs/core';
import { Input, Text } from '@vectojs/ui';
import { fillRect } from './entities';
import { LAYOUT, type ThemeColors } from './theme';
import { LOCALES, LOCALE_NAMES, localizedPath, parseLocale, type Locale } from './i18n/config';
import { useTranslations } from './i18n/ui';

const GITHUB_URL = 'https://github.com/vectojs/vectojs';
// Inlined SVG data URLs (same art as cdn.vectojs.org/brand/) so drawImage
// never taints the canvas: an SVG fetched cross-origin without CORS headers
// poisons the 2D context (getImageData/toDataURL/export all break).
const LOGO_MARK_LIGHT =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 697 507"><g fill="#111111" transform="translate(0,507) scale(0.1,-0.1)"><path d="M5755 5046 c-157 -36 -216 -70 -463 -261 -282 -218 -449 -347 -760 -587 -155 -120 -310 -240 -345 -266 -119 -93 -934 -720 -1182 -910 -329 -253 -336 -258 -650 -500 -148 -114 -449 -345 -668 -512 -219 -168 -453 -347 -520 -398 -120 -93 -384 -291 -647 -486 -314 -233 -502 -487 -504 -682 -1 -85 17 -114 69 -114 34 0 62 24 88 76 27 52 131 186 193 248 122 120 262 215 474 321 224 112 479 196 915 301 954 230 1333 344 1785 536 262 111 667 319 732 375 14 13 16 30 13 112 -1 53 -3 117 -4 144 -1 36 -5 47 -17 47 -9 0 -134 -60 -278 -134 -708 -363 -1067 -496 -1926 -711 -649 -162 -960 -261 -1259 -401 -52 -24 -96 -42 -98 -40 -3 2 17 19 44 37 55 38 302 224 548 414 160 124 573 440 785 601 52 40 183 141 290 223 216 167 218 169 580 447 140 107 298 228 350 269 52 40 259 199 460 354 201 154 410 316 465 359 55 43 145 113 200 155 55 42 159 122 230 178 412 318 677 520 681 517 1 -2 -4 -30 -12 -63 -22 -96 -18 -218 11 -326 65 -241 76 -290 84 -374 5 -49 6 -112 2 -140 l-6 -50 -38 0 c-35 0 -41 -4 -59 -39 -34 -67 -109 -269 -104 -282 2 -6 27 -15 55 -19 l51 -7 0 -140 c0 -160 6 -166 59 -54 70 148 122 354 146 578 27 258 17 362 -57 587 -47 143 -50 188 -20 248 39 75 133 136 327 213 61 24 120 52 133 63 25 24 29 69 7 87 -22 19 -93 21 -160 6z M5109 3717 c-220 -132 -244 -152 -264 -212 -29 -88 -78 -168 -141 -231 l-61 -61 51 -13 c84 -20 190 -76 230 -120 l36 -40 35 55 c50 77 102 195 131 296 13 47 38 121 55 165 69 175 97 254 90 254 -3 0 -76 -42 -162 -93z M5155 3343 c-15 -49 -42 -119 -61 -158 -38 -80 -133 -227 -150 -232 -7 -2 -15 12 -18 31 -4 20 -17 48 -31 64 -70 84 -333 162 -400 118 -28 -18 -30 -36 -13 -100 14 -52 3 -86 -35 -111 -13 -8 -98 -41 -188 -71 -166 -57 -315 -124 -379 -172 -101 -76 -227 -215 -329 -366 l-33 -48 314 161 c174 89 324 161 334 161 26 0 72 -29 122 -77 l42 -40 0 -78 0 -78 38 59 c52 80 117 136 255 218 63 38 150 95 193 128 43 32 96 64 119 70 56 16 80 41 128 132 50 97 91 140 157 163 l50 18 0 141 0 142 -31 6 c-54 10 -56 9 -84 -81z M6269 2743 c-145 -153 -333 -352 -419 -443 -758 -803 -1283 -1346 -1747 -1806 -201 -200 -253 -257 -253 -277 0 -30 30 -51 59 -42 22 7 844 834 1306 1315 154 160 755 794 1104 1165 l292 310 -31 28 c-17 15 -34 27 -39 27 -5 0 -127 -125 -272 -277z M4025 2509 c-199 -100 -467 -241 -520 -272 -83 -49 -436 -237 -445 -237 -5 0 -11 -4 -15 -9 -12 -20 328 114 565 223 126 58 606 301 620 313 8 8 -44 43 -65 43 -11 0 -74 -28 -140 -61z"/></g><g class="vectojs-arrow" fill="#9aa4b2" transform="translate(0,507) scale(0.1,-0.1)"><path d="M5421 4594 c0 -11 3 -14 6 -6 3 7 2 16 -1 19 -3 4 -6 -2 -5 -13z M5422 3915 c0 -16 2 -22 5 -12 2 9 2 23 0 30 -3 6 -5 -1 -5 -18z M6925 3441 c-6 -4 -55 -32 -110 -61 -55 -29 -158 -84 -230 -123 -71 -38 -160 -86 -197 -106 -38 -20 -68 -38 -68 -41 0 -3 47 -23 105 -44 94 -34 104 -40 93 -55 -10 -13 -10 -14 2 -3 8 6 17 12 21 12 15 0 69 -52 63 -61 -3 -5 0 -9 6 -9 6 0 37 -40 69 -89 l58 -89 108 326 c59 180 109 333 111 340 4 14 -17 16 -31 3z M4679 3253 c-13 -16 -12 -17 4 -4 9 7 17 15 17 17 0 8 -8 3 -21 -13z M5129 3063 c-13 -16 -12 -17 4 -4 9 7 17 15 17 17 0 8 -8 3 -21 -13z M6544 2898 l-19 -23 23 19 c12 11 22 21 22 23 0 8 -8 2 -26 -19z M6344 2828 l-19 -23 23 19 c21 18 27 26 19 26 -2 0 -12 -10 -23 -22z M6384 2728 l-19 -23 23 19 c12 11 22 21 22 23 0 8 -8 2 -26 -19z M6159 2633 c-13 -16 -12 -17 4 -4 9 7 17 15 17 17 0 8 -8 3 -21 -13z M3754 2608 l-29 -33 33 29 c17 17 32 31 32 33 0 8 -8 1 -36 -29z M6224 2558 l-19 -23 23 19 c12 11 22 21 22 23 0 8 -8 2 -26 -19z M4282 2410 c0 -14 2 -19 5 -12 2 6 2 18 0 25 -3 6 -5 1 -5 -13z M6059 2383 l-24 -28 28 24 c25 23 32 31 24 31 -2 0 -14 -12 -28 -27z M4282 2325 c0 -16 2 -22 5 -12 2 9 2 23 0 30 -3 6 -5 -1 -5 -18z M5829 2283 l-24 -28 28 24 c15 14 27 26 27 28 0 8 -8 1 -31 -24z M5894 2208 l-19 -23 23 19 c12 11 22 21 22 23 0 8 -8 2 -26 -19z M5659 2103 l-24 -28 28 24 c15 14 27 26 27 28 0 8 -8 1 -31 -24z M5709 2013 c-13 -16 -12 -17 4 -4 16 13 21 21 13 21 -2 0 -10 -8 -17 -17z M2995 1970 c-3 -5 -1 -10 4 -10 6 0 11 5 11 10 0 6 -2 10 -4 10 -3 0 -8 -4 -11 -10z M5455 1888 l-40 -43 43 40 c39 36 47 45 39 45 -2 0 -21 -19 -42 -42z M5524 1818 l-29 -33 33 29 c17 17 32 31 32 33 0 8 -8 1 -36 -29z M5094 1508 l-19 -23 23 19 c12 11 22 21 22 23 0 8 -8 2 -26 -19z M5114 1388 l-19 -23 23 19 c12 11 22 21 22 23 0 8 -8 2 -26 -19z M4655 1230 c-233 -26 -358 -76 -464 -184 -51 -52 -53 -50 79 -61 107 -9 116 -21 23 -29 -90 -8 -169 -29 -234 -62 -49 -24 -179 -130 -179 -145 0 -5 33 -9 73 -10 39 0 92 -4 117 -8 l45 -7 -70 -12 c-202 -37 -318 -86 -398 -170 -27 -29 -28 -30 -9 -36 32 -11 169 -26 282 -32 l105 -6 365 368 c201 203 372 377 379 387 15 20 9 20 -114 7z M4799 1203 l-24 -28 28 24 c25 23 32 31 24 31 -2 0 -14 -12 -28 -27z M4541 746 l-384 -384 2 -144 c2 -147 8 -208 21 -208 19 0 119 112 147 165 33 62 67 174 79 257 3 26 10 45 16 42 5 -4 6 -53 2 -126 -7 -116 -6 -120 12 -110 36 19 142 138 167 187 33 66 57 164 57 231 0 30 5 54 10 54 6 0 10 -31 10 -72 0 -40 3 -97 7 -126 l6 -53 34 33 c46 43 119 145 139 194 9 22 23 64 30 95 14 60 38 306 32 333 -2 11 -125 -106 -387 -368z M4754 1018 l-29 -33 33 29 c17 17 32 31 32 33 0 8 -8 1 -36 -29z M4175 570 c-66 -66 -117 -120 -115 -120 3 0 59 54 125 120 66 66 117 120 115 120 -3 0 -59 -54 -125 -120z M4004 398 l-19 -23 23 19 c12 11 22 21 22 23 0 8 -8 2 -26 -19z"/></g></svg>',
  );
const LOGO_MARK_DARK =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 697 507"><g fill="#f0f0f0" transform="translate(0,507) scale(0.1,-0.1)"><path d="M5755 5046 c-157 -36 -216 -70 -463 -261 -282 -218 -449 -347 -760 -587 -155 -120 -310 -240 -345 -266 -119 -93 -934 -720 -1182 -910 -329 -253 -336 -258 -650 -500 -148 -114 -449 -345 -668 -512 -219 -168 -453 -347 -520 -398 -120 -93 -384 -291 -647 -486 -314 -233 -502 -487 -504 -682 -1 -85 17 -114 69 -114 34 0 62 24 88 76 27 52 131 186 193 248 122 120 262 215 474 321 224 112 479 196 915 301 954 230 1333 344 1785 536 262 111 667 319 732 375 14 13 16 30 13 112 -1 53 -3 117 -4 144 -1 36 -5 47 -17 47 -9 0 -134 -60 -278 -134 -708 -363 -1067 -496 -1926 -711 -649 -162 -960 -261 -1259 -401 -52 -24 -96 -42 -98 -40 -3 2 17 19 44 37 55 38 302 224 548 414 160 124 573 440 785 601 52 40 183 141 290 223 216 167 218 169 580 447 140 107 298 228 350 269 52 40 259 199 460 354 201 154 410 316 465 359 55 43 145 113 200 155 55 42 159 122 230 178 412 318 677 520 681 517 1 -2 -4 -30 -12 -63 -22 -96 -18 -218 11 -326 65 -241 76 -290 84 -374 5 -49 6 -112 2 -140 l-6 -50 -38 0 c-35 0 -41 -4 -59 -39 -34 -67 -109 -269 -104 -282 2 -6 27 -15 55 -19 l51 -7 0 -140 c0 -160 6 -166 59 -54 70 148 122 354 146 578 27 258 17 362 -57 587 -47 143 -50 188 -20 248 39 75 133 136 327 213 61 24 120 52 133 63 25 24 29 69 7 87 -22 19 -93 21 -160 6z M5109 3717 c-220 -132 -244 -152 -264 -212 -29 -88 -78 -168 -141 -231 l-61 -61 51 -13 c84 -20 190 -76 230 -120 l36 -40 35 55 c50 77 102 195 131 296 13 47 38 121 55 165 69 175 97 254 90 254 -3 0 -76 -42 -162 -93z M5155 3343 c-15 -49 -42 -119 -61 -158 -38 -80 -133 -227 -150 -232 -7 -2 -15 12 -18 31 -4 20 -17 48 -31 64 -70 84 -333 162 -400 118 -28 -18 -30 -36 -13 -100 14 -52 3 -86 -35 -111 -13 -8 -98 -41 -188 -71 -166 -57 -315 -124 -379 -172 -101 -76 -227 -215 -329 -366 l-33 -48 314 161 c174 89 324 161 334 161 26 0 72 -29 122 -77 l42 -40 0 -78 0 -78 38 59 c52 80 117 136 255 218 63 38 150 95 193 128 43 32 96 64 119 70 56 16 80 41 128 132 50 97 91 140 157 163 l50 18 0 141 0 142 -31 6 c-54 10 -56 9 -84 -81z M6269 2743 c-145 -153 -333 -352 -419 -443 -758 -803 -1283 -1346 -1747 -1806 -201 -200 -253 -257 -253 -277 0 -30 30 -51 59 -42 22 7 844 834 1306 1315 154 160 755 794 1104 1165 l292 310 -31 28 c-17 15 -34 27 -39 27 -5 0 -127 -125 -272 -277z M4025 2509 c-199 -100 -467 -241 -520 -272 -83 -49 -436 -237 -445 -237 -5 0 -11 -4 -15 -9 -12 -20 328 114 565 223 126 58 606 301 620 313 8 8 -44 43 -65 43 -11 0 -74 -28 -140 -61z"/></g><g class="vectojs-arrow" fill="#9aa4b2" transform="translate(0,507) scale(0.1,-0.1)"><path d="M5421 4594 c0 -11 3 -14 6 -6 3 7 2 16 -1 19 -3 4 -6 -2 -5 -13z M5422 3915 c0 -16 2 -22 5 -12 2 9 2 23 0 30 -3 6 -5 -1 -5 -18z M6925 3441 c-6 -4 -55 -32 -110 -61 -55 -29 -158 -84 -230 -123 -71 -38 -160 -86 -197 -106 -38 -20 -68 -38 -68 -41 0 -3 47 -23 105 -44 94 -34 104 -40 93 -55 -10 -13 -10 -14 2 -3 8 6 17 12 21 12 15 0 69 -52 63 -61 -3 -5 0 -9 6 -9 6 0 37 -40 69 -89 l58 -89 108 326 c59 180 109 333 111 340 4 14 -17 16 -31 3z M4679 3253 c-13 -16 -12 -17 4 -4 9 7 17 15 17 17 0 8 -8 3 -21 -13z M5129 3063 c-13 -16 -12 -17 4 -4 9 7 17 15 17 17 0 8 -8 3 -21 -13z M6544 2898 l-19 -23 23 19 c12 11 22 21 22 23 0 8 -8 2 -26 -19z M6344 2828 l-19 -23 23 19 c21 18 27 26 19 26 -2 0 -12 -10 -23 -22z M6384 2728 l-19 -23 23 19 c12 11 22 21 22 23 0 8 -8 2 -26 -19z M6159 2633 c-13 -16 -12 -17 4 -4 9 7 17 15 17 17 0 8 -8 3 -21 -13z M3754 2608 l-29 -33 33 29 c17 17 32 31 32 33 0 8 -8 1 -36 -29z M6224 2558 l-19 -23 23 19 c12 11 22 21 22 23 0 8 -8 2 -26 -19z M4282 2410 c0 -14 2 -19 5 -12 2 6 2 18 0 25 -3 6 -5 1 -5 -13z M6059 2383 l-24 -28 28 24 c25 23 32 31 24 31 -2 0 -14 -12 -28 -27z M4282 2325 c0 -16 2 -22 5 -12 2 9 2 23 0 30 -3 6 -5 -1 -5 -18z M5829 2283 l-24 -28 28 24 c15 14 27 26 27 28 0 8 -8 1 -31 -24z M5894 2208 l-19 -23 23 19 c12 11 22 21 22 23 0 8 -8 2 -26 -19z M5659 2103 l-24 -28 28 24 c15 14 27 26 27 28 0 8 -8 1 -31 -24z M5709 2013 c-13 -16 -12 -17 4 -4 16 13 21 21 13 21 -2 0 -10 -8 -17 -17z M2995 1970 c-3 -5 -1 -10 4 -10 6 0 11 5 11 10 0 6 -2 10 -4 10 -3 0 -8 -4 -11 -10z M5455 1888 l-40 -43 43 40 c39 36 47 45 39 45 -2 0 -21 -19 -42 -42z M5524 1818 l-29 -33 33 29 c17 17 32 31 32 33 0 8 -8 1 -36 -29z M5094 1508 l-19 -23 23 19 c12 11 22 21 22 23 0 8 -8 2 -26 -19z M5114 1388 l-19 -23 23 19 c12 11 22 21 22 23 0 8 -8 2 -26 -19z M4655 1230 c-233 -26 -358 -76 -464 -184 -51 -52 -53 -50 79 -61 107 -9 116 -21 23 -29 -90 -8 -169 -29 -234 -62 -49 -24 -179 -130 -179 -145 0 -5 33 -9 73 -10 39 0 92 -4 117 -8 l45 -7 -70 -12 c-202 -37 -318 -86 -398 -170 -27 -29 -28 -30 -9 -36 32 -11 169 -26 282 -32 l105 -6 365 368 c201 203 372 377 379 387 15 20 9 20 -114 7z M4799 1203 l-24 -28 28 24 c25 23 32 31 24 31 -2 0 -14 -12 -28 -27z M4541 746 l-384 -384 2 -144 c2 -147 8 -208 21 -208 19 0 119 112 147 165 33 62 67 174 79 257 3 26 10 45 16 42 5 -4 6 -53 2 -126 -7 -116 -6 -120 12 -110 36 19 142 138 167 187 33 66 57 164 57 231 0 30 5 54 10 54 6 0 10 -31 10 -72 0 -40 3 -97 7 -126 l6 -53 34 33 c46 43 119 145 139 194 9 22 23 64 30 95 14 60 38 306 32 333 -2 11 -125 -106 -387 -368z M4754 1018 l-29 -33 33 29 c17 17 32 31 32 33 0 8 -8 1 -36 -29z M4175 570 c-66 -66 -117 -120 -115 -120 3 0 59 54 125 120 66 66 117 120 115 120 -3 0 -59 -54 -125 -120z M4004 398 l-19 -23 23 19 c12 11 22 21 22 23 0 8 -8 2 -26 -19z"/></g></svg>',
  );
const SEARCH_INDEX_URL = '/search-index.json';

let searchOpener: (() => void) | null = null;
let searchModal: Entity | null = null;
let searchParent: Scene | null = null;
let searchPanel: { x: number; y: number; w: number; h: number } | null = null;
let searchNavRows: Entity[] = [];
let searchSelected = -1;

function closeSearch(): void {
  if (!searchModal || !searchParent) return;
  searchParent.remove(searchModal);
  searchModal = null;
  searchParent = null;
  searchPanel = null;
  searchNavRows = [];
  searchSelected = -1;
  document.removeEventListener('keydown', onSearchKey);
  document.removeEventListener('pointerdown', onSearchBackdrop);
}

const setSearchSelected = (i: number): void => {
  searchSelected = i;
  searchNavRows.forEach((row, idx) => {
    (row as unknown as { selected?: boolean }).selected = idx === i;
  });
  searchParent?.markDirty();
};

const onSearchKey = (e: KeyboardEvent): void => {
  if (e.key === 'Escape') {
    closeSearch();
    return;
  }
  if (!searchModal || searchNavRows.length === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSearchSelected(Math.min(searchSelected + 1, searchNavRows.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSearchSelected(Math.max(searchSelected - 1, 0));
  } else if (e.key === 'Enter' && searchSelected >= 0) {
    e.preventDefault();
    searchNavRows[searchSelected].emit('click');
  }
};

const onSearchBackdrop = (e: PointerEvent): void => {
  if (!searchPanel) return;
  const inPanel =
    e.clientX >= searchPanel.x &&
    e.clientX <= searchPanel.x + searchPanel.w &&
    e.clientY >= searchPanel.y &&
    e.clientY <= searchPanel.y + searchPanel.h;
  if (!inPanel) closeSearch();
};

/** Global Ctrl/Cmd+K opens the search modal (registered once per page load). */
export function registerSearchShortcut(): void {
  if ((document as unknown as { __vectoSearchShortcut?: boolean }).__vectoSearchShortcut) return;
  (document as unknown as { __vectoSearchShortcut?: boolean }).__vectoSearchShortcut = true;
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchOpener?.();
    }
  });
}

export type ActiveSection = 'home' | 'learn' | 'reference' | 'blog';

export interface NavbarOptions {
  colors: ThemeColors;
  lang: Locale;
  active: ActiveSection;
  viewportWidth: number;
  /** Mobile breakpoint decision from the caller (single source of truth). */
  isMobile: boolean;
  /** Flip `data-theme` + localStorage, then rebuild (theme change). */
  onThemeChange: () => void;
  /** Navigate to a fully-qualified site URL (locale-switched). */
  onNavigate: (url: string) => void;
}

interface SearchEntry {
  title: string;
  href: string;
  section: string;
  lang: string;
}

function themeName(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Clickable nav text link with hover colouring (desktop + drawer). */
export class NavLink extends Text {
  readonly href: string;
  private baseColor: string;
  private hoverColor: string;
  private isExternal: boolean;

  constructor(
    text: string,
    href: string,
    opts: {
      font: string;
      color: string;
      hoverColor: string;
      active?: boolean;
      external?: boolean;
      onNavigate: (url: string) => void;
    },
  ) {
    super(text, {
      font: opts.font,
      color: opts.active ? opts.hoverColor : opts.color,
    });
    this.interactive = true;
    this.href = href;
    this.baseColor = opts.active ? opts.hoverColor : opts.color;
    this.hoverColor = opts.hoverColor;
    this.isExternal = opts.external ?? false;
    this.on('hover', () => this.setHovered(true));
    this.on('pointerleave', () => this.setHovered(false));
    this.on('click', () => {
      if (this.isExternal) {
        window.open(this.href, '_blank', 'noopener');
      } else {
        opts.onNavigate(this.href);
      }
    });
  }

  public getA11yAttributes(): Record<string, string> {
    return { role: 'link', label: this.text };
  }

  private setHovered(hovered: boolean): void {
    const next = hovered ? this.hoverColor : this.baseColor;
    if (this.color === next) return;
    this.color = next;
    (this as unknown as { scene?: Scene }).scene?.markDirty();
  }
}

/** Icon-only button drawn from simple geometry (search, theme, hamburger). */
export class IconButton extends Entity {
  private kind: 'sun' | 'moon' | 'search' | 'globe' | 'hamburger';
  private baseColor: string;
  private hoverColor: string;
  private size: number;
  private onClick: () => void;
  private label: string;
  private hovered = false;

  constructor(
    kind: IconButton['kind'],
    size: number,
    baseColor: string,
    hoverColor: string,
    label: string,
    onClick: () => void,
  ) {
    super();
    this.kind = kind;
    this.size = size;
    this.baseColor = baseColor;
    this.hoverColor = hoverColor;
    this.label = label;
    this.onClick = onClick;
    this.width = size;
    this.height = size;
    this.interactive = true;
    this.on('hover', () => {
      this.hovered = true;
      (this as unknown as { scene?: Scene }).scene?.markDirty();
    });
    this.on('pointerleave', () => {
      this.hovered = false;
      (this as unknown as { scene?: Scene }).scene?.markDirty();
    });
    this.on('click', () => this.onClick());
  }

  public getA11yAttributes(): Record<string, string> {
    return { role: 'button', label: this.label };
  }

  public render(r: IRenderer): void {
    const color = this.hovered ? this.hoverColor : this.baseColor;
    const s = this.size;
    const c = s / 2;
    const lw = 1.8;
    r.save();
    switch (this.kind) {
      case 'sun': {
        r.beginPath();
        r.arc(c, c, s * 0.175, 0, Math.PI * 2);
        r.fill(color);
        r.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          r.moveTo(c + Math.cos(a) * s * 0.3, c + Math.sin(a) * s * 0.3);
          r.lineTo(c + Math.cos(a) * s * 0.42, c + Math.sin(a) * s * 0.42);
        }
        r.stroke(color, lw);
        break;
      }
      case 'moon': {
        r.beginPath();
        r.arc(c, c, s * 0.38, 0, Math.PI * 2);
        r.arc(s * 0.34, s * 0.4, s * 0.42, 0, Math.PI * 2, true);
        r.fill(color);
        break;
      }
      case 'search': {
        r.beginPath();
        r.arc(c, c, s * 0.26, 0, Math.PI * 2);
        r.stroke(color, lw);
        r.beginPath();
        r.moveTo(c + s * 0.2, c + s * 0.2);
        r.lineTo(c + s * 0.42, c + s * 0.42);
        r.stroke(color, lw);
        break;
      }
      case 'globe': {
        r.beginPath();
        r.arc(c, c, s * 0.38, 0, Math.PI * 2);
        r.stroke(color, lw);
        r.beginPath();
        r.moveTo(c, s * 0.12);
        r.lineTo(c, s * 0.88);
        r.stroke(color, lw);
        r.beginPath();
        r.moveTo(s * 0.12, c);
        r.lineTo(s * 0.88, c);
        r.stroke(color, lw);
        break;
      }
      case 'hamburger': {
        for (let i = 0; i < 3; i++) {
          r.beginPath();
          r.moveTo(s * 0.22, s * (0.3 + i * 0.2));
          r.lineTo(s * 0.78, s * (0.3 + i * 0.2));
          r.stroke(color, 2);
        }
        break;
      }
    }
    r.restore();
  }
}

/**
 * Cached bitmap loader shared by every LogoMark: the SVG data URLs are large,
 * and decoding them is async — an uncached per-navbar Image entity flashes a
 * placeholder on every rebuild (resize, theme flip, navigation). One cached
 * HTMLImageElement per variant means the second and later navbar builds draw
 * the logo on their first frame.
 */
const logoBitmaps = new Map<string, HTMLImageElement>();
function getLogoBitmap(src: string): HTMLImageElement {
  let img = logoBitmaps.get(src);
  if (!img) {
    img = document.createElement('img');
    img.src = src;
    logoBitmaps.set(src, img);
  }
  return img;
}

/** The site logo mark, drawn from a cached bitmap (see getLogoBitmap). */
export class LogoMark extends Entity {
  private readonly bitmap: HTMLImageElement;

  constructor(
    src: string,
    size: number,
    height: number,
    private readonly onFirstLoad: () => void,
  ) {
    super();
    this.bitmap = getLogoBitmap(src);
    this.width = size;
    this.height = height;
    if (this.bitmap.complete && this.bitmap.naturalWidth > 0) {
      // Already decoded — draw on the first frame, no flash.
    } else {
      this.bitmap.addEventListener('load', () => this.onFirstLoad(), {
        once: true,
      });
    }
  }

  public render(r: IRenderer): void {
    // A failed load (broken image) must be skipped, never drawn — drawImage
    // throws InvalidStateError on a broken image and aborts the render pass.
    if (this.bitmap.complete && this.bitmap.naturalWidth > 0) {
      r.drawImage(this.bitmap, 0, 0, this.width, this.height);
    }
  }
}

/** GitHub mark loaded as an SVG data-URL so it renders via drawImage. */ export class GithubMark extends Entity {
  private size: number;
  private color: string;

  constructor(size: number, color: string, onClick: () => void) {
    super();
    this.size = size;
    this.color = color;
    this.width = size;
    this.height = size;
    this.interactive = true;
    this.on('click', () => onClick());
  }

  public getA11yAttributes(): Record<string, string> {
    return { role: 'link', label: 'GitHub' };
  }
  public render(r: IRenderer): void {
    if (!this.bitmap) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${this.color}"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"/></svg>`;
      const img = document.createElement('img');
      // MUST encodeURIComponent: a raw `#` in `fill="#…"` becomes a URL
      // fragment, truncating the SVG — Chrome then reports the image as
      // 'broken' and drawImage throws, killing the whole render loop.
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      this.bitmap = img;
    }
    // A failed load (broken image) must be skipped, never drawn — drawImage
    // throws InvalidStateError on a broken image and aborts the render pass.
    if (this.bitmap.complete && this.bitmap.naturalWidth > 0) {
      r.drawImage(this.bitmap, 0, 0, this.size, this.size);
    }
  }
}

/** The fixed top navigation bar: logo, search, links, theme, language, GitHub. */
export function createNavbar(parent: Scene, opts: NavbarOptions): NavbarHandle {
  const t = useTranslations(opts.lang);
  const root = new Entity();
  root.interactive = false;
  root.isPointInside = () => false;
  root.render = (): void => {};

  const viewportW = opts.viewportWidth;
  const containerW = Math.min(viewportW, LAYOUT.containerMax);
  const containerX = (viewportW - containerW) / 2;
  const contentX = containerX + LAYOUT.containerPad;
  const innerW = containerW - LAYOUT.containerPad * 2;
  const isMobile = opts.isMobile;
  const titleFont = '800 20px Outfit, sans-serif';
  const linkFont = '500 15.2px Inter, sans-serif';
  const active = opts.active;
  const nav = opts.colors;
  const currentTheme = themeName();

  // ── background bar ─────────────────────────────────────────────────────────
  const bar = new Entity();
  bar.isPointInside = () => false;
  bar.width = viewportW;
  bar.height = LAYOUT.navHeight;
  bar.render = (r: IRenderer): void => {
    fillRect(r, 0, 0, viewportW, LAYOUT.navHeight, hexToRgba(nav.bg, 0.95));
    fillRect(r, 0, LAYOUT.navHeight - 1, viewportW, 1, nav.divider);
  };
  root.add(bar);

  // ── logo ───────────────────────────────────────────────────────────────────
  const mark = new LogoMark(
    currentTheme === 'light' ? LOGO_MARK_LIGHT : LOGO_MARK_DARK,
    38,
    28,
    () => parent.markDirty(),
  );
  mark.x = contentX;
  mark.y = (LAYOUT.navHeight - 28) / 2;
  root.add(mark);

  const logo = new NavLink('Vecto', localizedPath('/', opts.lang), {
    font: titleFont,
    color: nav.strong,
    hoverColor: nav.strong,
    onNavigate: opts.onNavigate,
  });
  logo.x = contentX + 38 + 8;
  logo.y = (LAYOUT.navHeight - logo.height) / 2;
  root.add(logo);

  // ── right zone (links, theme, lang, github), laid out right-to-left ────────
  const linkGap = 28;
  let rightX = contentX + innerW;
  const placeRight = (el: Entity, w: number): void => {
    rightX -= w;
    el.x = rightX;
    rightX -= linkGap;
    root.add(el);
  };

  if (!isMobile) {
    const github = new GithubMark(20, nav.muted, () =>
      window.open(GITHUB_URL, '_blank', 'noopener'),
    );
    github.y = (LAYOUT.navHeight - 20) / 2;
    placeRight(github, 20);

    const themeBtn = new IconButton(
      currentTheme === 'light' ? 'moon' : 'sun',
      19,
      nav.muted,
      nav.text,
      currentTheme === 'light' ? t('theme.switchDark') : t('theme.switchLight'),
      () => opts.onThemeChange(),
    );
    themeBtn.y = (LAYOUT.navHeight - 19) / 2;
    placeRight(themeBtn, 19);

    const langPill = createLangPill(opts, t('lang.switcher'));
    langPill.y = (LAYOUT.navHeight - langPill.height) / 2;
    placeRight(langPill, langPill.width);

    const linkDefs: {
      label: string;
      href: string;
      active: boolean;
      external?: boolean;
    }[] = [
      // Placed right-to-left; the LAST entry renders leftmost, so this array
      // yields the display order Learn · Reference · Blog. (Gallery lives in
      // the hero CTA — an external link in the navbar would be a misclick.)
      { label: t('nav.blog'), href: '/blog/', active: active === 'blog' },
      {
        label: t('nav.reference'),
        href: localizedPath('/reference/core-api/', opts.lang),
        active: active === 'reference',
      },
      {
        label: t('nav.learn'),
        href: localizedPath('/learn/introduction/', opts.lang),
        active: active === 'learn',
      },
    ];
    for (const def of linkDefs) {
      const link = new NavLink(def.label, def.href, {
        font: linkFont,
        color: nav.text,
        hoverColor: nav.accent,
        active: def.active,
        external: def.external,
        onNavigate: opts.onNavigate,
      });
      link.y = (LAYOUT.navHeight - link.height) / 2;
      placeRight(link, link.width);
    }
  }

  // ── search pill, centred between logo and right zone ───────────────────────
  const pillW = Math.min(380, innerW * (isMobile ? 0.5 : 0.4));
  const pillH = 32;
  const leftEnd = contentX + 38 + 8 + (logo.width ?? 0) + 24;
  const rightStart = isMobile ? viewportW - contentX - 40 - 16 - pillW : rightX + linkGap;
  const pillX = Math.max(leftEnd, leftEnd + (Math.max(rightStart, leftEnd) - leftEnd - pillW) / 2);

  const searchBtn = new Entity();
  searchBtn.width = pillW;
  searchBtn.height = pillH;
  searchBtn.x = pillX;
  searchBtn.y = (LAYOUT.navHeight - pillH) / 2;
  searchBtn.interactive = true;
  searchBtn.on('click', () => openSearch(parent, opts));
  searchOpener = () => openSearch(parent, opts);
  searchBtn.getA11yAttributes = () => ({
    role: 'button',
    label: t('search.label'),
  });
  searchBtn.render = (r: IRenderer): void => {
    r.beginPath();
    r.roundRect(0, 0, pillW, pillH, 8);
    r.fill(nav.pillFill);
    r.stroke(nav.divider, 1);
  };
  root.add(searchBtn);

  const searchIcon = new IconButton('search', 15, nav.muted, nav.muted, '', () => {});
  searchIcon.interactive = false;
  searchIcon.x = pillX + 14;
  searchIcon.y = searchBtn.y + (pillH - 15) / 2;
  root.add(searchIcon);

  const searchLabel = new Text(t('search.short'), {
    font: '14px Inter, sans-serif',
    color: nav.muted,
  });
  searchLabel.x = pillX + 36;
  searchLabel.y = searchBtn.y + (pillH - searchLabel.height) / 2;
  root.add(searchLabel);

  const kbd = new Text('Ctrl K', {
    font: '12px Inter, sans-serif',
    color: nav.faint,
  });
  kbd.x = pillX + pillW - kbd.width - 14;
  kbd.y = searchBtn.y + (pillH - kbd.height) / 2;
  root.add(kbd);

  // ── hamburger (mobile) ─────────────────────────────────────────────────────
  let drawer: Entity | null = null;
  if (isMobile) {
    const burger = new IconButton('hamburger', 40, nav.text, nav.accent, t('nav.openMenu'), () => {
      if (drawer) {
        parent.remove(drawer);
        drawer = null;
      } else {
        drawer = createDrawer(parent, opts, () => {
          if (drawer) {
            parent.remove(drawer);
            drawer = null;
          }
        });
        parent.add(drawer);
      }
      parent.markDirty();
    });
    burger.x = viewportW - contentX - 40;
    burger.y = (LAYOUT.navHeight - 40) / 2;
    root.add(burger);
  }

  parent.add(root);

  return {
    root,
    destroy(): void {
      parent.remove(root);
    },
  };
}

export interface NavbarHandle {
  root: Entity;
  destroy(): void;
}

function createLangPill(opts: NavbarOptions, label: string): Entity {
  const nav = opts.colors;
  const pill = new Entity();
  pill.interactive = true;
  pill.height = 30;
  pill.getA11yAttributes = () => ({ role: 'button', label });
  const text = new Text(LOCALE_NAMES[opts.lang], {
    font: '500 14.4px Inter, sans-serif',
    color: nav.muted,
  });
  pill.width = text.width + 38;
  text.x = 10;
  text.y = (pill.height - text.height) / 2;
  pill.add(text);

  const globe = new IconButton('globe', 15, nav.muted, nav.muted, '', () => {});
  globe.interactive = false;
  globe.x = pill.width - 24;
  globe.y = (pill.height - 15) / 2;
  pill.add(globe);

  pill.render = (r: IRenderer): void => {
    r.beginPath();
    r.roundRect(0, 0, pill.width, pill.height, 10);
    r.stroke(nav.divider, 1);
  };

  let menu: Entity | null = null;
  let docClose: (() => void) | null = null;
  const closeMenu = (): void => {
    if (menu) {
      (pill as unknown as { scene?: Scene }).scene?.remove(menu);
      (pill as unknown as { scene?: Scene }).scene?.markDirty();
      menu = null;
    }
    if (docClose) {
      document.removeEventListener('pointerdown', docClose);
      docClose = null;
    }
  };
  const openMenu = (): void => {
    menu = createLangMenu(opts);
    const w = Math.min(200, opts.viewportWidth - 32);
    menu.x = pill.x + pill.width - w;
    menu.y = LAYOUT.navHeight + 8;
    (pill as unknown as { scene?: Scene }).scene?.add(menu);
    // The scene is onDemand — nothing repaints after the menu is attached.
    (pill as unknown as { scene?: Scene }).scene?.markDirty();
    const onDoc = (e: PointerEvent): void => {
      // Canvas entities receive pointer events as clicks on the canvas element;
      // decide inside/outside by coordinates, not by DOM target.
      const inMenu =
        menu !== null &&
        e.clientX >= menu.x &&
        e.clientX <= menu.x + menu.width &&
        e.clientY >= menu.y &&
        e.clientY <= menu.y + menu.height;
      if (!inMenu) closeMenu();
    };
    docClose = () => {
      document.removeEventListener('pointerdown', onDoc);
    };
    // Let the opening click finish propagating before listening for outside taps.
    setTimeout(() => document.addEventListener('pointerdown', onDoc), 0);
  };
  pill.on('click', () => {
    if (menu) closeMenu();
    else openMenu();
  });
  return pill;
}

function createLangMenu(opts: NavbarOptions): Entity {
  const nav = opts.colors;
  const itemH = 34;
  const panel = new Entity();
  panel.isPointInside = () => true;
  panel.width = 200;
  panel.height = LOCALES.length * itemH + 8;
  panel.render = (r: IRenderer): void => {
    r.beginPath();
    r.roundRect(0, 0, panel.width, panel.height, 12);
    r.fill(nav.surface2);
    r.stroke(nav.divider, 1);
  };
  LOCALES.forEach((loc, i) => {
    const isCurrent = loc === opts.lang;
    const item = new Text(LOCALE_NAMES[loc], {
      font: '14px Inter, sans-serif',
      color: isCurrent ? nav.accent : nav.text,
    });
    item.x = 12;
    item.y = 6 + i * itemH + (itemH - item.height) / 2;
    item.interactive = true;
    item.width = panel.width - 24;
    item.height = itemH;
    item.on('click', () => {
      const { rest } = parseLocale(window.location.pathname);
      const target = ['learn', 'reference'].includes(rest.split('/')[1] ?? '')
        ? localizedPath(rest, loc)
        : localizedPath('/', loc);
      if (loc !== opts.lang) opts.onNavigate(target);
    });
    panel.add(item);
  });
  return panel;
}

function createDrawer(parent: Scene, opts: NavbarOptions, close: () => void): Entity {
  const t = useTranslations(opts.lang);
  const nav = opts.colors;
  const w = Math.min(320, opts.viewportWidth - 32);
  const drawer = new Entity();
  drawer.isPointInside = () => true;
  drawer.width = w;
  drawer.x = opts.viewportWidth - w;
  drawer.y = LAYOUT.navHeight;
  drawer.render = (r: IRenderer): void => {
    fillRect(r, 0, 0, w, drawer.height, nav.bg);
    fillRect(r, 0, drawer.height - 1, w, 1, nav.divider);
    fillRect(r, 0, 0, 1, w, nav.divider);
  };

  const links: {
    label: string;
    href: string;
    active: boolean;
    external?: boolean;
  }[] = [
    {
      label: t('nav.learn'),
      href: localizedPath('/learn/introduction/', opts.lang),
      active: opts.active === 'learn',
    },
    {
      label: t('nav.reference'),
      href: localizedPath('/reference/core-api/', opts.lang),
      active: opts.active === 'reference',
    },
    { label: t('nav.blog'), href: '/blog/', active: opts.active === 'blog' },
  ];
  let y = 12;
  for (const def of links) {
    const link = new NavLink(def.label, def.href, {
      font: '16px Inter, sans-serif',
      color: nav.text,
      hoverColor: nav.accent,
      active: def.active,
      external: def.external,
      onNavigate: (url) => {
        close();
        opts.onNavigate(url);
      },
    });
    link.x = 20;
    link.y = y;
    drawer.add(link);
    y += link.height + 24;
  }

  const themeLabel = themeName() === 'light' ? t('theme.switchDark') : t('theme.switchLight');
  const themeRow = new Text(themeLabel, {
    font: '16px Inter, sans-serif',
    color: nav.text,
  });
  themeRow.x = 20;
  themeRow.y = y + 4;
  themeRow.interactive = true;
  themeRow.width = w - 40;
  themeRow.height = 28;
  themeRow.on('click', () => {
    close();
    opts.onThemeChange();
  });
  drawer.add(themeRow);
  y += 56;

  const langLabel = new Text(t('lang.label'), {
    font: '14px Inter, sans-serif',
    color: nav.muted,
  });
  langLabel.x = 20;
  langLabel.y = y;
  drawer.add(langLabel);
  y += langLabel.height + 8;

  LOCALES.forEach((loc) => {
    const isCurrent = loc === opts.lang;
    const item = new Text(LOCALE_NAMES[loc], {
      font: '15px Inter, sans-serif',
      color: isCurrent ? nav.accent : nav.text,
    });
    item.x = 32;
    item.y = y;
    item.interactive = true;
    item.width = w - 64;
    item.height = 26;
    item.on('click', () => {
      close();
      const { rest } = parseLocale(window.location.pathname);
      const target = ['learn', 'reference'].includes(rest.split('/')[1] ?? '')
        ? localizedPath(rest, loc)
        : localizedPath('/', loc);
      if (loc !== opts.lang) opts.onNavigate(target);
    });
    drawer.add(item);
    y += 30;
  });
  drawer.height = y + 12;
  return drawer;
}

/** Search modal: backdrop + panel + input + filtered result list. */
function openSearch(parent: Scene, opts: NavbarOptions): void {
  if (searchModal) {
    closeSearch();
    return;
  }
  const t = useTranslations(opts.lang);
  const nav = opts.colors;
  const viewportW = opts.viewportWidth;
  const viewportH = window.innerHeight;

  const modal = new Entity();
  modal.isPointInside = () => true;
  modal.width = viewportW;
  modal.height = viewportH;
  modal.render = (r: IRenderer): void => {
    fillRect(r, 0, 0, viewportW, viewportH, 'rgba(0,0,0,0.65)');
  };

  const panelW = Math.min(620, viewportW - 48);
  const panelX = (viewportW - panelW) / 2;
  const panelTop = Math.max(64, viewportH * 0.14);
  const panelH = 480;
  const panel = new Entity();
  panel.isPointInside = () => true;
  panel.width = panelW;
  panel.height = panelH;
  panel.x = panelX;
  panel.y = panelTop;
  panel.render = (r: IRenderer): void => {
    r.beginPath();
    r.roundRect(0, 0, panelW, panelH, 16);
    r.fill(nav.surface2);
    r.stroke(nav.borderStrong, 1);
  };
  modal.add(panel);

  const fieldIcon = new IconButton('search', 18, nav.muted, nav.muted, '', () => {});
  fieldIcon.interactive = false;
  fieldIcon.x = 20;
  fieldIcon.y = 17;
  panel.add(fieldIcon);

  const input = new Input({
    width: panelW - 96,
    height: 40,
    placeholder: t('search.placeholder'),
    font: '16px Inter, sans-serif',
    color: nav.text,
    placeholderColor: nav.faint,
    bg: 'transparent',
    border: 'transparent',
    radius: 0,
    padding: 0,
    onChange: (v: string) => {
      renderResults(v);
      parent.markDirty();
    },
  });
  input.x = 46;
  input.y = 6;
  panel.add(input);

  const divider = new Entity();
  divider.width = panelW;
  divider.height = 1;
  divider.y = 52;
  divider.isPointInside = () => false;
  divider.render = (r: IRenderer): void => {
    fillRect(r, 0, 0, panelW, 1, nav.divider);
  };
  panel.add(divider);

  const resultsRoot = new Entity();
  resultsRoot.isPointInside = () => false;
  resultsRoot.render = (): void => {};
  resultsRoot.x = 20;
  resultsRoot.y = 72;
  panel.add(resultsRoot);

  const hint = new Text(t('search.hint'), {
    font: '15px Inter, sans-serif',
    color: nav.faint,
  });
  resultsRoot.add(hint);

  let index: SearchEntry[] | null = null;
  let rows: Entity[] = [];
  const maxRows = Math.floor((panelH - 72 - 16) / 48);

  const clearRows = (): void => {
    for (const row of rows) resultsRoot.remove(row);
    rows = [];
    searchNavRows = [];
    searchSelected = -1;
  };

  const renderResults = (query: string): void => {
    clearRows();
    const q = query.trim().toLowerCase();
    if (!index || q === '') {
      if (hint.parent !== resultsRoot) resultsRoot.add(hint);
      parent.markDirty();
      return;
    }
    if (hint.parent === resultsRoot) resultsRoot.remove(hint);
    const hits = index
      .filter((e) => e.lang === opts.lang)
      .filter((e) => e.title.toLowerCase().includes(q) || e.section.toLowerCase().includes(q))
      .slice(0, maxRows);
    if (hits.length === 0) {
      const empty = new Text(t('search.noResults').replace('{query}', query), {
        font: '15px Inter, sans-serif',
        color: nav.faint,
      });
      resultsRoot.add(empty);
      rows.push(empty);
      return;
    }
    hits.forEach((hit, i) => {
      const row = new Entity();
      row.interactive = true;
      row.width = panelW - 40;
      row.height = 44;
      row.y = i * 48;
      row.isPointInside = (gx: number, gy: number): boolean => {
        const lx = gx - row.x;
        const ly = gy - row.y;
        return lx >= 0 && lx < row.width && ly >= 0 && ly < row.height;
      };
      row.render = (r: IRenderer): void => {
        const st = row as unknown as { hovered?: boolean; selected?: boolean };
        if (st.selected) {
          fillRect(r, 0, 0, row.width, 44, nav.rowHover);
          fillRect(r, 0, 0, 3, 44, nav.accent);
        } else if (st.hovered) {
          fillRect(r, 0, 0, row.width, 44, nav.rowHover);
        }
      };
      row.getA11yAttributes = () => ({
        role: 'link',
        label: `${hit.title} — ${hit.section}`,
        tabIndex: -1,
      });
      row.on('hover', () => {
        (row as unknown as { hovered?: boolean }).hovered = true;
        parent.markDirty();
      });
      row.on('pointerleave', () => {
        (row as unknown as { hovered?: boolean }).hovered = false;
        parent.markDirty();
      });
      row.on('click', () => {
        closeSearch();
        opts.onNavigate(localizedPath(hit.href, opts.lang));
      });
      const title = new Text(hit.title, {
        font: '15px Inter, sans-serif',
        color: nav.text,
      });
      title.x = 4;
      title.y = 4;
      const section = new Text(hit.section, {
        font: '12px Inter, sans-serif',
        color: nav.faint,
      });
      section.x = 4;
      section.y = title.y + title.height + 2;
      row.add(title);
      row.add(section);
      resultsRoot.add(row);
      rows.push(row);
    });
    searchNavRows = rows.slice();
  };

  document.addEventListener('keydown', onSearchKey);
  document.addEventListener('pointerdown', onSearchBackdrop);
  parent.add(modal);
  // The scene is onDemand — nothing repaints after the modal is attached.
  parent.markDirty();
  searchModal = modal;
  searchParent = parent;
  searchPanel = { x: panelX, y: panelTop, w: panelW, h: panelH };
  // Focus after a frame so the a11y projection has materialized.
  requestAnimationFrame(() => {
    input.focus?.();
  });

  fetch(SEARCH_INDEX_URL)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error('no index'))))
    .then((data: SearchEntry[]) => {
      index = data;
      renderResults(input.value ?? '');
    })
    .catch(() => {
      index = [];
      renderResults('');
    });
}
