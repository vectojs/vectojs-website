import { getTheme, setTheme, tokens, type Theme } from '@vectojs/styles';

/**
 * The website palette as @vectojs/styles token sets.
 *
 * The tokens are the same values the old Astro site used (dark is the
 * default), so the canvas SPA keeps the inherited look while the palette now
 * lives in one place and switches through the styles package.
 */
const DARK_THEME = tokens({
  bg: '#0b0f19',
  text: '#e2e8f0',
  heading: '#f1f5f9',
  muted: '#64748b',
  divider: '#1e293b',
  codeBg: '#1e293b',
  codeText: '#7c85ff',
  quoteBorder: '#6366f1',
  syntaxKeyword: '#f87171',
  syntaxString: '#34d399',
  syntaxComment: '#64748b',
  syntaxNumber: '#fbbf24',
  progressBar: '#6366f1',
});

const LIGHT_THEME = tokens({
  bg: '#f8fafc',
  text: '#111827',
  heading: '#111827',
  muted: '#6b7280',
  divider: '#e5e7eb',
  codeBg: '#f9fafb',
  codeText: '#4f46e5',
  quoteBorder: '#4f46e5',
  syntaxKeyword: '#dc2626',
  syntaxString: '#059669',
  syntaxComment: '#9ca3af',
  syntaxNumber: '#d97706',
  progressBar: '#4f46e5',
});

export const WEBSITE_THEMES: Record<'dark' | 'light', Theme> = {
  dark: DARK_THEME,
  light: LIGHT_THEME,
};

/** Name of the active theme, from the `data-theme` attribute set pre-paint. */
export function websiteThemeName(): 'dark' | 'light' {
  return typeof document === 'undefined' ||
    document.documentElement.getAttribute('data-theme') !== 'light'
    ? 'dark'
    : 'light';
}

/**
 * Activate one of the website themes in the @vectojs/styles layer.
 *
 * Entities styled with `var(--…)` are re-applied by `setTheme` automatically;
 * plain colors must be re-resolved via `resolveThemeColors()` (call sites
 * always re-resolve on rebuild, which is what applies a theme change).
 */
export function applyWebsiteTheme(name: 'dark' | 'light'): void {
  setTheme(WEBSITE_THEMES[name]);
}

/** Every colour the app paints, resolved from the active token set. */
export interface ThemeColors {
  bg: string;
  text: string;
  heading: string;
  muted: string;
  divider: string;
  codeBg: string;
  codeText: string;
  quoteBorder: string;
  syntaxKeyword: string;
  syntaxString: string;
  syntaxComment: string;
  syntaxNumber: string;
  progressBar: string;
}

/** The current theme's resolved values, one property per token. */
export function resolveThemeColors(): ThemeColors {
  const active = getTheme();
  return {
    bg: active.bg,
    text: active.text,
    heading: active.heading,
    muted: active.muted,
    divider: active.divider,
    codeBg: active.codeBg,
    codeText: active.codeText,
    quoteBorder: active.quoteBorder,
    syntaxKeyword: active.syntaxKeyword,
    syntaxString: active.syntaxString,
    syntaxComment: active.syntaxComment,
    syntaxNumber: active.syntaxNumber,
    progressBar: active.progressBar,
  };
}

/** Layout metrics derived from the viewport width. */
export interface LayoutMetrics {
  /** Full viewport width in logical CSS px. */
  width: number;
  /** Article column width, capped at 1024. */
  contentWidth: number;
  /** Left offset that centres the article column. */
  originX: number;
  /** Below the 768px article-column breakpoint. */
  isMobile: boolean;
}

/**
 * Derive the article column geometry from a logical CSS width.
 *
 * The breakpoint is measured on `contentWidth`, not the viewport, so the layout
 * responds to the column it actually has rather than to the window — the two
 * differ by the 40px gutter and by the sidebar when one is shown.
 */
export function resolveLayoutMetrics(width: number): LayoutMetrics {
  const contentWidth = Math.min(1024, width - 40);
  return {
    width,
    contentWidth,
    originX: (width - contentWidth) / 2,
    isMobile: contentWidth < 768,
  };
}
