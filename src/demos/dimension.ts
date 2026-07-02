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

  // ---- ambient particle field ----
  const particleMaterial = new THREE.PointsMaterial({
    color: '#5b9cff',
    size: 0.05,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  let particles = new THREE.Points(new THREE.BufferGeometry(), particleMaterial);
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

  // ---- render loop ----
  let raf = 0;
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = now - last; // frame delta, drives the panel spin below
    last = now;
    controls.autoRotate = state.autoOrbit;
    controls.update();
    grid.visible = state.grid;
    if (state.spin) adapter.mesh.rotation.y += dt * 0.0006;
    refreshHover();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  const start = (): void => {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  const stop = (): void => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
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

  // ---- the floating VectoJS panel (ThreeAdapter) ----
  const PANEL_W = 512;
  const PANEL_H = 320;
  const adapter = new ThreeAdapter({ width: PANEL_W, height: PANEL_H });
  // The prebuilt mesh is a 1x1 plane with a FrontSide MeshBasicMaterial. DoubleSide
  // is REQUIRED: the camera orbits a full 360° and the panel can auto-spin, so a
  // single-sided plane would vanish AND stop raycasting for half of every turn.
  (adapter.mesh.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
  adapter.mesh.scale.set(3.2, 3.2 * (PANEL_H / PANEL_W), 1); // keep the 512x320 aspect
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
  // exactly what a single-glyph "−"/"+" stepper wants.
  const minusBtn = new Button('−', {
    onClick: () => setCount(state.particleCount - COUNT_STEP),
  });
  const plusBtn = new Button('+', {
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
  adapter.vectoScene.start(); // drives the panel's own inner rAF → texture.needsUpdate

  // ---- pointer → raycaster → adapter, using the canvas's own rect (NOT window) ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const setNdc = (e: PointerEvent | WheelEvent): void => {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  };
  const forward = (
    type: 'pointerdown' | 'pointerup' | 'pointermove' | 'wheel' | 'click',
    e: PointerEvent | WheelEvent,
  ): boolean => {
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);
    return adapter.updateIntersection(raycaster, type, e);
  };

  // If a pointerdown lands on the panel, suppress OrbitControls so a click on a
  // button doesn't also nudge the camera. Re-enable on release regardless of hit.
  canvas.addEventListener('pointerdown', (e) => {
    if (forward('pointerdown', e)) controls.enabled = false;
  });
  canvas.addEventListener('pointermove', (e) => forward('pointermove', e));
  window.addEventListener('pointerup', (e) => {
    forward('pointerup', e);
    controls.enabled = true;
  });
  canvas.addEventListener('click', (e) => forward('click', e as unknown as PointerEvent));
  canvas.addEventListener('wheel', (e) => forward('wheel', e), { passive: true });

  // Re-raycast each frame so hover stays correct as the camera orbits under a still
  // cursor (updateIntersection no-ops when the hit target hasn't changed).
  const refreshHover = (): void => {
    raycaster.setFromCamera(ndc, camera);
    adapter.updateIntersection(raycaster, 'pointermove');
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDimension);
else initDimension();
