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
        { title: '场景图架构' },
        { title: '零 DOM，零重排' },
        { title: '面向智能体且可访问' },
        { title: '冷热排版与双向文字' },
        { title: 'WebGL 与 WebGPU 加速' },
        { title: '流式优先的 Markdown' },
        { title: 'Three.js 与 2.5D 深度' },
        { title: '可复用缓冲区与边界剔除' },
      ],
    },
    usecases: {
      title: '适用于',
      subtitle: '任何 DOM 过慢、过于僵硬或过于暴露的场景。',
      tiles: [
        { title: '可视化与交易终端' },
        { title: '无限画布与知识图谱' },
        { title: 'LLM 客户端与实时流' },
        { title: '网页游戏与教学视频' },
        { title: '文本编辑器与开发者工具' },
        { title: '抗抓取界面' },
        { title: 'WebXR 与 Three.js 集成' },
        { title: '高级交互式网站' },
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
        { title: '場景圖架構' },
        { title: '零 DOM，零重排' },
        { title: '面向代理且可存取' },
        { title: '冷熱排版與雙向文字' },
        { title: 'WebGL 與 WebGPU 加速' },
        { title: '串流優先的 Markdown' },
        { title: 'Three.js 與 2.5D 深度' },
        { title: '可重用緩衝區與邊界剔除' },
      ],
    },
    usecases: {
      title: '適用於',
      subtitle: '任何 DOM 過慢、過於僵硬或過於暴露的場景。',
      tiles: [
        { title: '視覺化與交易終端' },
        { title: '無限畫布與知識圖譜' },
        { title: 'LLM 用戶端與即時串流' },
        { title: '網頁遊戲與教學影片' },
        { title: '文字編輯器與開發者工具' },
        { title: '抗擷取介面' },
        { title: 'WebXR 與 Three.js 整合' },
        { title: '進階互動式網站' },
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

export const HOME_STRINGS: Record<Locale, HomeStrings> = {
  en,
  'zh-cn': mergeHome(en, OVERRIDES['zh-cn']!),
  'zh-tw': mergeHome(en, OVERRIDES['zh-tw']!),
  ja: mergeHome(en, OVERRIDES.ja!),
  fr: mergeHome(en, OVERRIDES.fr!),
  es: mergeHome(en, OVERRIDES.es!),
  ko: mergeHome(en, OVERRIDES.ko!),
};

/** Homepage copy for a locale, falling back to English for untranslated locales. */
export function getHomeStrings(locale: Locale): HomeStrings {
  return HOME_STRINGS[locale] ?? HOME_STRINGS[DEFAULT_LOCALE];
}
