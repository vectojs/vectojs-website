/**
 * Homepage marketing copy for every locale. Icons and API identifiers
 * (VectoJS, `Entity`, `ThreeAdapter`, Three.js, WebGPU, …) stay in English on
 * purpose; only human prose is translated. The English entry is the source of
 * truth and the runtime fallback — see `getHomeStrings`.
 *
 * Body strings may contain inline HTML (`<code>…</code>`) and are rendered with
 * `set:html`, so they must stay trusted, author-controlled content.
 */
import { DEFAULT_LOCALE, type Locale } from './config';

export interface HomeCard {
  /** Locale-independent glyph rendered above the card title. */
  readonly icon: string;
  readonly title: string;
  /** May contain inline HTML (`<code>`), rendered via set:html. */
  readonly body: string;
}

export interface HomeUsecase {
  readonly label: string;
  readonly title: string;
  readonly body: string;
}

export interface HomeMetric {
  /** The headline number, e.g. '149x'. Locale-independent. */
  readonly value: string;
  readonly label: string;
  /** How it was measured — shown small, keeps the claim honest. */
  readonly detail: string;
}

export interface HomeStrings {
  readonly hero: {
    readonly title: string;
    readonly tagline: string;
    readonly gallery: string;
    readonly github: string;
  };
  readonly features: {
    readonly title: string;
    readonly cards: readonly HomeCard[];
  };
  readonly usecases: {
    readonly title: string;
    readonly subtitle: string;
    readonly tiles: readonly HomeUsecase[];
  };
  readonly metrics: {
    readonly title: string;
    readonly subtitle: string;
    readonly items: readonly HomeMetric[];
    readonly footnote: string;
  };
}

const FEATURE_ICONS = ['◈', '🍃', '👁️', '🔤', '⚡', '◎', '◉', '◇'] as const;
const USECASE_ICONS = [
  'Data',
  'Canvas',
  'Streaming',
  'Games & Media',
  'Editors',
  'Privacy',
  'XR & 3D',
  'Creative',
] as const;

const en: HomeStrings = {
  hero: {
    title: 'VectoJS — the Zero-DOM canvas UI engine an AI agent can actually drive',
    tagline:
      'Zero-DOM, accessible, agent-native. The canvas UI runtime that screen readers — and AI agents — can operate by role.',
    gallery: 'Gallery',
    github: 'GitHub',
  },
  features: {
    title: 'More than a canvas',
    cards: [
      {
        icon: FEATURE_ICONS[0],
        title: 'Scene-graph architecture',
        body: 'Every object is an <code>Entity</code> in the Virtual Math Tree — a retained scene graph in the same family as game engines. Extend built-in components via inheritance or build entirely custom ones — if JavaScript can express it, VectoJS can render it. No opaque component registries.',
      },
      {
        icon: FEATURE_ICONS[1],
        title: 'Zero-DOM, zero reflow',
        body: 'The entire UI tree lives in one <code>&lt;canvas&gt;</code>. Layout, hit-testing, and animation are pure math in JS and Workers — no browser reflow, no style recalc. DOM-node count stays flat while animating tens of thousands of elements.',
      },
      {
        icon: FEATURE_ICONS[2],
        title: 'Agent-native &amp; accessible',
        body: 'Every interactive entity projects a real, transparent DOM node. A pure-canvas page is still driven by screen readers, Playwright, and AI agents with <code>getByRole().click()</code>. No adapters required.',
      },
      {
        icon: FEATURE_ICONS[3],
        title: 'Hot/cold typography &amp; BiDi',
        body: '<code>prepare()</code> measures glyphs once; <code>layoutPrepared()</code> re-wraps on every resize for free. Inline rich text, exclusion flow, Arabic/BiDi shaping, MSDF fonts, and streaming token-append built in.',
      },
      {
        icon: FEATURE_ICONS[4],
        title: 'WebGL &amp; WebGPU acceleration',
        body: 'Batch layer coalesces compatible shapes into GPU draws. WebGPU compute simulates spring particles; capacity depends on the target GPU and workload. Idle auto-throttle drops to ~2 fps when nothing is animating, conserving CPU and battery.',
      },
      {
        icon: FEATURE_ICONS[5],
        title: 'Streaming-first Markdown',
        body: '<code>appendMarkdown(delta)</code> re-lexes the source but reuses unchanged rendered entities. Tables, code fences, images, math (<code>@vectojs/tex</code>), Mermaid, and ABC notation are supported for LLM chat and live feeds.',
      },
      {
        icon: FEATURE_ICONS[6],
        title: 'Three.js &amp; 2.5D depth',
        body: '<code>ThreeAdapter</code> renders a VectoJS scene as a <code>THREE.CanvasTexture</code> with UV raycasting for pointer events. The mesh participates in the host Three.js scene\u2019s normal transform and depth behavior.',
      },
      {
        icon: FEATURE_ICONS[7],
        title: 'Reusable buffers &amp; bounds culling',
        body: 'Particle and text hot paths can reuse contiguous typed buffers. Entity-provided bounds skip offscreen drawing during the normal O(N) tree traversal. Modular subpath imports keep bundles small.',
      },
    ],
  },
  metrics: {
    title: 'Measured, on real hardware',
    subtitle:
      'Every number below is a before/after on the same workload, measured in a real browser on a real GPU — never headless, and quoted for both engines because V8 and SpiderMonkey diverge.',
    items: [
      {
        // table-virtual @5000, median of 7 (FF n=5 after cadence gate)
        value: '100\u2013166\u00d7',
        label: 'Table virtualization',
        detail:
          '5,000 rows, virtualized vs classic (Chrome ~63\u21920.63 ms/frame, Firefox ~82\u21920.50; N=7, 2026-08-14)',
      },
      {
        // content-projection @1600×240 glyphs
        value: '29\u201332\u00d7',
        label: 'Content-projection gate',
        detail:
          '1,600 blocks / 384k glyphs: Chrome 23.3\u21920.73 ms, Firefox 19.3\u21920.65 (median of 7)',
      },
      {
        // hero-metrics Fenwick vs linear @100k rows, median of 7
        value: '170\u2013447\u00d7',
        label: 'Virtualized scroll math',
        detail: 'Fenwick vs linear scan, 100k rows (Chrome / Firefox, median of 7, hero-metrics)',
      },
      {
        // graph-layout @5000
        value: '7.6\u20138.0\u00d7',
        label: 'Force-directed layout vs d3',
        detail:
          '5,000 nodes: ~38\u21925.1 ms/tick Chrome, ~39\u21924.8 Firefox (VectoForceLayout vs d3-force-3d, N=7)',
      },
      {
        // core-wasm world-AABB @100k flat — FF ~parity on this path
        value: '1.0\u20132.2\u00d7',
        label: 'WASM world-AABB kernel',
        detail:
          '100k entities flat topology (Chrome 2.2\u00d7, Firefox ~1.0\u00d7); JS remains the fallback (N=7)',
      },
      {
        // hero-metrics MSDF layout @5699 chars
        value: '13\u201324M',
        label: 'MSDF glyphs per second',
        detail: 'chars/s at 5.7k chars (Chrome ~24M, Firefox ~13M, median of 7, hero-metrics)',
      },
    ],
    footnote:
      'Median of 7 headed runs per engine on real GPU (Hyprland harness), commit 9db4b6d / core 1.35.3 era. Sources in <code>benchmarks/</code>; write-up in <code>vectojs-docs/forge/baselines/homepage-metrics-2026-08-14.md</code>.',
  },
  usecases: {
    title: 'Built for',
    subtitle: 'Anywhere a DOM is too slow, too rigid, or too visible.',
    tiles: [
      {
        label: USECASE_ICONS[0],
        title: 'Visualization &amp; trading terminals',
        body: 'Real-time charts, deep order book terminals, and K8s topology viewers. Thousands of animated nodes with flat memory usage — no DOM reflow per data tick.',
      },
      {
        label: USECASE_ICONS[1],
        title: 'Infinite canvases &amp; knowledge graphs',
        body: 'Collaborative whiteboards, Figma/Miro-scale design tools, and node-edge graphs. O(1) spatial culling keeps pan and zoom smooth at any depth.',
      },
      {
        label: USECASE_ICONS[2],
        title: 'LLM clients &amp; live feeds',
        body: 'Token-by-token Markdown streaming, danmaku at 5,000+ concurrent comments, and real-time observability feeds — all with sub-millisecond append cost.',
      },
      {
        label: USECASE_ICONS[3],
        title: 'Web games &amp; educational video',
        body: 'OSU!-style rhythm games, physics sandboxes, and interactive animations. A web-native alternative to Remotion and Manim — no video pipeline needed.',
      },
      {
        label: USECASE_ICONS[4],
        title: 'Text editors &amp; dev tools',
        body: 'Canvas-based editors like <code>vscode.dev</code> use canvas because the DOM text engine can\u2019t be controlled at the character level. VectoJS provides the missing layout engine, IME input, and accessibility layer.',
      },
      {
        label: USECASE_ICONS[5],
        title: 'Scraping-resistant interfaces',
        body: 'No DOM means no structured HTML for bots to parse. Natural fit for premium content protection, anti-bot surfaces, and CAPTCHA-alternative applications.',
      },
      {
        label: USECASE_ICONS[6],
        title: 'WebXR &amp; Three.js integration',
        body: 'Render VectoJS panels as <code>THREE.CanvasTexture</code> on any 3D mesh. Spatial dashboards, in-world terminals, and head-up displays with full UV-raycasted pointer events.',
      },
      {
        label: USECASE_ICONS[7],
        title: 'Advanced interactive websites',
        body: 'Physics-driven layouts, cursor-reactive particle fields, magnetic typography, and generative art — effects impossible with CSS alone, embedded inside an otherwise normal webpage.',
      },
    ],
  },
};

/**
 * A partial, field-level translation. Any omitted field falls back to English.
 * Card/tile arrays are matched to English by index; `icon`/`label` glyphs always
 * come from English. This lets translations land incrementally (e.g. titles now,
 * dense technical bodies later) without fabricating prose.
 */
export interface HomeOverride {
  readonly hero?: Partial<Omit<HomeStrings['hero'], never>>;
  readonly features?: {
    readonly title?: string;
    readonly cards?: readonly (Partial<Pick<HomeCard, 'title' | 'body'>> | undefined)[];
  };
  readonly usecases?: {
    readonly title?: string;
    readonly subtitle?: string;
    readonly tiles?: readonly (Partial<Pick<HomeUsecase, 'title' | 'body'>> | undefined)[];
  };
  readonly metrics?: {
    readonly title?: string;
    readonly subtitle?: string;
    readonly footnote?: string;
    /** Only `label`/`detail` translate; `value` is a number and stays as-is. */
    readonly items?: readonly (Partial<Pick<HomeMetric, 'label' | 'detail'>> | undefined)[];
  };
}

function mergeHome(base: HomeStrings, over: HomeOverride): HomeStrings {
  return {
    hero: { ...base.hero, ...over.hero },
    features: {
      title: over.features?.title ?? base.features.title,
      cards: base.features.cards.map((card, i) => ({
        icon: card.icon,
        title: over.features?.cards?.[i]?.title ?? card.title,
        body: over.features?.cards?.[i]?.body ?? card.body,
      })),
    },
    usecases: {
      title: over.usecases?.title ?? base.usecases.title,
      subtitle: over.usecases?.subtitle ?? base.usecases.subtitle,
      tiles: base.usecases.tiles.map((tile, i) => ({
        label: tile.label,
        title: over.usecases?.tiles?.[i]?.title ?? tile.title,
        body: over.usecases?.tiles?.[i]?.body ?? tile.body,
      })),
    },
    metrics: {
      title: over.metrics?.title ?? base.metrics.title,
      subtitle: over.metrics?.subtitle ?? base.metrics.subtitle,
      footnote: over.metrics?.footnote ?? base.metrics.footnote,
      items: base.metrics.items.map((m, i) => ({
        value: m.value,
        label: over.metrics?.items?.[i]?.label ?? m.label,
        detail: over.metrics?.items?.[i]?.detail ?? m.detail,
      })),
    },
  };
}

/**
 * Field-level translation overrides per locale. High-visibility strings (hero,
 * section titles, card/tile titles) are translated here; omitted fields (mainly
 * the dense technical bodies) fall back to English until translated.
 */
const OVERRIDES: Partial<Record<Locale, HomeOverride>> = {
  'zh-cn': {
    hero: {
      title: 'VectoJS —— AI 智能体真正能驾驭的零 DOM canvas UI 引擎',
      tagline:
        '零 DOM、可访问、面向智能体。屏幕阅读器与 AI 智能体都能按角色操作的 canvas UI 运行时。',
      gallery: '作品廊',
    },
    features: {
      title: '不只是一块画布',
      cards: [
        {
          title: '场景图架构',
          body: '每个对象都是虚拟数学树中的一个 <code>Entity</code>，也是与游戏引擎同源的保留式场景图。通过继承扩展内置组件，或完全自定义组件——只要 JavaScript 能表达，VectoJS 就能渲染。不依赖不透明的组件注册表。',
        },
        {
          title: '零 DOM，零重排',
          body: '整个 UI 树都位于一个 <code>&lt;canvas&gt;</code> 中。布局、命中测试和动画都是 JS 与 Worker 中的纯数学运算——没有浏览器重排，也没有样式重算。即使动画包含数万个元素，DOM 节点数量仍保持不变。',
        },
        {
          title: '面向智能体且可访问',
          body: '每个交互实体都会投影为真实且透明的 DOM 节点。纯 canvas 页面仍可由屏幕阅读器、Playwright 和 AI 智能体通过 <code>getByRole().click()</code> 驱动。无需适配器。',
        },
        {
          title: '冷热排版与双向文字',
          body: '<code>prepare()</code> 只测量一次字形；<code>layoutPrepared()</code> 可在每次调整大小时免费重新换行。内联富文本、排除流、阿拉伯语/双向文字整形、MSDF 字体以及流式追加 token 均已内置。',
        },
        {
          title: 'WebGL 与 WebGPU 加速',
          body: '批处理层会将兼容图形合并为 GPU 绘制。WebGPU compute 用于模拟弹簧粒子；容量取决于目标 GPU 与工作负载。没有动画时，空闲自动节流会降至约 2 fps，节省 CPU 与电量。',
        },
        {
          title: '流式优先的 Markdown',
          body: '<code>appendMarkdown(delta)</code> 会重新词法分析源文本，但复用未变化的渲染实体。支持表格、代码围栏、图片、数学公式（<code>@vectojs/tex</code>）、Mermaid 和 ABC 记谱，适合 LLM 聊天与实时信息流。',
        },
        {
          title: 'Three.js 与 2.5D 深度',
          body: '<code>ThreeAdapter</code> 会将 VectoJS 场景渲染为 <code>THREE.CanvasTexture</code>，并通过 UV 射线检测处理指针事件。网格会参与宿主 Three.js 场景正常的变换与深度行为。',
        },
        {
          title: '可复用缓冲区与边界剔除',
          body: '粒子与文本的高频路径可以复用连续的类型化缓冲区。实体提供的边界会在常规 O(N) 树遍历中跳过屏幕外绘制。模块化子路径导入让 bundle 保持精简。',
        },
      ],
    },
    usecases: {
      title: '适用于',
      subtitle: '任何 DOM 过慢、过于僵硬或过于暴露的场景。',
      tiles: [
        {
          title: '可视化与交易终端',
          body: '实时图表、深度订单簿终端和 K8s 拓扑查看器。数千个节点持续动画，内存占用保持平稳——每次数据更新都无需 DOM 重排。',
        },
        {
          title: '无限画布与知识图谱',
          body: '协作白板、Figma/Miro 规模的设计工具以及节点-边图谱。O(1) 空间剔除让任意深度的平移和缩放都保持流畅。',
        },
        {
          title: 'LLM 客户端与实时流',
          body: '逐 token 的 Markdown 流式传输、同时承载 5,000 多条评论的弹幕，以及实时可观测性信息流——追加成本都低于一毫秒。',
        },
        {
          title: '网页游戏与教学视频',
          body: 'OSU! 风格的节奏游戏、物理沙盒和交互式动画。无需视频管线，是 Remotion 与 Manim 的 Web 原生替代方案。',
        },
        {
          title: '文本编辑器与开发者工具',
          body: '像 <code>vscode.dev</code> 这样的基于 canvas 的编辑器使用 canvas，是因为 DOM 文本引擎无法控制字符级行为。VectoJS 提供缺失的布局引擎、IME 输入和可访问性层。',
        },
        {
          title: '抗抓取界面',
          body: '没有 DOM，就没有可供机器人解析的结构化 HTML。适合高级内容保护、反机器人界面和 CAPTCHA 替代应用。',
        },
        {
          title: 'WebXR 与 Three.js 集成',
          body: '将 VectoJS 面板渲染为任意 3D 网格上的 <code>THREE.CanvasTexture</code>。空间仪表板、世界内终端和抬头显示器都支持完整的 UV 射线指针事件。',
        },
        {
          title: '高级交互式网站',
          body: '物理驱动的布局、响应光标的粒子场、磁性排版和生成艺术——这些效果仅靠 CSS 无法实现，却能嵌入普通网页。',
        },
      ],
    },
  },
  'zh-tw': {
    hero: {
      title: 'VectoJS —— AI 代理真正能駕馭的零 DOM canvas UI 引擎',
      tagline:
        '零 DOM、可存取、面向代理。螢幕閱讀器與 AI 代理都能按角色操作的 canvas UI 執行環境。',
      gallery: '作品廊',
    },
    features: {
      title: '不只是一塊畫布',
      cards: [
        {
          title: '場景圖架構',
          body: '每個物件都是虛擬數學樹中的一個 <code>Entity</code>，也是與遊戲引擎同源的保留式場景圖。透過繼承擴充內建元件，或完全自訂元件——只要 JavaScript 能表達，VectoJS 就能渲染。不依賴不透明的元件註冊表。',
        },
        {
          title: '零 DOM，零重排',
          body: '整個 UI 樹都位於一個 <code>&lt;canvas&gt;</code> 中。版面、命中測試和動畫都是 JS 與 Worker 中的純數學運算——沒有瀏覽器重排，也沒有樣式重算。即使動畫包含數萬個元素，DOM 節點數量仍保持不變。',
        },
        {
          title: '面向代理且可存取',
          body: '每個互動實體都會投影為真實且透明的 DOM 節點。純 canvas 頁面仍可由螢幕閱讀器、Playwright 和 AI 代理透過 <code>getByRole().click()</code> 操作。無需轉接器。',
        },
        {
          title: '冷熱排版與雙向文字',
          body: '<code>prepare()</code> 只測量一次字形；<code>layoutPrepared()</code> 可在每次調整大小時免費重新換行。內嵌富文字、排除流、阿拉伯語/雙向文字塑形、MSDF 字型以及串流追加 token 均已內建。',
        },
        {
          title: 'WebGL 與 WebGPU 加速',
          body: '批次層會將相容圖形合併為 GPU 繪製。WebGPU compute 用於模擬彈簧粒子；容量取決於目標 GPU 與工作負載。沒有動畫時，閒置自動節流會降至約 2 fps，節省 CPU 與電量。',
        },
        {
          title: '串流優先的 Markdown',
          body: '<code>appendMarkdown(delta)</code> 會重新詞法分析來源文字，但重用未變更的渲染實體。支援表格、程式碼圍欄、圖片、數學公式（<code>@vectojs/tex</code>）、Mermaid 和 ABC 記譜，適合 LLM 聊天與即時資訊流。',
        },
        {
          title: 'Three.js 與 2.5D 深度',
          body: '<code>ThreeAdapter</code> 會將 VectoJS 場景渲染為 <code>THREE.CanvasTexture</code>，並透過 UV 射線偵測處理指標事件。網格會參與宿主 Three.js 場景正常的變換與深度行為。',
        },
        {
          title: '可重用緩衝區與邊界剔除',
          body: '粒子與文字的高頻路徑可以重用連續的型別化緩衝區。實體提供的邊界會在常規 O(N) 樹遍歷中跳過螢幕外繪製。模組化子路徑匯入讓 bundle 保持精簡。',
        },
      ],
    },
    usecases: {
      title: '適用於',
      subtitle: '任何 DOM 過慢、過於僵硬或過於暴露的場景。',
      tiles: [
        {
          title: '視覺化與交易終端',
          body: '即時圖表、深度訂單簿終端和 K8s 拓撲檢視器。數千個節點持續動畫，記憶體用量保持平穩——每次資料更新都無需 DOM 重排。',
        },
        {
          title: '無限畫布與知識圖譜',
          body: '協作白板、Figma/Miro 規模的設計工具以及節點-邊圖譜。O(1) 空間剔除讓任意深度的平移和縮放都保持流暢。',
        },
        {
          title: 'LLM 用戶端與即時串流',
          body: '逐 token 的 Markdown 串流傳輸、同時承載 5,000 多則留言的彈幕，以及即時可觀測性資訊流——追加成本都低於一毫秒。',
        },
        {
          title: '網頁遊戲與教學影片',
          body: 'OSU! 風格的節奏遊戲、物理沙盒和互動式動畫。無需影片管線，是 Remotion 與 Manim 的 Web 原生替代方案。',
        },
        {
          title: '文字編輯器與開發者工具',
          body: '像 <code>vscode.dev</code> 這樣的 canvas 編輯器使用 canvas，是因為 DOM 文字引擎無法控制字元層級行為。VectoJS 提供缺少的版面引擎、IME 輸入和可存取性層。',
        },
        {
          title: '抗擷取介面',
          body: '沒有 DOM，就沒有可供機器人解析的結構化 HTML。適合高級內容保護、反機器人介面和 CAPTCHA 替代應用。',
        },
        {
          title: 'WebXR 與 Three.js 整合',
          body: '將 VectoJS 面板渲染為任意 3D 網格上的 <code>THREE.CanvasTexture</code>。空間儀表板、世界內終端和抬頭顯示器都支援完整的 UV 射線指標事件。',
        },
        {
          title: '進階互動式網站',
          body: '物理驅動的版面、回應游標的粒子場、磁性排版和生成藝術——這些效果僅靠 CSS 無法實現，卻能嵌入普通網頁。',
        },
      ],
    },
  },
  ja: {
    hero: {
      title: 'VectoJS — AI エージェントが実際に操作できるゼロ DOM canvas UI エンジン',
      tagline:
        'ゼロ DOM、アクセシブル、エージェントネイティブ。スクリーンリーダーと AI エージェントがロールで操作できる canvas UI ランタイム。',
      gallery: 'ギャラリー',
    },
    features: {
      title: '単なるキャンバスではない',
      cards: [
        { title: 'シーングラフアーキテクチャ' },
        { title: 'ゼロ DOM、リフローなし' },
        { title: 'エージェントネイティブでアクセシブル' },
        { title: 'ホット/コールドタイポグラフィと双方向文字' },
        { title: 'WebGL と WebGPU アクセラレーション' },
        { title: 'ストリーミングファースト Markdown' },
        { title: 'Three.js と 2.5D の奥行き' },
        { title: '再利用可能なバッファと境界カリング' },
      ],
    },
    usecases: {
      title: '想定される用途',
      subtitle: 'DOM が遅すぎ、硬すぎ、または見えすぎるあらゆる場面で。',
      tiles: [
        { title: '可視化とトレーディング端末' },
        { title: '無限キャンバスとナレッジグラフ' },
        { title: 'LLM クライアントとライブフィード' },
        { title: 'Web ゲームと教育用動画' },
        { title: 'テキストエディタと開発ツール' },
        { title: 'スクレイピング耐性のあるインターフェース' },
        { title: 'WebXR と Three.js の統合' },
        { title: '高度なインタラクティブ Web サイト' },
      ],
    },
  },
  fr: {
    hero: {
      title:
        'VectoJS — le moteur d\u2019interface canvas Zero-DOM qu\u2019un agent IA peut réellement piloter',
      tagline:
        'Zero-DOM, accessible, natif pour les agents. Le runtime d\u2019interface canvas que les lecteurs d\u2019écran — et les agents IA — pilotent par rôle.',
      gallery: 'Galerie',
    },
    features: {
      title: 'Bien plus qu\u2019un canvas',
      cards: [
        { title: 'Architecture en graphe de scène' },
        { title: 'Zero-DOM, zéro reflow' },
        { title: 'Natif pour agents &amp; accessible' },
        { title: 'Typographie chaud/froid &amp; bidirectionnelle' },
        { title: 'Accélération WebGL &amp; WebGPU' },
        { title: 'Markdown orienté streaming' },
        { title: 'Three.js &amp; profondeur 2.5D' },
        { title: 'Buffers réutilisables &amp; culling' },
      ],
    },
    usecases: {
      title: 'Conçu pour',
      subtitle: 'Partout où le DOM est trop lent, trop rigide ou trop visible.',
      tiles: [
        { title: 'Visualisation &amp; terminaux de trading' },
        { title: 'Canvas infinis &amp; graphes de connaissances' },
        { title: 'Clients LLM &amp; flux en direct' },
        { title: 'Jeux web &amp; vidéo éducative' },
        { title: 'Éditeurs de texte &amp; outils de dev' },
        { title: 'Interfaces résistantes au scraping' },
        { title: 'Intégration WebXR &amp; Three.js' },
        { title: 'Sites web interactifs avancés' },
      ],
    },
  },
  es: {
    hero: {
      title:
        'VectoJS: el motor de UI en canvas Zero-DOM que un agente de IA puede manejar de verdad',
      tagline:
        'Zero-DOM, accesible, nativo para agentes. El runtime de UI en canvas que los lectores de pantalla — y los agentes de IA — manejan por rol.',
      gallery: 'Galería',
    },
    features: {
      title: 'Más que un canvas',
      cards: [
        { title: 'Arquitectura de grafo de escena' },
        { title: 'Zero-DOM, sin reflujo' },
        { title: 'Nativo para agentes y accesible' },
        { title: 'Tipografía en caliente/frío y BiDi' },
        { title: 'Aceleración WebGL y WebGPU' },
        { title: 'Markdown orientado a streaming' },
        { title: 'Three.js y profundidad 2.5D' },
        { title: 'Búferes reutilizables y culling' },
      ],
    },
    usecases: {
      title: 'Diseñado para',
      subtitle: 'Donde el DOM es demasiado lento, rígido o visible.',
      tiles: [
        { title: 'Visualización y terminales de trading' },
        { title: 'Lienzos infinitos y grafos de conocimiento' },
        { title: 'Clientes LLM y feeds en vivo' },
        { title: 'Juegos web y vídeo educativo' },
        { title: 'Editores de texto y herramientas de desarrollo' },
        { title: 'Interfaces resistentes al scraping' },
        { title: 'Integración con WebXR y Three.js' },
        { title: 'Sitios web interactivos avanzados' },
      ],
    },
  },
  ko: {
    hero: {
      title: 'VectoJS — AI 에이전트가 실제로 조작할 수 있는 제로 DOM canvas UI 엔진',
      tagline:
        '제로 DOM, 접근성, 에이전트 네이티브. 스크린 리더와 AI 에이전트가 역할로 조작할 수 있는 canvas UI 런타임.',
      gallery: '갤러리',
    },
    features: {
      title: '단순한 캔버스 그 이상',
      cards: [
        { title: '씬 그래프 아키텍처' },
        { title: '제로 DOM, 리플로우 없음' },
        { title: '에이전트 네이티브 및 접근성' },
        { title: '핫/콜드 타이포그래피와 양방향 텍스트' },
        { title: 'WebGL 및 WebGPU 가속' },
        { title: '스트리밍 우선 Markdown' },
        { title: 'Three.js 및 2.5D 깊이' },
        { title: '재사용 가능한 버퍼와 경계 컬링' },
      ],
    },
    usecases: {
      title: '이런 곳에 적합',
      subtitle: 'DOM이 너무 느리거나, 너무 경직되거나, 너무 드러나는 모든 곳에.',
      tiles: [
        { title: '시각화 및 트레이딩 터미널' },
        { title: '무한 캔버스와 지식 그래프' },
        { title: 'LLM 클라이언트와 실시간 피드' },
        { title: '웹 게임과 교육용 영상' },
        { title: '텍스트 편집기와 개발 도구' },
        { title: '스크래핑 방지 인터페이스' },
        { title: 'WebXR 및 Three.js 통합' },
        { title: '고급 인터랙티브 웹사이트' },
      ],
    },
  },
};

const BODY_OVERRIDES: Partial<Record<Exclude<Locale, 'en'>, { cards: string[]; tiles: string[] }>> =
  {
    ja: {
      cards: [
        'すべてのオブジェクトは Virtual Math Tree の <code>Entity</code> であり、ゲームエンジンと同系統の保持型シーングラフです。JavaScript で表現できるものなら VectoJS は描画できます。',
        'UI ツリー全体が 1 つの <code>&lt;canvas&gt;</code> に収まります。レイアウト、ヒットテスト、アニメーションは JS と Worker の数学で処理され、リフローやスタイル再計算はありません。',
        'すべての操作エンティティは透明な DOM ノードとして投影されます。スクリーンリーダー、Playwright、AI エージェントが <code>getByRole().click()</code> で操作できます。',
        '<code>prepare()</code> は字形を一度だけ計測し、<code>layoutPrepared()</code> はリサイズごとに再折り返しします。リッチテキスト、BiDi、MSDF、token 追加を標準搭載します。',
        '互換図形を GPU 描画にまとめ、WebGPU compute で粒子をシミュレーションします。アイドル時は約 2 fps に節流して CPU とバッテリーを節約します。',
        '<code>appendMarkdown(delta)</code> は変更されていない描画エンティティを再利用します。表、コード、画像、数式（<code>@vectojs/tex</code>）、Mermaid、ABC に対応します。',
        '<code>ThreeAdapter</code> はシーンを <code>THREE.CanvasTexture</code> として描画し、UV レイキャストでポインターイベントを処理します。',
        'パーティクルとテキストのバッファを再利用し、エンティティの境界で画面外描画を省略します。サブパスインポートでバンドルも小さくできます。',
      ],
      tiles: [
        'リアルタイムチャート、注文端末、K8s トポロジービューア。数千ノードを動かしてもデータ更新ごとの DOM リフローはありません。',
        '共同ホワイトボード、Figma/Miro 規模のツール、ノードグラフ。O(1) 空間カリングでパンとズームを滑らかに保ちます。',
        'token 単位の Markdown、5,000 件以上の弾幕、リアルタイムフィードを 1 ミリ秒未満の追加コストで処理します。',
        'OSU! スタイルのゲーム、物理サンドボックス、アニメーション。動画パイプライン不要の Web ネイティブな選択肢です。',
        '<code>vscode.dev</code> のような canvas エディタに、文字単位のレイアウト、IME 入力、アクセシビリティを提供します。',
        '構造化 HTML がないため、プレミアム保護、アンチボット画面、CAPTCHA 代替に適しています。',
        'VectoJS パネルを <code>THREE.CanvasTexture</code> として 3D メッシュに描画し、完全な UV レイキャストを利用できます。',
        '物理レイアウト、粒子場、磁気タイポグラフィ、生成アートなど CSS だけでは不可能な効果を Web ページに組み込めます。',
      ],
    },
    fr: {
      cards: [
        'Chaque objet est une <code>Entity</code> du Virtual Math Tree, un graphe de scène retenu comme dans les moteurs de jeu. Si JavaScript peut l’exprimer, VectoJS peut le rendre.',
        'Toute l’interface vit dans un seul <code>&lt;canvas&gt;</code>. Mise en page, hit-testing et animation sont des calculs JS et Worker, sans reflow ni recalcul de styles.',
        'Chaque entité interactive devient un nœud DOM transparent. Lecteurs d’écran, Playwright et agents IA peuvent utiliser <code>getByRole().click()</code>.',
        '<code>prepare()</code> mesure les glyphes une fois ; <code>layoutPrepared()</code> réorganise les lignes au redimensionnement. Texte riche, BiDi, MSDF et tokens sont intégrés.',
        'La couche batch regroupe les formes pour le GPU et WebGPU compute simule les particules. Au repos, la limitation descend à environ 2 fps pour économiser CPU et batterie.',
        '<code>appendMarkdown(delta)</code> réutilise les entités inchangées. Tableaux, code, images, mathématiques (<code>@vectojs/tex</code>), Mermaid et ABC sont pris en charge.',
        '<code>ThreeAdapter</code> rend la scène comme <code>THREE.CanvasTexture</code> avec raycasting UV pour les événements de pointeur.',
        'Les buffers de particules et de texte sont réutilisés et les limites des entités évitent le dessin hors écran. Les imports par sous-chemin réduisent les bundles.',
      ],
      tiles: [
        'Graphiques temps réel, carnets d’ordres et topologies K8s, avec des milliers de nœuds sans reflow DOM à chaque donnée.',
        'Tableaux blancs, outils de conception à l’échelle Figma/Miro et graphes de nœuds. Le culling spatial O(1) garde le zoom fluide.',
        'Markdown token par token, danmaku de plus de 5 000 commentaires et flux d’observabilité en moins d’une milliseconde d’ajout.',
        'Jeux de rythme OSU!, bacs à sable physiques et animations, sans pipeline vidéo et comme alternative Web native à Remotion et Manim.',
        'Des éditeurs comme <code>vscode.dev</code> obtiennent mise en page au caractère, saisie IME et accessibilité.',
        'Sans HTML structuré pour les robots, idéal pour protection de contenu, surfaces anti-bot et alternatives aux CAPTCHA.',
        'Les panneaux VectoJS deviennent des <code>THREE.CanvasTexture</code> sur des maillages 3D, avec événements de pointeur UV.',
        'Mises en page physiques, particules réactives, typographie magnétique et art génératif impossibles avec CSS seul.',
      ],
    },
    es: {
      cards: [
        'Cada objeto es una <code>Entity</code> del Virtual Math Tree, un grafo retenido como el de los motores de juego. Si JavaScript puede expresarlo, VectoJS puede renderizarlo.',
        'Toda la interfaz vive en un único <code>&lt;canvas&gt;</code>. Layout, hit-testing y animación son matemáticas en JS y Workers, sin reflow ni recálculo de estilos.',
        'Cada entidad interactiva proyecta un nodo DOM transparente. Lectores de pantalla, Playwright y agentes IA usan <code>getByRole().click()</code>.',
        '<code>prepare()</code> mide glifos una vez y <code>layoutPrepared()</code> reajusta líneas al redimensionar. Texto rico, BiDi, MSDF y tokens vienen integrados.',
        'La capa batch agrupa formas para la GPU y WebGPU compute simula partículas. En reposo baja a unos 2 fps para ahorrar CPU y batería.',
        '<code>appendMarkdown(delta)</code> reutiliza entidades sin cambios. Admite tablas, código, imágenes, matemáticas (<code>@vectojs/tex</code>), Mermaid y ABC.',
        '<code>ThreeAdapter</code> renderiza la escena como <code>THREE.CanvasTexture</code> con raycasting UV para eventos de puntero.',
        'Se reutilizan buffers de partículas y texto y se omite el dibujo fuera de pantalla. Los imports por subruta mantienen pequeños los bundles.',
      ],
      tiles: [
        'Gráficos en tiempo real, libros de órdenes y topologías K8s con miles de nodos, sin reflow DOM en cada dato.',
        'Pizarras colaborativas, herramientas al nivel de Figma/Miro y grafos. El culling espacial O(1) mantiene fluido el zoom.',
        'Markdown token a token, danmaku con más de 5.000 comentarios y feeds de observabilidad con coste inferior a un milisegundo.',
        'Juegos de ritmo estilo OSU!, sandboxes físicos y animaciones, sin pipeline de vídeo y como alternativa Web a Remotion y Manim.',
        'Editores como <code>vscode.dev</code> obtienen layout por carácter, entrada IME y accesibilidad.',
        'Sin HTML estructurado para bots, encaja con protección de contenido, superficies antibot y alternativas a CAPTCHA.',
        'Paneles VectoJS como <code>THREE.CanvasTexture</code> sobre mallas 3D, con eventos de puntero por raycast UV.',
        'Layouts físicos, partículas reactivas, tipografía magnética y arte generativo imposibles solo con CSS.',
      ],
    },
    ko: {
      cards: [
        '모든 객체는 Virtual Math Tree의 <code>Entity</code>이며 게임 엔진과 같은 보존형 씬 그래프입니다. JavaScript로 표현할 수 있으면 VectoJS가 렌더링합니다.',
        '전체 UI 트리는 하나의 <code>&lt;canvas&gt;</code>에 있습니다. 레이아웃, 히트 테스트, 애니메이션은 JS와 Worker의 수학으로 처리되어 리플로우가 없습니다.',
        '모든 상호작용 엔티티는 투명한 DOM 노드로 투영됩니다. 스크린 리더, Playwright, AI 에이전트가 <code>getByRole().click()</code>을 사용할 수 있습니다.',
        '<code>prepare()</code>는 글리프를 한 번 측정하고 <code>layoutPrepared()</code>는 리사이즈 때 다시 줄바꿈합니다. 리치 텍스트, BiDi, MSDF, token 추가가 내장됩니다.',
        '배치 레이어가 도형을 GPU 드로우로 합치고 WebGPU compute가 입자를 시뮬레이션합니다. 유휴 상태에서는 약 2 fps로 낮춰 CPU와 배터리를 절약합니다.',
        '<code>appendMarkdown(delta)</code>는 바뀌지 않은 렌더링 엔티티를 재사용합니다. 표, 코드, 이미지, 수학(<code>@vectojs/tex</code>), Mermaid, ABC를 지원합니다.',
        '<code>ThreeAdapter</code>는 씬을 <code>THREE.CanvasTexture</code>로 렌더링하고 UV 레이캐스팅으로 포인터 이벤트를 처리합니다.',
        '입자와 텍스트 버퍼를 재사용하고 엔티티 경계로 화면 밖 그리기를 생략합니다. 서브경로 import로 번들도 작게 유지합니다.',
      ],
      tiles: [
        '실시간 차트, 주문서 터미널, K8s 토폴로지 뷰어에서 수천 노드를 DOM 리플로우 없이 애니메이션합니다.',
        '협업 화이트보드, Figma/Miro 규모 도구, 노드 그래프에 O(1) 공간 컬링으로 부드러운 이동과 확대를 제공합니다.',
        'token 단위 Markdown, 5,000개 이상 동시 댓글, 실시간 관측 피드를 1밀리초 미만 추가 비용으로 처리합니다.',
        'OSU! 스타일 리듬 게임, 물리 샌드박스, 인터랙티브 애니메이션을 영상 파이프라인 없이 제공합니다.',
        '<code>vscode.dev</code> 같은 편집기에 문자 단위 레이아웃, IME 입력, 접근성 계층을 제공합니다.',
        '구조화된 HTML이 없어 프리미엄 콘텐츠 보호, 안티봇 화면, CAPTCHA 대체에 적합합니다.',
        'VectoJS 패널을 3D 메시의 <code>THREE.CanvasTexture</code>로 렌더링하고 UV 레이캐스트 포인터 이벤트를 지원합니다.',
        '물리 레이아웃, 커서 반응 입자, 자기 타이포그래피, 생성 예술을 일반 웹 페이지에 넣을 수 있습니다.',
      ],
    },
  };

function applyBodyOverrides(home: HomeStrings, locale: Locale): HomeStrings {
  const bodies = locale === 'en' ? undefined : BODY_OVERRIDES[locale];
  if (!bodies) return home;
  return {
    ...home,
    features: {
      ...home.features,
      cards: home.features.cards.map((card, index) => ({
        ...card,
        body: bodies.cards[index] ?? card.body,
      })),
    },
    usecases: {
      ...home.usecases,
      tiles: home.usecases.tiles.map((tile, index) => ({
        ...tile,
        body: bodies.tiles[index] ?? tile.body,
      })),
    },
  };
}

export const HOME_STRINGS: Record<Locale, HomeStrings> = {
  en,
  'zh-cn': applyBodyOverrides(mergeHome(en, OVERRIDES['zh-cn']!), 'zh-cn'),
  'zh-tw': applyBodyOverrides(mergeHome(en, OVERRIDES['zh-tw']!), 'zh-tw'),
  ja: applyBodyOverrides(mergeHome(en, OVERRIDES.ja!), 'ja'),
  fr: applyBodyOverrides(mergeHome(en, OVERRIDES.fr!), 'fr'),
  es: applyBodyOverrides(mergeHome(en, OVERRIDES.es!), 'es'),
  ko: applyBodyOverrides(mergeHome(en, OVERRIDES.ko!), 'ko'),
};

/** Homepage copy for a locale, falling back to English for untranslated locales. */
export function getHomeStrings(locale: Locale): HomeStrings {
  return HOME_STRINGS[locale] ?? HOME_STRINGS[DEFAULT_LOCALE];
}
