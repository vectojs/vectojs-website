import { Scene } from '@vectojs/core';

export function createSandbox({ id, height = 420, minWidth = 320, onResize } = {}) {
  const app = document.querySelector('#app');
  const canvas = document.querySelector('#canvas');
  const status = document.querySelector('#status');
  const errorBox = document.querySelector('#error');

  if (!(app instanceof HTMLElement)) throw new Error('Missing #app');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #canvas');

  const measureWidth = () => Math.max(minWidth, app.clientWidth || window.innerWidth || minWidth);
  const initialWidth = measureWidth();
  app.style.height = `${height}px`;
  canvas.width = initialWidth;
  canvas.height = height;

  const scene = new Scene(canvas, { maxFPS: 60, disableWindowResize: true });
  scene.renderMode = 'onDemand';

  const resize = () => {
    const width = measureWidth();
    app.style.height = `${height}px`;
    canvas.width = width;
    canvas.height = height;
    scene.resize(width, height);
    onResize?.(width, height, scene);
    scene.markDirty();
  };

  window.addEventListener('resize', resize);
  resize();

  return {
    app,
    canvas,
    scene,
    resize,
    ready() {
      scene.start();
      requestAnimationFrame(() => {
        resize();
        status?.classList.add('ready');
        window.parent?.postMessage({ type: 'vecto-sandbox-ready', id }, '*');
      });
    },
    fail(error) {
      if (status) status.style.display = 'none';
      if (errorBox) {
        errorBox.style.display = 'block';
        errorBox.textContent =
          error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
      }
    },
  };
}

export function commonCardWidth(width, max = 680) {
  return Math.min(max, width - 32);
}
