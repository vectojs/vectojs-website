+++
title = "Fundamentos Matemáticos"
description = "Los principios matemáticos y físicos que sustentan el motor de renderizado de VectoJS: Virtual Math Trees, proyección de accesibilidad semántica, grupos de Lie, disposiciones divididas, hit-testing de splines, ajuste por diferencia de conjuntos, animación por ODE y descarte espacial."
weight = 6
+++

# Fundamentos Matemáticos

VectoJS trata el renderizado de UI no como una serie de resoluciones de la cascada de estilos CSS, sino como un puro **problema de cómputo geométrico y algebraico**. Al convertir la disposición, el descarte, el hit-testing, el ajuste de línea del texto y la animación en sistemas matemáticos formales, el motor evita por completo los pipelines de recálculo del DOM y de la disposición del navegador.

Este documento detalla los ocho pilares matemáticos y de ingeniería que sirven como fundamento del runtime de VectoJS.

---

## 1. El Virtual Math Tree (VMT)

En lugar de mantener un árbol pesado de nodos DOM del navegador, VectoJS opera sobre el **Virtual Math Tree (VMT)**. El VMT es un puro **grafo de escena algebraico y de coordenadas** en memoria, en lugar de una representación de elementos de marcado.

### Representación algebraica puramente en memoria

En una UI tradicional, las disposiciones se resuelven mediante el motor de reflow de un navegador, que calcula modelos de caja en cascada y actualiza las capas de renderizado CSS. En el VMT, cada elemento visual (una _Entity_) se representa como un sistema de coordenadas localizado, mapeado a su padre mediante relaciones algebraicas afines:

$$\mathbf{M}_{\text{world, child}} = \mathbf{M}_{\text{world, parent}} \cdot \mathbf{M}_{\text{local}}$$

El árbol visual no requiere un nodo HTML con estilos por cada elemento dibujable. El recorrido de renderizado compone transformaciones numéricas en JavaScript; la sincronización de accesibilidad y los portales DOM son fases separadas orientadas al navegador cuyo coste aún debe medirse.

### Rutas calientes conscientes de la asignación

Para sostener un alto rendimiento de renderizado, el recorrido de renderizado del VMT evita asignar por nodo durante el recorrido.

- **Transformaciones escalares enhebradas**: En lugar de asignar un objeto de matriz por nodo, el recorrido de renderizado enhebra directamente seis parámetros escalares de transformación a través de la recursión, evitando una asignación en el heap por nodo por frame.
- **Arrays escalares planos para el texto**: `LayoutResultBuffer` empaqueta las coordenadas de disposición en TypedArrays contiguos y preasignados que pueden reutilizarse entre frames, reduciendo la presión de asignación de nodos de disposición. Esto no hace que todo el Scene o el llamante sea de cero asignaciones.

Ten en cuenta lo que esto _no_ significa: las pasadas de recorrido de renderizado, hit-testing y sincronización de accesibilidad siguen siendo $O(N)$ cuando se ejecutan. `renderMode: 'onDemand'` se salta el dibujo y el recorrido de entidades para un frame estático, aunque el Scene continúa sondeando rAF y comprobando el estado de sucio/animación.

---

## 2. Shadow DOM Semántico (a11yRoot)

Los motores de UI basados en canvas han sufrido históricamente la deficiencia de la "caja negra": son completamente invisibles para los lectores de pantalla, no pueden ser auditados por motores de accesibilidad automatizados y rompen características nativas del navegador como copiar y pegar o la composición del Editor de Métodos de Entrada (IME CJK).

VectoJS resuelve esto mediante el **Shadow DOM Semántico** (o `a11yRoot`).

### Proyección activa de accesibilidad

Mientras VectoJS renderiza todos los gráficos directamente dentro de un único elemento `<canvas>`, mantiene un **Shadow DOM Semántico** invisible y de alta fidelidad, superpuesto en posición absoluta directamente encima del espacio de coordenadas del canvas.

```text
┌────────────────────────────────────────────────────────┐
│  Semantic Shadow DOM (a11yRoot: <button>, <input>...)  │  <-- Interactive/A11y Layer
├────────────────────────────────────────────────────────┤
│  WebGL / Canvas 2D Graphics Canvas Layer               │  <-- High-Performance Graphics
└────────────────────────────────────────────────────────┘
```

Para cada entidad interactiva en el Virtual Math Tree, el motor proyecta un elemento HTML semántico correspondiente (p. ej., `<button>` para botones, `<input>` para campos de entrada, `<a>` para enlaces) a la raíz shadow. Estos nodos DOM son totalmente transparentes pero coinciden con los límites físicos, el orden de anidamiento y el estado interactivo de los elementos de Canvas correspondientes.

### Integridad de pruebas y lectores de pantalla

Como el shadow DOM está compuesto por etiquetas HTML estándar y nativas:

- **Lectores de pantalla**: Las herramientas de accesibilidad interactúan con las etiquetas semánticas nativas, pronunciando descripciones y leyendo estados.
- **Pruebas automatizadas**: Frameworks como Playwright o los agentes de IA pueden localizar y consultar componentes de UI basados en Canvas usando mecanismos de consulta estándar como `page.getByRole('button', { name: 'Submit' })`.
- **Composición IME**: Los métodos de entrada CJK funcionan de forma nativa porque interactúan con una etiqueta `<input>` real dentro de la capa shadow, que luego transmite las cadenas compuestas al motor de renderizado de VectoJS en tiempo real.

---

## 3. Transformaciones afines

VectoJS abandona por completo las propiedades de disposición CSS como el posicionamiento `absolute`, `relative` o `flex`. En su lugar, la relación espacial de cada nodo en el Virtual Math Tree se comprime en una **matriz de transformación afín** homogénea de $3 \times 3$ en el plano euclidiano.

### La matriz de transformación

La traslación $(t_x, t_y)$, la escala $(s_x, s_y)$ y la rotación $\theta$ (en radianes) de una entidad se combinan en una sola matriz $M \in \text{Aff}(2)$:

VectoJS aplica las transformaciones locales como $T \cdot S \cdot R$:

$$M = \begin{bmatrix} s_x \cos\theta & -s_x \sin\theta & t_x \\\\ s_y \sin\theta & s_y \cos\theta & t_y \\\\ 0 & 0 & 1 \end{bmatrix}$$

La traslación más la rotación por sí solas forman el grupo de movimiento rígido $SE(2)$; añadir la escala (y el cizallamiento producido por la escala no uniforme anidada más la rotación) requiere el grupo afín más general.

### Transformaciones en cascada (multiplicación de matrices)

Al recorrer el árbol de nodos, los hijos heredan el espacio de coordenadas de su padre. Como la multiplicación de matrices es asociativa, la matriz de transformación global $M_{\text{global}}$ para cualquier entidad anidada se calcula multiplicando la matriz global acumulada del padre por la matriz local:

$$M_{\text{global}} = M_{\text{parent}} \times M_{\text{local}}$$

Esto se ejecuta durante la pasada de renderizado del recorrido en profundidad en preorden (DFS). VectoJS lo hace directamente sobre variables escalares de tipo float (evitando asignaciones en el heap) para optimizar el rendimiento del cálculo:

```typescript
// Scalar multiplication of 3x3 transformation matrix
const globalX = parent.m00 * local.x + parent.m01 * local.y + parent.m02;
const globalY = parent.m10 * local.x + parent.m11 * local.y + parent.m12;
```

### Transformaciones inversas en forma cerrada (regla de Cramer)

Para mapear coordenadas en sentido inverso (p. ej., trasladar clics del ratón en el espacio de pantalla o coordenadas de raycast 3D de vuelta al espacio de coordenadas de una entidad local), VectoJS calcula la matriz inversa $M_{\text{global}}^{-1}$.

VectoJS usa la inversa en forma cerrada de la matriz afín de seis escalares en lugar de un solucionador general de matrices:

$$M^{-1} = \frac{1}{\det(M)} \begin{bmatrix} m_{11}m_{22} - m_{12}m_{21} & m_{02}m_{21} - m_{01}m_{22} & m_{01}m_{12} - m_{02}m_{11} \\\\ m_{12}m_{20} - m_{10}m_{22} & m_{00}m_{22} - m_{02}m_{20} & m_{02}m_{10} - m_{00}m_{12} \\\\ m_{10}m_{21} - m_{11}m_{20} & m_{01}m_{20} - m_{00}m_{21} & m_{00}m_{11} - m_{01}m_{10} \end{bmatrix}$$

Como la tercera fila de nuestra matriz homogénea es siempre $\begin{bmatrix} 0 & 0 & 1 \end{bmatrix}$, el determinante se reduce a:

$$\det(M) = m_{00} \cdot m_{11} - m_{01} \cdot m_{10}$$

Si $\det(M) \neq 0$, `worldToLocal()` resuelve las coordenadas inversas en tiempo aritmético constante y devuelve un punto `{ x, y }`. Las transformaciones singulares devuelven `null`.

---

## 4. Motor de disposición con división fría/caliente

El renderizado de texto en la web es notoriamente lento. En los navegadores tradicionales, modificar incluso un solo carácter puede desencadenar un reflow masivo (recalculando anchos, segmentando palabras y consultando cachés de fuentes a nivel del SO) a través de todo el documento. VectoJS resuelve esto mediante el **Motor de Disposición con División Fría/Caliente**.

### Ruta fría: segmentación y medición

Los aspectos costosos del procesamiento de texto —tokenización (usando `Intl.Segmenter` para los límites de palabra), ordenación BiDi (texto bidireccional) y medición de los límites de los glifos usando contextos de canvas— se aíslan en la **Pasada Fría**.

- Se ejecuta **solo** cuando el contenido de texto real cambia.
- Mide y construye un mapa de disposición plano y almacenable en caché.
- Los resultados se almacenan dentro de una representación `PreparedText` localizada e inmutable.

### Pasada caliente: ajuste y alineación solo matemáticos

Cuando un bloque de texto se redimensiona (p. ej., al arrastrar la ventana o animar una tarjeta de disposición responsiva), VectoJS desencadena la **Pasada Caliente**:

- Evita todas las consultas a `Intl.Segmenter` o a la API de medición del canvas.
- Lee los anchos de glifos en caché directamente desde el mapa `PreparedText`.
- Calcula los saltos de línea, los offsets de ajuste vertical y los márgenes de párrafo con operaciones numéricas sobre los avances en caché.

Separar la preparación fría del posicionamiento caliente permite que los cambios de ancho reutilicen la segmentación y la medición. La memoización de párrafos también reutiliza los párrafos iniciales sin cambios durante las operaciones de anexión. El párrafo modificado aún escala con su propia longitud, y el análisis léxico de Markdown sigue siendo a nivel de documento.

---

## 5. Álgebra de diferencia de conjuntos para flujos de texto

Los navegadores web tradicionales ajustan el texto alrededor de obstáculos (como imágenes flotantes o llamadas en línea) usando cálculos complejos de disposición CSS. VectoJS modela el flujo de texto matemáticamente como **Teoría de Conjuntos de Sustracción de Intervalos** sobre la recta de los números reales.

### División de intervalos de línea

Para una línea dada en la coordenada vertical $Y$ y con altura $H$, el ancho total de ajuste se representa como un único intervalo cerrado $I_0 = [0, \text{maxWidth}]$.

Si $K$ formas de obstáculo (`ExclusionRect`) se solapan con el rango Y $[Y, Y+H]$, cada obstáculo representa un intervalo de sustracción $E_k = [x_{s,k}, x_{e,k}]$:

<img src="/images/set-difference-intervals.svg" alt="Diagrama que muestra tres barras de intervalo horizontales: el intervalo total de línea que abarca de 0 a maxWidth, un intervalo de obstáculo xs1 a xe1 en el medio, y la diferencia de conjuntos resultante como dos segmentos separados que evitan el obstáculo" class="diagram" />

Los segmentos disponibles $I_{\text{allowed}}$ para colocar los glifos de texto se resuelven calculando la diferencia de conjuntos:

$$I_{\text{allowed}} = I_0 \setminus \bigcup_{k=1}^{K} E_k$$

### Ejecución del algoritmo

El motor ejecuta esta aritmética de diferencia de conjuntos:

1. Reúne todos los intervalos de exclusión que se solapan con el rango Y.
2. Fusiona los intervalos de exclusión solapados en una lista ordenada de intervalos disjuntos.
3. Sustrae estos intervalos de $[0, \text{maxWidth}]$ para producir una lista de subintervalos válidos.
4. Ajusta los tokens de texto en estos subintervalos secuencialmente.

Esto permite resolver el ajuste tipográfico complejo como una pasada determinista y plana de sustracción de intervalos, en lugar de un renderizado recursivo de prueba y error.

---

## 6. Hit-Testing de splines muestreados

Los frameworks de canvas tradicionales hacen hit-test de las curvas dibujándolas de forma invisible y leyendo los píxeles de color, o comprobando si los clics se encuentran dentro de la caja delimitadora rectangular (AABB) que encierra la curva. Lo primero es lento, y lo segundo es muy inexacto.

`SplineEntity` representa cada segmento cúbico como una curva de Bézier $P(t)$ para $t \in [0, 1]$:

$$P(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t) t^2 P_2 + t^3 P_3$$

Donde $P_0, P_1, P_2, P_3 \in \mathbb{R}^2$ son los puntos de control.

### Aproximación por polilínea

La implementación actual muestrea cada segmento de Bézier en una polilínea `Float32Array` de resolución fija y la almacena en caché. Para un puntero $C(x, y)$, calcula la distancia al cuadrado a cada segmento de línea adyacente y acepta el impacto cuando:

$$d^2(C, \overline{P_iP_{i+1}}) \le \left(\frac{\text{lineWidth}}{2} + \text{hitTolerance}\right)^2$$

La aproximación en caché hace que los impactos repetidos sean baratos y deterministas. No es un solucionador analítico de quíntica/Newton: los segmentos de muy alta curvatura pueden desviarse entre las muestras, así que elige `hitTolerance` teniendo en cuenta esa aproximación. `hitTest: 'aabb'` se salta el refinamiento por completo.

---

## 7. Ecuaciones diferenciales y solucionadores de Euler semi-implícito

Las animaciones CSS operan en escalas de tiempo fijas ($t \in [0, 1]$). Si la posición objetivo cambia en pleno vuelo (p. ej., siguiendo un cursor), la curva de Bézier debe recalcularse, lo que resulta en saltos visuales o pérdida de momento.

VectoJS resuelve esto usando **ecuaciones diferenciales ordinarias (ODE)** que simulan un sistema físico de masa-resorte-amortiguador.

### La ecuación rectora

El movimiento de un valor animado $x(t)$ (posición, escala u opacidad) hacia su valor objetivo $x_{\text{target}}$ se rige por la Ley de Hooke con amortiguación:

$$m \frac{d^2x}{dt^2} + c \frac{dx}{dt} + k(x - x_{\text{target}}) = 0$$

Donde:

- $m$ es la masa (inercia).
- $c$ es el coeficiente de amortiguación (fricción).
- $k$ es la rigidez del resorte (fuerza de atracción).

### Integración numérica (Euler semi-implícito)

Para resolver esta ecuación paso a paso en tiempo de ejecución, VectoJS usa un solucionador de **integración de Euler semi-implícito**. A diferencia del Euler explícito (que es inestable y acumula error de energía), el solucionador semi-implícito calcula la velocidad usando el estado actual y luego calcula la posición usando la _siguiente_ velocidad:

$$v_{t+\Delta t} = v_t + \frac{-k(x_t - x_{\text{target}}) - c v_t}{m} \Delta t$$

$$x_{t+\Delta t} = x_t + v_{t+\Delta t} \Delta t$$

Donde $\Delta t$ es el paso de tiempo del frame (en segundos).

Como el solucionador calcula las fuerzas dinámicamente basándose en el valor actual $x_t$ y la velocidad $v_t$ relativos a $x_{\text{target}}$, el objetivo puede moverse dinámicamente (p. ej., arrastre, hover del ratón o reflow responsivo). El sistema se adapta naturalmente, conservando el momento y llevando los elementos a un estado de reposo suavemente con una amortiguación orgánica.

---

## 8. Utilidad SpatialHashGrid

En una escena que contiene $N$ entidades, el hit-testing integrado y el recorrido de descarte por viewport son $O(N)$. Que eso sea significativo depende del trabajo de las entidades y del hardware objetivo.

VectoJS exporta un **SpatialHashGrid** que las aplicaciones pueden rellenar explícitamente para acotar el coste de las consultas AABB locales. El `findEntityAt()` integrado del Scene y el descarte por viewport no lo usan automáticamente; ambos siguen recorriendo el árbol de entidades.

<figure>
  <iframe src="/sandbox/diagram-spatial-hash.html" class="diagram-frame" loading="lazy" title="A spatial hash grid where a moving cursor only tests its own cell and eight neighbours, rendered live by VectoJS" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Una aplicación de cuadrícula espacial puede consultar solo las celdas que se solapan con una región local de puntero/AABB. <em>(Concepto renderizado en vivo por VectoJS.)</em></figcaption>
</figure>

### La función hash

El espacio de coordenadas se divide en una cuadrícula de celdas de tamaño $S$. La caja delimitadora de cualquier entidad se mapea a un conjunto de coordenadas de celda enteras $(i, j) \in \mathbb{Z}^2$:

$$i = \left\lfloor \frac{x}{S} \right\rfloor, \quad j = \left\lfloor \frac{y}{S} \right\rfloor$$

Estas coordenadas de cuadrícula se mapean a una única clave de bucket 1D usando una [función de emparejamiento de Cantor](https://en.wikipedia.org/wiki/Pairing_function), plegando primero las coordenadas negativas al dominio no negativo:

$$x = \begin{cases} 2i & i \geq 0 \\\\ -2i - 1 & i < 0 \end{cases} \qquad y = \begin{cases} 2j & j \geq 0 \\\\ -2j - 1 & j < 0 \end{cases}$$

$$H(i, j) = \frac{(x + y)(x + y + 1)}{2} + y$$

Los buckets viven en un `Map` simple, no en una tabla de capacidad fija — no hay módulo, y el mapa crece con la cantidad de celdas ocupadas distintas que existan.

### Reducción de complejidad

- **Indexación gestionada por la aplicación**: Llama a `insert(id, x, y, w, h)` a medida que las entidades se mueven, o a `clear()` y reconstruye para un frame dinámico.
- **Consulta AABB**: `query(x, y, w, h)` visita cada celda de la cuadrícula solapada por esa caja y devuelve un `Set<string>` deduplicado.
- _Resultado_: El tiempo de consulta es proporcional a las celdas solapadas más los IDs devueltos. Es casi constante solo para entidades pequeñas, de tamaño similar y distribuidas uniformemente; los buckets densos degradan hacia escaneos lineales. Consulta la [guía de Rendimiento](/learn/performance/#3-mar-de-entidades-en-interaccion-catastrofe-de-complejidad-o-n-2).

---

## Resumen de ventajas matemáticas

| Dimensión               | Navegador / DOM                          | VectoJS                                | Principio matemático                |
| ----------------------- | ---------------------------------------- | -------------------------------------- | ----------------------------------- |
| **Grafo de escena**     | Árbol DOM HTML                           | Virtual Math Tree (VMT)                | Grafo de escena en memoria contigua |
| **Accesibilidad**       | DOM semántico nativo                     | Overlay de proyección semántica        | Sincronización de estado del DOM    |
| **Transformaciones**    | transform/layout CSS                     | Matrices homogéneas 3x3                | Álgebra lineal afín                 |
| **Reflow**              | Reflow de un solo hilo                   | Disposición con división fría/caliente | Segmentación de palabras en caché   |
| **Ajuste de texto**     | Prueba y error del reflow                | Sustracción de intervalos de segmento  | Álgebra de diferencia de conjuntos  |
| **Selección de curvas** | Lectura de píxeles / AABB amplio         | Polilínea muestreada en caché          | Distancia punto a segmento          |
| **Animación**           | Líneas de tiempo de Bézier cúbico        | Solucionador masa-resorte-amortiguador | Integración de ODE de segundo orden |
| **Descarte**            | Heurísticas de renderizado del navegador | Límites AABB locales opcionales        | Solapamiento de AABB transformado   |

> **Siguiente:** [Primeros Pasos](/learn/getting-started/) — instala los paquetes y escribe tu primera escena.
