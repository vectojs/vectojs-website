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
    const _dt = now - last; // frame delta, reserved for Task 5/6 spin animation
    void _dt;
    last = now;
    controls.autoRotate = state.autoOrbit;
    controls.update();
    grid.visible = state.grid;
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

  // Expose a couple of handles so later tasks (panel, HUD, report) can attach.
  // (Populated further in Task 5 — panel + controls — and Task 6 — HUD/report — kept on a typed local, not window.)
  void state;
  void rebuildParticles;
  void controls;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDimension);
else initDimension();
