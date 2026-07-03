/**
 * Dimension — a VectoJS control panel floating in a Three.js 3D scene, showcasing
 * @vectojs/three's ThreeAdapter. The panel (built in Task 5) is a real VectoJS UI
 * rendered to an offscreen canvas and mapped onto a plane; its controls drive the
 * surrounding 3D world. This file wires the outer Three.js scene, the adapter, the
 * raycaster event bridge, and the render loop.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildParticlePositions } from './dimension/particle-field';
import { ThreeAdapter } from '@vectojs/three';
import { Stack, Text, Toggle, Button } from '@vectojs/ui';
import { FrameMeter } from './frame-meter';
import { setupReporter } from './report';

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

// Scene-state the panel controls mutate and the render loop reads each frame.
interface SceneState {
  particleCount: number;
  autoOrbit: boolean;
  grid: boolean;
  spin: boolean;
}

const PARTICLE_RADIUS = 9;

function initDimension(): void {
  const canvas = $<HTMLCanvasElement>('dimension-canvas');
  const stage = $('stage');
  if (!canvas || !stage) return;

  // ---- renderer (guarded: WebGL can be unavailable) ----
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch {
    const fb = $('dimension-fallback');
    if (fb) fb.hidden = false;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#04060d');

  const camera = new THREE.PerspectiveCamera(55, stage.clientWidth / stage.clientHeight, 0.1, 100);
  camera.position.set(0, 1.6, 6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 14;
  controls.minPolarAngle = Math.PI * 0.18; // don't dip under the floor
  controls.maxPolarAngle = Math.PI * 0.82;
  controls.autoRotateSpeed = 1.2;
  controls.target.set(0, 0.6, 0);

  const state: SceneState = { particleCount: 600, autoOrbit: false, grid: true, spin: false };

  // FrameMeter is an Entity, but startSampling/stopSampling/update don't require a
  // Scene — drive it by hand from the OUTER loop (the visually-relevant one).
  const meter = new FrameMeter();

  // ---- ambient particle field ----
  const particleMaterial = new THREE.PointsMaterial({
    color: '#5b9cff',
    size: 0.05,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const particles = new THREE.Points(new THREE.BufferGeometry(), particleMaterial);
  const rebuildParticles = (count: number): void => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(buildParticlePositions(count, PARTICLE_RADIUS), 3),
    );
    particles.geometry.dispose(); // free the old GPU buffer before swapping
    particles.geometry = geo;
  };
  rebuildParticles(state.particleCount);
  scene.add(particles);

  // ---- floor grid ----
  const grid = new THREE.GridHelper(24, 24, 0x2b3a63, 0x16233f);
  grid.position.y = -1.4;
  scene.add(grid);

  // ---- resize (stage-relative, per graph.ts; drives immersive/fullscreen too) ----
  const fit = (): void => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', () => requestAnimationFrame(fit));

  // ---- the floating VectoJS panel (ThreeAdapter) ----
  // Built before the render loop below, which references it — the panel's own
  // rAF is brought up/down in lockstep with the outer loop via start()/stop().
  const PANEL_W = 512;
  const PANEL_H = 320;
  const adapter = new ThreeAdapter({ width: PANEL_W, height: PANEL_H });
  // The prebuilt mesh is a 1x1 plane with a FrontSide MeshBasicMaterial. DoubleSide
  // is REQUIRED: the camera orbits a full 360° and the panel can auto-spin, so a
  // single-sided plane would vanish AND stop raycasting for half of every turn.
  (adapter.mesh.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
  // Scaled up from an original 3.2 — at the default camera distance (6), 3.2 made
  // the stepper buttons a ~20px on-screen hit target, reported as hard to press.
  const PANEL_SCALE = 4.2;
  adapter.mesh.scale.set(PANEL_SCALE, PANEL_SCALE * (PANEL_H / PANEL_W), 1); // keep the 512x320 aspect
  adapter.mesh.position.set(0, 0.6, 0);
  scene.add(adapter.mesh);

  const COUNT_STEP = 200;
  const COUNT_MIN = 100;
  const COUNT_MAX = 2000;
  const countLabel = new Text(`Particles — ${state.particleCount}`, {
    font: '400 22px Inter, system-ui',
    color: '#9fb0cc',
  });
  const setCount = (next: number): void => {
    state.particleCount = Math.max(COUNT_MIN, Math.min(COUNT_MAX, next));
    countLabel.setText(`Particles — ${state.particleCount}`);
    rebuildParticles(state.particleCount);
  };
  // Button has no width option — it auto-sizes from its label + padding, which is
  // exactly what a single-glyph "−"/"+" stepper wants. Sized up from the defaults
  // (16px font / 12px padding): projected through the panel's mesh onto the 3D
  // scene, the default size was too small a hit target to click comfortably.
  const STEPPER_BTN_OPTS = { font: '600 22px sans-serif', padding: 20 };
  const minusBtn = new Button('−', {
    ...STEPPER_BTN_OPTS,
    onClick: () => setCount(state.particleCount - COUNT_STEP),
  });
  const plusBtn = new Button('+', {
    ...STEPPER_BTN_OPTS,
    onClick: () => setCount(state.particleCount + COUNT_STEP),
  });
  const stepperRow = new Stack({ direction: 'horizontal', gap: 14, align: 'center' });
  stepperRow.add(minusBtn);
  stepperRow.add(countLabel);
  stepperRow.add(plusBtn);

  const heading = new Text('Scene Controls', {
    font: '600 30px Inter, system-ui',
    color: '#f8fafc',
  });
  const orbitToggle = new Toggle({
    label: 'Auto-orbit',
    checked: state.autoOrbit,
    onChange: (v) => {
      state.autoOrbit = v;
    },
  });
  const gridToggle = new Toggle({
    label: 'Floor grid',
    checked: state.grid,
    onChange: (v) => {
      state.grid = v;
    },
  });
  const spinToggle = new Toggle({
    label: 'Panel spin',
    checked: state.spin,
    onChange: (v) => {
      state.spin = v;
    },
  });

  const panel = new Stack({ direction: 'vertical', gap: 22, align: 'start' });
  panel.add(heading);
  panel.add(stepperRow);
  panel.add(orbitToggle);
  panel.add(gridToggle);
  panel.add(spinToggle);
  panel.setPosition(40, 36);
  adapter.vectoScene.add(panel);

  // ---- pointer → raycaster → adapter, using the canvas's own rect (NOT window) ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const setNdc = (e: MouseEvent | WheelEvent): void => {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  };
  const forward = (
    type: 'pointerdown' | 'pointerup' | 'pointermove' | 'wheel' | 'click',
    e: MouseEvent | WheelEvent,
  ): boolean => {
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);
    return adapter.updateIntersection(raycaster, type, e);
  };

  // If a pointerdown lands on the panel, suppress OrbitControls so a click on a
  // button doesn't also nudge the camera. Re-enable on release regardless of hit.
  //
  // Must run in the capture phase on window, not a bubble-phase listener on the
  // canvas: OrbitControls registers its OWN pointerdown listener directly on the
  // canvas in its constructor, which runs earlier in the code than this. Two
  // bubble-phase listeners on the same element fire in registration order, so a
  // canvas-level listener here would run AFTER OrbitControls' — by which point
  // it has already called setPointerCapture() on the canvas (its onPointerDown
  // checks `scope.enabled` at its very top, but only *before* that capture call
  // ever happens). A capture-phase listener on an ancestor (window) always runs
  // before any target-phase listener on the canvas, regardless of registration
  // order, so controls.enabled is already false by the time OrbitControls' own
  // handler checks it — with a real mouse (unlike a scripted, pixel-perfect
  // click) this is what stops the sub-pixel jitter between press and release
  // from being interpreted as a drag.
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (forward('pointerdown', e)) controls.enabled = false;
    },
    { capture: true },
  );
  canvas.addEventListener('pointermove', (e) => forward('pointermove', e));
  window.addEventListener('pointerup', (e) => {
    forward('pointerup', e);
    controls.enabled = true;
  });
  canvas.addEventListener('click', (e) => forward('click', e));
  canvas.addEventListener('wheel', (e) => forward('wheel', e), { passive: true });

  // ---- render loop ----
  // The panel is genuinely idle between interactions: nothing here marks the
  // inner vectoScene dirty on its own, so it only re-renders (and re-uploads the
  // texture) in response to an actual click/toggle/pointer event reaching it —
  // matching the "comparatively idle" premise the panel is designed around.
  let raf = 0;
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = now - last; // frame delta, drives the panel spin below
    last = now;
    meter.update(dt);
    controls.autoRotate = state.autoOrbit;
    controls.update();
    grid.visible = state.grid;
    if (state.spin) adapter.mesh.rotation.y += dt * 0.0006;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  const start = (): void => {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
      adapter.vectoScene.start();
    }
  };
  const stop = (): void => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      adapter.vectoScene.stop();
    }
  };

  fit();
  start();

  // ---- pause when off-screen / tab hidden (per graph.ts); pauses both the outer
  // Three.js loop and the panel's own inner vectoScene loop together ----
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

  // ---- HUD ----
  const set = (id: string, v: string): void => {
    const el = $(id);
    if (el) el.textContent = v;
  };
  window.setInterval(() => {
    set('hud-dimension-fps', String(Math.round(meter.fps)));
    set('hud-dimension-particles', state.particleCount.toLocaleString());
    set('hud-dimension-camera', state.autoOrbit ? 'auto' : 'manual');
  }, 500);

  // ---- export a real-browser performance report (measures the OUTER loop) ----
  const reportBtn = $('ctl-report');
  const reportPanel = $('report-panel');
  const reportPre = $('report-pre');
  if (reportBtn && reportPanel && reportPre) {
    setupReporter({
      button: reportBtn,
      panel: reportPanel,
      pre: reportPre,
      seconds: 4,
      frameSampler: { start: () => meter.startSampling(), stop: () => meter.stopSampling() },
      extra: () => ({
        particles: state.particleCount,
        autoOrbit: String(state.autoOrbit),
        panelSpin: String(state.spin),
      }),
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDimension);
else initDimension();
