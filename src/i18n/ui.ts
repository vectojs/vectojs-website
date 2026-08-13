import type { Locale } from './config';
import { DEFAULT_LOCALE } from './config';

/**
 * UI-chrome string dictionary (navigation, search, keyboard-shortcut help,
 * theme toggle, footer, language switcher, and the doc translation-fallback
 * banner). Content-body strings live in the Markdown docs themselves; this
 * covers only the surrounding application shell.
 *
 * Every locale defines every key (typed against the `en` baseline), so a
 * missing translation is a compile error rather than a silent English leak.
 */
export interface UIStrings {
  'nav.gallery': string;
  'nav.learn': string;
  'nav.reference': string;
  'nav.blog': string;
  'nav.github': string;
  'nav.home': string;
  'nav.openMenu': string;
  'nav.collapseSidebar': string;
  'nav.expandSidebar': string;
  'nav.mobileNav': string;
  'nav.siteNav': string;
  'nav.viewSource': string;
  'search.label': string;
  'search.short': string;
  'search.placeholder': string;
  'search.hint': string;
  'search.results': string;
  /** Empty-state text. `{query}` is replaced with the user's query. */
  'search.noResults': string;
  'search.dialog': string;
  'theme.toggle': string;
  'theme.switchLight': string;
  'theme.switchDark': string;
  'shortcuts.title': string;
  'shortcuts.close': string;
  'shortcuts.openSearch': string;
  'shortcuts.navResults': string;
  'shortcuts.openResult': string;
  'shortcuts.closeModal': string;
  'shortcuts.showHelp': string;
  'footer.copyright': string;
  'lang.label': string;
  'lang.switcher': string;
  /** Banner shown on a localized doc whose body has not been translated yet. */
  'fallback.notice': string;
  'toc.onThisPage': string;
  'toc.tableOfContents': string;
  'toc.expandToc': string;
  'toc.collapseToc': string;
  'doc.readingTime': string;
  'docs.menu': string;
  'docs.openNav': string;
  'docs.nav': string;
  'docs.resizeSidebar': string;
  'docs.resizeToc': string;
  'docs.toggleSidebar': string;
  'docs.collapseSidebar': string;
  'docs.toggleToc': string;
  'docs.collapseToc': string;
  'docs.feedbackPrompt': string;
  'docs.feedbackYes': string;
  'docs.feedbackNo': string;
  'docs.prev': string;
  'docs.next': string;
  'docs.pageNav': string;
}

const en: UIStrings = {
  'nav.gallery': 'Gallery',
  'nav.learn': 'Learn',
  'nav.reference': 'Reference',
  'nav.blog': 'Blog',
  'nav.github': 'GitHub',
  'nav.home': 'Vecto home',
  'nav.openMenu': 'Open menu',
  'nav.collapseSidebar': 'Open menu',
  'nav.expandSidebar': 'Expand sidebar',
  'nav.mobileNav': 'Mobile navigation',
  'nav.siteNav': 'Site navigation',
  'nav.viewSource': 'View source on GitHub',
  'search.label': 'Search documentation (Ctrl+K)',
  'search.short': 'Search docs…',
  'search.placeholder': 'Search documentation…',
  'search.hint': 'Start typing to search…',
  'search.results': 'Search results',
  'search.noResults': 'No results for "{query}"',
  'search.dialog': 'Search documentation',
  'theme.toggle': 'Toggle theme',
  'theme.switchLight': 'Switch to light theme',
  'theme.switchDark': 'Switch to dark theme',
  'shortcuts.title': 'Keyboard shortcuts',
  'shortcuts.close': 'Close shortcuts',
  'shortcuts.openSearch': 'Open search',
  'shortcuts.navResults': 'Navigate search results',
  'shortcuts.openResult': 'Open selected result',
  'shortcuts.closeModal': 'Close modal / search',
  'shortcuts.showHelp': 'Show this help panel',
  'footer.copyright': '© 2026 VectoJS. Built with VectoJS.',
  'lang.label': 'Language',
  'lang.switcher': 'Choose language',
  'fallback.notice': 'This page has not been translated yet and is shown in English.',
  'toc.onThisPage': 'On this page',
  'toc.tableOfContents': 'Table of contents',
  'toc.expandToc': 'Expand table of contents',
  'toc.collapseToc': 'Collapse table of contents',
  'doc.readingTime': 'min read',
  'docs.menu': 'Menu',
  'docs.openNav': 'Open navigation menu',
  'docs.nav': 'Documentation navigation',
  'docs.resizeSidebar': 'Resize navigation sidebar',
  'docs.resizeToc': 'Resize table of contents',
  'docs.toggleSidebar': 'Toggle sidebar',
  'docs.collapseSidebar': 'Collapse navigation sidebar',
  'docs.toggleToc': 'Toggle table of contents',
  'docs.collapseToc': 'Collapse table of contents',
  'docs.feedbackPrompt': 'Was this page helpful?',
  'docs.feedbackYes': 'Yes',
  'docs.feedbackNo': 'Needs work',
  'docs.prev': '← Previous',
  'docs.next': 'Next →',
  'docs.pageNav': 'Page navigation',
};

const zhCN: UIStrings = {
  'nav.gallery': '作品廊',
  'nav.learn': '学习',
  'nav.reference': '参考',
  'nav.blog': '博客',
  'nav.github': 'GitHub',
  'nav.home': 'Vecto 首页',
  'nav.openMenu': '打开菜单',
  'nav.collapseSidebar': '打开菜单',
  'nav.expandSidebar': '展开侧边栏',
  'nav.mobileNav': '移动端导航',
  'nav.siteNav': '站点导航',
  'nav.viewSource': '在 GitHub 上查看源码',
  'search.label': '搜索文档（Ctrl+K）',
  'search.short': '搜索文档…',
  'search.placeholder': '搜索文档…',
  'search.hint': '开始输入以搜索…',
  'search.results': '搜索结果',
  'search.noResults': '没有找到与“{query}”相关的结果',
  'search.dialog': '搜索文档',
  'theme.toggle': '切换主题',
  'theme.switchLight': '切换到浅色主题',
  'theme.switchDark': '切换到深色主题',
  'shortcuts.title': '键盘快捷键',
  'shortcuts.close': '关闭快捷键面板',
  'shortcuts.openSearch': '打开搜索',
  'shortcuts.navResults': '浏览搜索结果',
  'shortcuts.openResult': '打开选中结果',
  'shortcuts.closeModal': '关闭弹窗 / 搜索',
  'shortcuts.showHelp': '显示此帮助面板',
  'footer.copyright': '© 2026 VectoJS。由 VectoJS 构建。',
  'lang.label': '语言',
  'lang.switcher': '选择语言',
  'fallback.notice': '此页面尚未翻译，暂以英文显示。',
  'toc.onThisPage': '本页目录',
  'toc.tableOfContents': '目录',
  'toc.expandToc': '展开目录',
  'toc.collapseToc': '收起目录',
  'doc.readingTime': '分钟阅读',
  'docs.menu': '菜单',
  'docs.openNav': '打开导航菜单',
  'docs.nav': '文档导航',
  'docs.resizeSidebar': '调整导航侧栏宽度',
  'docs.resizeToc': '调整目录宽度',
  'docs.toggleSidebar': '切换侧栏',
  'docs.collapseSidebar': '收起导航侧栏',
  'docs.toggleToc': '切换目录',
  'docs.collapseToc': '收起目录',
  'docs.feedbackPrompt': '这个页面有帮助吗？',
  'docs.feedbackYes': '有帮助',
  'docs.feedbackNo': '需改进',
  'docs.prev': '← 上一页',
  'docs.next': '下一页 →',
  'docs.pageNav': '页面导航',
};

const zhTW: UIStrings = {
  'nav.gallery': '作品廊',
  'nav.learn': '學習',
  'nav.reference': '參考',
  'nav.blog': '部落格',
  'nav.github': 'GitHub',
  'nav.home': 'Vecto 首頁',
  'nav.openMenu': '開啟選單',
  'nav.collapseSidebar': '開啟選單',
  'nav.expandSidebar': '展開側邊欄',
  'nav.mobileNav': '行動裝置導覽',
  'nav.siteNav': '網站導覽',
  'nav.viewSource': '在 GitHub 上檢視原始碼',
  'search.label': '搜尋文件（Ctrl+K）',
  'search.short': '搜尋文件…',
  'search.placeholder': '搜尋文件…',
  'search.hint': '開始輸入以搜尋…',
  'search.results': '搜尋結果',
  'search.noResults': '沒有找到與「{query}」相關的結果',
  'search.dialog': '搜尋文件',
  'theme.toggle': '切換佈景主題',
  'theme.switchLight': '切換至淺色主題',
  'theme.switchDark': '切換至深色主題',
  'shortcuts.title': '鍵盤快速鍵',
  'shortcuts.close': '關閉快速鍵面板',
  'shortcuts.openSearch': '開啟搜尋',
  'shortcuts.navResults': '瀏覽搜尋結果',
  'shortcuts.openResult': '開啟選取結果',
  'shortcuts.closeModal': '關閉視窗 / 搜尋',
  'shortcuts.showHelp': '顯示此說明面板',
  'footer.copyright': '© 2026 VectoJS。以 VectoJS 建置。',
  'lang.label': '語言',
  'lang.switcher': '選擇語言',
  'fallback.notice': '此頁面尚未翻譯，暫以英文顯示。',
  'toc.onThisPage': '本頁目錄',
  'toc.tableOfContents': '目錄',
  'toc.expandToc': '展開目錄',
  'toc.collapseToc': '收合目錄',
  'doc.readingTime': '分鐘閱讀',
  'docs.menu': '選單',
  'docs.openNav': '開啟導覽選單',
  'docs.nav': '文件導覽',
  'docs.resizeSidebar': '調整導覽側欄寬度',
  'docs.resizeToc': '調整目錄寬度',
  'docs.toggleSidebar': '切換側欄',
  'docs.collapseSidebar': '收合導覽側欄',
  'docs.toggleToc': '切換目錄',
  'docs.collapseToc': '收合目錄',
  'docs.feedbackPrompt': '這個頁面有幫助嗎？',
  'docs.feedbackYes': '有幫助',
  'docs.feedbackNo': '需改進',
  'docs.prev': '← 上一頁',
  'docs.next': '下一頁 →',
  'docs.pageNav': '頁面導覽',
};

const ja: UIStrings = {
  'nav.gallery': 'ギャラリー',
  'nav.learn': '学ぶ',
  'nav.reference': 'リファレンス',
  'nav.blog': 'ブログ',
  'nav.github': 'GitHub',
  'nav.home': 'Vecto ホーム',
  'nav.openMenu': 'メニューを開く',
  'nav.collapseSidebar': 'メニューを開く',
  'nav.expandSidebar': 'サイドバーを展開',
  'nav.mobileNav': 'モバイルナビゲーション',
  'nav.siteNav': 'サイトナビゲーション',
  'nav.viewSource': 'GitHub でソースを見る',
  'search.label': 'ドキュメントを検索（Ctrl+K）',
  'search.short': 'ドキュメントを検索…',
  'search.placeholder': 'ドキュメントを検索…',
  'search.hint': '入力して検索…',
  'search.results': '検索結果',
  'search.noResults': '「{query}」に一致する結果はありません',
  'search.dialog': 'ドキュメントを検索',
  'theme.toggle': 'テーマを切り替え',
  'theme.switchLight': 'ライトテーマに切り替え',
  'theme.switchDark': 'ダークテーマに切り替え',
  'shortcuts.title': 'キーボードショートカット',
  'shortcuts.close': 'ショートカットを閉じる',
  'shortcuts.openSearch': '検索を開く',
  'shortcuts.navResults': '検索結果を移動',
  'shortcuts.openResult': '選択した結果を開く',
  'shortcuts.closeModal': 'モーダル / 検索を閉じる',
  'shortcuts.showHelp': 'このヘルプパネルを表示',
  'footer.copyright': '© 2026 VectoJS. VectoJS で構築。',
  'lang.label': '言語',
  'lang.switcher': '言語を選択',
  'fallback.notice': 'このページはまだ翻訳されておらず、英語で表示されています。',
  'toc.onThisPage': 'このページの内容',
  'toc.tableOfContents': '目次',
  'toc.expandToc': '目次を展開',
  'toc.collapseToc': '目次を折りたたむ',
  'doc.readingTime': '分で読めます',
  'docs.menu': 'メニュー',
  'docs.openNav': 'ナビゲーションメニューを開く',
  'docs.nav': 'ドキュメントナビゲーション',
  'docs.resizeSidebar': 'ナビゲーションサイドバーの幅を調整',
  'docs.resizeToc': '目次の幅を調整',
  'docs.toggleSidebar': 'サイドバーを切り替え',
  'docs.collapseSidebar': 'ナビゲーションサイドバーを折りたたむ',
  'docs.toggleToc': '目次を切り替え',
  'docs.collapseToc': '目次を折りたたむ',
  'docs.feedbackPrompt': 'このページは役に立ちましたか？',
  'docs.feedbackYes': 'はい',
  'docs.feedbackNo': '改善が必要',
  'docs.prev': '← 前へ',
  'docs.next': '次へ →',
  'docs.pageNav': 'ページナビゲーション',
};

const fr: UIStrings = {
  'nav.gallery': 'Galerie',
  'nav.learn': 'Apprendre',
  'nav.reference': 'Référence',
  'nav.blog': 'Blog',
  'nav.github': 'GitHub',
  'nav.home': 'Accueil Vecto',
  'nav.openMenu': 'Ouvrir le menu',
  'nav.collapseSidebar': 'Ouvrir le menu',
  'nav.expandSidebar': 'Déplier la barre latérale',
  'nav.mobileNav': 'Navigation mobile',
  'nav.siteNav': 'Navigation du site',
  'nav.viewSource': 'Voir la source sur GitHub',
  'search.label': 'Rechercher dans la documentation (Ctrl+K)',
  'search.short': 'Rechercher…',
  'search.placeholder': 'Rechercher dans la documentation…',
  'search.hint': 'Commencez à taper pour rechercher…',
  'search.results': 'Résultats de recherche',
  'search.noResults': 'Aucun résultat pour « {query} »',
  'search.dialog': 'Rechercher dans la documentation',
  'theme.toggle': 'Changer de thème',
  'theme.switchLight': 'Passer au thème clair',
  'theme.switchDark': 'Passer au thème sombre',
  'shortcuts.title': 'Raccourcis clavier',
  'shortcuts.close': 'Fermer les raccourcis',
  'shortcuts.openSearch': 'Ouvrir la recherche',
  'shortcuts.navResults': 'Parcourir les résultats',
  'shortcuts.openResult': 'Ouvrir le résultat sélectionné',
  'shortcuts.closeModal': 'Fermer la fenêtre / recherche',
  'shortcuts.showHelp': "Afficher ce panneau d'aide",
  'footer.copyright': '© 2026 VectoJS. Conçu avec VectoJS.',
  'lang.label': 'Langue',
  'lang.switcher': 'Choisir la langue',
  'fallback.notice': "Cette page n'a pas encore été traduite et est affichée en anglais.",
  'toc.onThisPage': 'Sur cette page',
  'toc.tableOfContents': 'Table des matières',
  'toc.expandToc': 'Déplier la table des matières',
  'toc.collapseToc': 'Replier la table des matières',
  'doc.readingTime': 'min de lecture',
  'docs.menu': 'Menu',
  'docs.openNav': 'Ouvrir le menu de navigation',
  'docs.nav': 'Navigation de la documentation',
  'docs.resizeSidebar': 'Redimensionner la barre latérale',
  'docs.resizeToc': 'Redimensionner la table des matières',
  'docs.toggleSidebar': 'Basculer la barre latérale',
  'docs.collapseSidebar': 'Réduire la barre latérale',
  'docs.toggleToc': 'Basculer la table des matières',
  'docs.collapseToc': 'Réduire la table des matières',
  'docs.feedbackPrompt': 'Cette page vous a-t-elle été utile ?',
  'docs.feedbackYes': 'Oui',
  'docs.feedbackNo': 'À améliorer',
  'docs.prev': '← Précédent',
  'docs.next': 'Suivant →',
  'docs.pageNav': 'Navigation des pages',
};

const es: UIStrings = {
  'nav.gallery': 'Galería',
  'nav.learn': 'Aprender',
  'nav.reference': 'Referencia',
  'nav.blog': 'Blog',
  'nav.github': 'GitHub',
  'nav.home': 'Inicio de Vecto',
  'nav.openMenu': 'Abrir menú',
  'nav.collapseSidebar': 'Abrir menú',
  'nav.expandSidebar': 'Expandir barra lateral',
  'nav.mobileNav': 'Navegación móvil',
  'nav.siteNav': 'Navegación del sitio',
  'nav.viewSource': 'Ver el código en GitHub',
  'search.label': 'Buscar en la documentación (Ctrl+K)',
  'search.short': 'Buscar…',
  'search.placeholder': 'Buscar en la documentación…',
  'search.hint': 'Empieza a escribir para buscar…',
  'search.results': 'Resultados de búsqueda',
  'search.noResults': 'Sin resultados para «{query}»',
  'search.dialog': 'Buscar en la documentación',
  'theme.toggle': 'Cambiar tema',
  'theme.switchLight': 'Cambiar a tema claro',
  'theme.switchDark': 'Cambiar a tema oscuro',
  'shortcuts.title': 'Atajos de teclado',
  'shortcuts.close': 'Cerrar atajos',
  'shortcuts.openSearch': 'Abrir búsqueda',
  'shortcuts.navResults': 'Navegar por los resultados',
  'shortcuts.openResult': 'Abrir el resultado seleccionado',
  'shortcuts.closeModal': 'Cerrar ventana / búsqueda',
  'shortcuts.showHelp': 'Mostrar este panel de ayuda',
  'footer.copyright': '© 2026 VectoJS. Creado con VectoJS.',
  'lang.label': 'Idioma',
  'lang.switcher': 'Elegir idioma',
  'fallback.notice': 'Esta página aún no se ha traducido y se muestra en inglés.',
  'toc.onThisPage': 'En esta página',
  'toc.tableOfContents': 'Tabla de contenidos',
  'toc.expandToc': 'Expandir tabla de contenidos',
  'toc.collapseToc': 'Contraer tabla de contenidos',
  'doc.readingTime': 'min de lectura',
  'docs.menu': 'Menú',
  'docs.openNav': 'Abrir el menú de navegación',
  'docs.nav': 'Navegación de la documentación',
  'docs.resizeSidebar': 'Redimensionar la barra lateral',
  'docs.resizeToc': 'Redimensionar la tabla de contenidos',
  'docs.toggleSidebar': 'Alternar barra lateral',
  'docs.collapseSidebar': 'Contraer la barra lateral',
  'docs.toggleToc': 'Alternar tabla de contenidos',
  'docs.collapseToc': 'Contraer la tabla de contenidos',
  'docs.feedbackPrompt': '¿Te resultó útil esta página?',
  'docs.feedbackYes': 'Sí',
  'docs.feedbackNo': 'Necesita mejoras',
  'docs.prev': '← Anterior',
  'docs.next': 'Siguiente →',
  'docs.pageNav': 'Navegación de páginas',
};

const ko: UIStrings = {
  'nav.gallery': '갤러리',
  'nav.learn': '학습',
  'nav.reference': '레퍼런스',
  'nav.blog': '블로그',
  'nav.github': 'GitHub',
  'nav.home': 'Vecto 홈',
  'nav.openMenu': '메뉴 열기',
  'nav.collapseSidebar': '메뉴 열기',
  'nav.expandSidebar': '사이드바 펼치기',
  'nav.mobileNav': '모바일 내비게이션',
  'nav.siteNav': '사이트 내비게이션',
  'nav.viewSource': 'GitHub에서 소스 보기',
  'search.label': '문서 검색 (Ctrl+K)',
  'search.short': '문서 검색…',
  'search.placeholder': '문서 검색…',
  'search.hint': '검색하려면 입력하세요…',
  'search.results': '검색 결과',
  'search.noResults': '“{query}”에 대한 결과가 없습니다',
  'search.dialog': '문서 검색',
  'theme.toggle': '테마 전환',
  'theme.switchLight': '라이트 테마로 전환',
  'theme.switchDark': '다크 테마로 전환',
  'shortcuts.title': '키보드 단축키',
  'shortcuts.close': '단축키 닫기',
  'shortcuts.openSearch': '검색 열기',
  'shortcuts.navResults': '검색 결과 탐색',
  'shortcuts.openResult': '선택한 결과 열기',
  'shortcuts.closeModal': '모달 / 검색 닫기',
  'shortcuts.showHelp': '이 도움말 패널 표시',
  'footer.copyright': '© 2026 VectoJS. VectoJS로 제작.',
  'lang.label': '언어',
  'lang.switcher': '언어 선택',
  'fallback.notice': '이 페이지는 아직 번역되지 않아 영어로 표시됩니다.',
  'toc.onThisPage': '이 페이지 내용',
  'toc.tableOfContents': '목차',
  'toc.expandToc': '목차 펼치기',
  'toc.collapseToc': '목차 접기',
  'doc.readingTime': '분 소요',
  'docs.menu': '메뉴',
  'docs.openNav': '탐색 메뉴 열기',
  'docs.nav': '문서 탐색',
  'docs.resizeSidebar': '탐색 사이드바 크기 조정',
  'docs.resizeToc': '목차 크기 조정',
  'docs.toggleSidebar': '사이드바 전환',
  'docs.collapseSidebar': '탐색 사이드바 접기',
  'docs.toggleToc': '목차 전환',
  'docs.collapseToc': '목차 접기',
  'docs.feedbackPrompt': '이 페이지가 도움이 되었나요?',
  'docs.feedbackYes': '예',
  'docs.feedbackNo': '개선 필요',
  'docs.prev': '← 이전',
  'docs.next': '다음 →',
  'docs.pageNav': '페이지 탐색',
};

const DICTIONARIES: Record<Locale, UIStrings> = {
  en,
  'zh-cn': zhCN,
  'zh-tw': zhTW,
  ja,
  fr,
  es,
  ko,
};

/**
 * Return a translator bound to `locale`. Falls back to the English string for
 * any key (the type system already guarantees completeness, but this keeps a
 * runtime guard if a dictionary is ever loosened).
 */
export function useTranslations(locale: Locale) {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  return function t(key: keyof UIStrings): string {
    return dict[key] ?? DICTIONARIES[DEFAULT_LOCALE][key];
  };
}
