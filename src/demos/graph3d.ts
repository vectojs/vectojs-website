/**
 * 3D Force Graph — the canonical Les Misérables character co-occurrence network
 * (the same 77-node/254-link dataset used by d3-force and 3d-force-graph's own
 * examples, so visitors can compare directly), rendered by `@vectojs/graph3d`:
 * `D3ForceLayout` drives the physics, `Graph3D` draws every node as one
 * `InstancedMesh` and every link as one `LineSegments` (two draw calls total,
 * regardless of node count). Node size is character connection count; color is
 * the novel's 11 canonical character groups.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { D3ForceLayout, Graph3D, type GraphData, type GraphLink } from '@vectojs/graph3d';
import { setupReporter } from './report';
import miserables from './graph3d/miserables.json';

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

// Tableau-ish 11-color categorical palette, one per Les Misérables character group.
const GROUP_COLORS = [
  '#5b9cff',
  '#f97316',
  '#22c55e',
  '#eab308',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#ef4444',
  '#84cc16',
  '#06b6d4',
  '#f43f5e',
];

interface RawNode {
  id: string;
  group: number;
}
interface RawLink {
  source: string;
  target: string;
  value: number;
}
interface RawGraph {
  nodes: RawNode[];
  links: RawLink[];
}

const RAW = miserables as RawGraph;

function buildGraphData(): GraphData {
  const degree = new Map<string, number>();
  for (const link of RAW.links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }
  return {
    nodes: RAW.nodes.map((n) => ({
      id: n.id,
      val: 1 + (degree.get(n.id) ?? 0) * 0.5,
      color: GROUP_COLORS[n.group % GROUP_COLORS.length],
    })),
    links: RAW.links.map((l): GraphLink => ({ source: l.source, target: l.target })),
  };
}

interface DemoState {
  chargeStrength: number;
  linkDistance: number;
}

function initGraph3D(): void {
  const canvas = $<HTMLCanvasElement>('graph3d-canvas');
  const stage = $('stage');
  if (!canvas || !stage) return;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch {
    const fb = $('graph3d-fallback');
    if (fb) fb.hidden = false;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05070d');
  scene.add(new THREE.AmbientLight('#ffffff', 0.8));
  const keyLight = new THREE.DirectionalLight('#ffffff', 0.6);
  keyLight.position.set(60, 80, 100);
  scene.add(keyLight);

  const camera = new THREE.PerspectiveCamera(55, stage.clientWidth / stage.clientHeight, 0.1, 2000);
  camera.position.set(0, 0, 220);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  controls.minDistance = 40;
  controls.maxDistance = 600;

  const data = buildGraphData();
  const state: DemoState = { chargeStrength: -60, linkDistance: 30 };

  const graph = new Graph3D({ nodeRadius: 2.4, nodeSegments: 10, linkOpacity: 0.3 });
  graph.setGraphData(data);
  scene.add(graph.group);

  let layout = new D3ForceLayout({
    chargeStrength: state.chargeStrength,
    linkDistance: state.linkDistance,
  });
  layout.setGraph(data);
  let simulating = true;

  const restartLayout = (): void => {
    layout.dispose();
    layout = new D3ForceLayout({
      chargeStrength: state.chargeStrength,
      linkDistance: state.linkDistance,
    });
    layout.setGraph(data);
    simulating = true;
  };

  // ---- resize (stage-relative, per graph.ts / dimension.ts) ----
  const fit = (): void => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', () => requestAnimationFrame(fit));

  // ---- hover: raycast against the InstancedMesh Graph3D owns, via its public group ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hoverLabel = $('graph3d-hover-label');
  let hoveredIndex: number | null = null;

  const setNdc = (e: MouseEvent): void => {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  };

  canvas.addEventListener('pointermove', (e) => {
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(graph.group.children, false);
    const hit = hits.find((h) => h.instanceId !== undefined);
    const nextIndex = hit?.instanceId ?? null;

    if (nextIndex !== hoveredIndex) {
      hoveredIndex = nextIndex;
      canvas.style.cursor = nextIndex !== null ? 'pointer' : 'grab';
    }
    if (hoverLabel) {
      if (nextIndex !== null) {
        const node = data.nodes[nextIndex];
        const linkCount = RAW.links.filter(
          (l) => l.source === node.id || l.target === node.id,
        ).length;
        hoverLabel.textContent = `${node.id} — ${linkCount} connection${linkCount === 1 ? '' : 's'}`;
        hoverLabel.style.left = `${e.clientX - canvas.getBoundingClientRect().left + 14}px`;
        hoverLabel.style.top = `${e.clientY - canvas.getBoundingClientRect().top + 14}px`;
        hoverLabel.hidden = false;
      } else {
        hoverLabel.hidden = true;
      }
    }
  });
  canvas.addEventListener('pointerleave', () => {
    hoveredIndex = null;
    if (hoverLabel) hoverLabel.hidden = true;
    canvas.style.cursor = 'grab';
  });

  // ---- render loop ----
  let raf = 0;
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let fps = 60;

  const renderFrame = (): void => {
    if (simulating) {
      simulating = layout.step(2);
      graph.applyPositions(layout.positions);
    }
    controls.update();
    renderer.render(scene, camera);

    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 500) {
      fps = (frameCount * 1000) / (now - lastFpsTime);
      frameCount = 0;
      lastFpsTime = now;
    }

    raf = requestAnimationFrame(renderFrame);
  };
  const start = (): void => {
    if (!raf) raf = requestAnimationFrame(renderFrame);
  };
  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  fit();
  start();

  // ---- pause when off-screen / tab hidden (per graph.ts) ----
  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) start();
        else stop();
      },
      { threshold: 0.01 },
    ).observe(stage);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (visible) start();
  });

  // ---- controls: charge strength / link distance sliders restart the layout
  // with the new parameters (cheap at 77 nodes; topology never changes) ----
  const chargeInput = $<HTMLInputElement>('ctl-graph3d-charge');
  const chargeOut = $('out-graph3d-charge');
  chargeInput?.addEventListener('input', () => {
    state.chargeStrength = Number(chargeInput.value);
    if (chargeOut) chargeOut.textContent = String(state.chargeStrength);
    restartLayout();
  });

  const distanceInput = $<HTMLInputElement>('ctl-graph3d-distance');
  const distanceOut = $('out-graph3d-distance');
  distanceInput?.addEventListener('input', () => {
    state.linkDistance = Number(distanceInput.value);
    if (distanceOut) distanceOut.textContent = String(state.linkDistance);
    restartLayout();
  });

  $('ctl-graph3d-reset')?.addEventListener('click', () => restartLayout());

  // ---- HUD ----
  const set = (id: string, v: string): void => {
    const el = $(id);
    if (el) el.textContent = v;
  };
  window.setInterval(() => {
    set('hud-graph3d-nodes', String(data.nodes.length));
    set('hud-graph3d-links', String(data.links.length));
    set('hud-graph3d-fps', String(Math.round(fps)));
  }, 500);

  // ---- export a real-browser performance report ----
  const reportBtn = $('ctl-report');
  const reportPanel = $('report-panel');
  const reportPre = $('report-pre');
  if (reportBtn && reportPanel && reportPre) {
    setupReporter({
      button: reportBtn,
      panel: reportPanel,
      pre: reportPre,
      seconds: 4,
      extra: () => ({
        nodes: data.nodes.length,
        links: data.links.length,
        chargeStrength: state.chargeStrength,
        linkDistance: state.linkDistance,
      }),
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGraph3D);
else initGraph3D();
