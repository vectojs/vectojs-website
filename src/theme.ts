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
  divider: 'rgba(255,255,255,0.08)',
  codeBg: '#1e293b',
  codeText: '#7c85ff',
  quoteBorder: '#6366f1',
  syntaxKeyword: '#f87171',
  syntaxString: '#34d399',
  syntaxComment: '#64748b',
  syntaxNumber: '#fbbf24',
  progressBar: '#6366f1',

  // ── old-site chrome tokens (styles.css :root, dark) ──────────────────────
  bgCard: 'rgba(17,24,39,0.7)',
  glass: 'rgba(15,23,42,0.6)',
  surface2: '#0a0e1a',
  text2: '#cbd5e1',
  faint: '#64748b',
  strong: '#ffffff',
  primary: '#6366f1',
  primaryStrong: '#4f46e5',
  primaryLight: '#a5b4fc',
  accent: '#38bdf8',
  accentLight: '#a5f3fc',
  info: '#5b9cff',
  infoLight: '#9db8ff',
  borderStrong: 'rgba(255,255,255,0.15)',
  pillFill: 'rgba(255,255,255,0.04)',
  rowHover: 'rgba(255,255,255,0.05)',
});

const LIGHT_THEME = tokens({
  bg: '#f8fafc',
  text: '#111827',
  heading: '#111827',
  muted: '#6b7280',
  divider: 'rgba(15,23,42,0.1)',
  codeBg: '#f9fafb',
  codeText: '#4f46e5',
  quoteBorder: '#4f46e5',
  syntaxKeyword: '#dc2626',
  syntaxString: '#059669',
  syntaxComment: '#9ca3af',
  syntaxNumber: '#d97706',
  progressBar: '#4f46e5',

  // ── old-site chrome tokens (styles.css [data-theme=light]) ───────────────
  bgCard: 'rgba(255,255,255,0.85)',
  glass: 'rgba(255,255,255,0.7)',
  surface2: '#eef2f7',
  text2: '#334155',
  faint: '#94a3b8',
  strong: '#0f172a',
  primary: '#6366f1',
  primaryStrong: '#4f46e5',
  primaryLight: '#4338ca',
  accent: '#38bdf8',
  accentLight: '#0369a1',
  info: '#2563eb',
  infoLight: '#2563eb',
  borderStrong: 'rgba(15,23,42,0.18)',
  pillFill: 'rgba(15,23,42,0.04)',
  rowHover: 'rgba(15,23,42,0.06)',
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
  bgCard: string;
  glass: string;
  surface2: string;
  text2: string;
  faint: string;
  strong: string;
  primary: string;
  primaryStrong: string;
  primaryLight: string;
  accent: string;
  accentLight: string;
  info: string;
  infoLight: string;
  borderStrong: string;
  pillFill: string;
  rowHover: string;
}

/** The current theme's resolved values, one property per token. */
export function resolveThemeColors(): ThemeColors {
  // @vectojs/styles' Theme is `{ tokens: ThemeTokenSet }` — tokens live under
  // `.tokens`, not on the theme object itself.
  const active = getTheme().tokens;
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
    bgCard: active.bgCard,
    glass: active.glass,
    surface2: active.surface2,
    text2: active.text2,
    faint: active.faint,
    strong: active.strong,
    primary: active.primary,
    primaryStrong: active.primaryStrong,
    primaryLight: active.primaryLight,
    accent: active.accent,
    accentLight: active.accentLight,
    info: active.info,
    infoLight: active.infoLight,
    borderStrong: active.borderStrong,
    pillFill: active.pillFill,
    rowHover: active.rowHover,
  };
}

/** Site chrome geometry, taken from the old site's styles.css. */
export const LAYOUT = {
  /** .container max width. */
  containerMax: 1200,
  /** .container horizontal padding. */
  containerPad: 32,
  /** .navbar padding + content height (~56px). */
  navHeight: 56,
  /** .features-section vertical padding. */
  sectionPad: 128,
  /** .metrics-section / .usecases-section vertical padding. */
  sectionPadCompact: 96,
  /** .hero-section min-height fraction of the viewport. */
  heroMinHeight: 0.88,
  /** .footer padding + .footer margin-top. */
  footerPad: 48,
  footerMarginTop: 128,
  /** Card radiuses. */
  cardRadius: 16,
  tileRadius: 12,
  /** Breakpoints (old site). */
  breakpointWide: 1100,
  breakpointMobile: 768,
  breakpointNarrow: 560,
} as const;

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
