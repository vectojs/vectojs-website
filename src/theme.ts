/** Every colour the app paints, resolved for one theme. */
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

/**
 * Resolve the palette from the `data-theme` attribute that the inline script in
 * `templates/base.html` sets before first paint.
 *
 * Read at render time, never cached: a rebuild is what applies a theme change,
 * and the attribute is the single source of truth for which one is active. Dark
 * is the default so a missing attribute cannot flash a light canvas.
 */
export function resolveThemeColors(): ThemeColors {
  const isDark =
    typeof document === 'undefined' ||
    document.documentElement.getAttribute('data-theme') !== 'light';

  return {
    bg: isDark ? '#0b0f19' : '#f8fafc',
    text: isDark ? '#e2e8f0' : '#111827',
    heading: isDark ? '#f1f5f9' : '#111827',
    muted: isDark ? '#64748b' : '#6b7280',
    divider: isDark ? '#1e293b' : '#e5e7eb',
    codeBg: isDark ? '#1e293b' : '#f9fafb',
    codeText: isDark ? '#7c85ff' : '#4f46e5',
    quoteBorder: isDark ? '#6366f1' : '#4f46e5',
    syntaxKeyword: isDark ? '#f87171' : '#dc2626',
    syntaxString: isDark ? '#34d399' : '#059669',
    syntaxComment: isDark ? '#64748b' : '#9ca3af',
    syntaxNumber: isDark ? '#fbbf24' : '#d97706',
    progressBar: isDark ? '#6366f1' : '#4f46e5',
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
