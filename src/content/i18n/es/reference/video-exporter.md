---
title: '@vectojs/video-exporter'
description: 'CLI y librería para avanzar una escena de VectoJS fotograma a fotograma y codificar su salida de canvas como H.264 MP4 con Chromium y FFmpeg.'
order: 47
---

# `@vectojs/video-exporter`

Versión documentada: **0.2.2**

`@vectojs/video-exporter` impulsa una escena de VectoJS en Chromium headless un paso de tiempo fijo a la vez, captura su canvas como fotogramas PNG y envía esos fotogramas a FFmpeg para codificación H.264 MP4.

## Características

- **Control de escena por paso fijo**: Detiene el bucle normal de la Scene y llama a `scene.step(1000 / fps)` antes de cada captura. Esto hace que el tiempo de simulación solicitado sea determinista; no garantiza que el código de aplicación que utiliza relojes no relacionados, entrada de red o aleatoriedad sea determinista.
- **Tubería de imágenes PNG**: Llama a `canvas.toDataURL('image/png')` en Chromium, decodifica el resultado base64 en Node y escribe cada PNG en la entrada estándar de FFmpeg.
- **Salida MP4 estándar**: Usa el codificador `libx264` de FFmpeg y el formato de píxeles `yuv420p`.
- **Helper de fuente local**: Para una ruta de módulo local, inicia un servidor Vite incrustado y sirve una entrada HTML en memoria sin modificar el directorio fuente. También se aceptan páginas HTTP(S) alojadas.
- **Salida atómica**: Codifica en un archivo único junto al destino y reemplaza el MP4 solicitado solo después de que FFmpeg sale correctamente. Las exportaciones fallidas o abortadas preservan un destino existente.
- **Limpieza determinista**: Detiene la salida de progreso, termina FFmpeg, cierra Chromium y Vite, y elimina los archivos temporales al tener éxito, fallar o abortar.

---

## Instalación

```bash
bun add @vectojs/video-exporter
```

El exportador requiere `ffmpeg` en `PATH`. Chromium se resuelve desde `PUPPETEER_EXECUTABLE_PATH`, luego `/usr/bin/chromium` cuando está presente, luego el navegador configurado o incluido de Puppeteer.

```bash
ffmpeg -version
PUPPETEER_EXECUTABLE_PATH=/opt/chrome/chrome bunx vecto-export ./scene.ts
```

Vite es una dependencia en tiempo de ejecución y se instala automáticamente para entradas locales de JavaScript y TypeScript.

## Uso (CLI)

Pasa un módulo local de JavaScript/TypeScript directamente:

```bash
bunx vecto-export ./my-animation.ts -o output.mp4 -f 60 -d 5
```

O pasa una URL pre-alojada:

```bash
bunx vecto-export http://localhost:5173 -o output.mp4 -f 60 -d 5
```

### Opciones

- `-o, --output` : Archivo de salida (por defecto: out.mp4)
- `-w, --width` : Ancho en píxeles (por defecto: 1280)
- `-h, --height` : Alto en píxeles (por defecto: 720)
- `-f, --fps` : Fotogramas por segundo (por defecto: 60)
- `-d, --duration`: Duración en segundos (por defecto: 5)

## Uso de la API interna

```typescript
import { exportVideo } from '@vectojs/video-exporter';

await exportVideo({
  url: 'my-animation.ts', // o una URL http
  outputPath: 'out.mp4',
  width: 1920,
  height: 1080,
  fps: 60,
  duration: 10,
});
```

La página renderizada debe exponer una Scene de VectoJS iniciada o iniciable como `window.vectoScene`. El exportador espera hasta 10 segundos por ella, requiere métodos invocables `stop()` y `step(dt)`, luego la avanza con pasos fijos. El primer `<canvas>` se redimensiona a las dimensiones de salida solicitadas y se captura.

```typescript
const scene = new Scene(document.querySelector('canvas')!);
// añadir entidades...
(window as Window & { vectoScene?: Scene }).vectoScene = scene;
scene.start();
```

El número de fotogramas es `Math.ceil(fps × duration)`. Si FFmpeg sale con código distinto de cero, la Promise se rechaza con una cola limitada de stderr. Los errores distinguen las fases de validación, Vite, Chromium/contrato de página, captura, FFmpeg, confirmación de salida y limpieza.

## Cancelación y señales de proceso

Las exportaciones con la API de aborto usan un `AbortController`. El CLI mapea `SIGINT` y `SIGTERM` a la misma ruta de limpieza, espera a que los recursos se cierren, luego devuelve el código de salida 130 o 143.

```typescript
const controller = new AbortController();
const exportPromise = exportVideo({
  url: './my-animation.ts',
  outputPath: './out.mp4',
  width: 1920,
  height: 1080,
  signal: controller.signal,
});

controller.abort();
await exportPromise;
```

## Política de sandbox de Chromium

El sandbox permanece habilitado para usuarios normales. Se deshabilita solo para root o cuando `VECTO_CHROMIUM_NO_SANDBOX=1` está explícitamente establecido, y el exportador advierte en cualquiera de los casos. La variable de entorno está destinada a ejecutores CI restringidos; prefiere un proceso normal no root en otros entornos.
