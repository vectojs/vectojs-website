+++
title = "11 — Layout de Grafos — Física Dirigida por Fuerzas y Benchmarking"
description = "El motor 2D sin dependencias de ForceLayout2D, el quadtree Barnes-Hut y la rejilla de colisión por niveles, la mutación incremental y los contratos de pin, la familia 3D VectoForceLayout/D3ForceLayout, el kernel WASM vectojs-force-rs y la metodología de benchmark con ventana visible."
weight = 31
+++

# 11 — Layout de Grafos — Física Dirigida por Fuerzas y Benchmarking

> **Boss 11** parece "muelles y repulsión" hasta que lo pones en producción. El N-body ingenuo es O(N²) por tick, un único hub colapsa las rejillas de colisión ingenuas, la expansión incremental no debe destruir el estado ya asentado, y dos usuarios deben ver el mismo layout a partir de la misma semilla. VectoJS responde con un quadtree 2D agnóstico al renderer más una rejilla por niveles en `@vectojs/graph-layout`, una familia paralela de octrees 3D en `@vectojs/graph3d` y un kernel Rust bit-idéntico en `crates/vectojs-force-rs`.

- **Qué aprenderás**: por qué N², estabilidad, incrementalidad y determinismo son los cuatro problemas difíciles; cómo `ForceLayout2D` almacena estado SoA y expone posiciones en `Float32Array`; cómo se componen por tick la repulsión (Barnes-Hut), los muelles de enlace, el centrado y la colisión; por qué el quadtree 2D y la rejilla de colisión por niveles reemplazaron a las rejillas ingenuas; cómo interactúan pins, mapeos de ID, recalentamiento y enfriamiento por alpha; en qué se diferencian `VectoForceLayout` vs `D3ForceLayout` vs `FixedZLayout` y dónde los consume `KnowledgeGraphModel`; qué reemplaza el kernel de fuerzas WASM y cómo se mantiene bit-idéntico; y qué mide realmente `benchmarks/graph-layout` (y qué explícitamente no mide).
- **Qué no aprenderás**: ciclo de vida dirty del VMT (boss 06), corrección de renderer/DPR (boss 07) ni la tripleta WASM G1/G2/G3 (boss 08) — aunque este boss reutiliza verbatim el contrato de backend invisible del boss 08. El shaping de texto (boss 02) y el Markdown en streaming (boss 04) son consumidores del layout de grafos, no al revés.

## 1. Por qué el layout de fuerzas es engañosamente difícil

Cuatro problemas se esconden tras "muelles y repulsión":

1. **N² vs Barnes-Hut.** La repulsión es cada-nodo-contra-todos-los-demás. Con 3000 nodos son ~9M de fuerzas por par por tick, por frame, en el hilo principal o en un worker. Un quadtree 2D real (`BarnesHutQuadtree.ts:8` array plano, reutilizado entre ticks) lo convierte en O(N log N) al tratar celdas lejanas como una sola pseudo-partícula cuando `size/distance < theta` (`BarnesHutQuadtree.ts:121` test de apertura `4*half² < theta²*d²`). El lado 3D hace lo mismo con un octree (`VectoForceLayout.ts:402` `BarnesHutOctree`). Sin él, los grafos por encima de unos cientos de nodos sufren tirones.

2. **Estabilidad con radios heterogéneos.** Un único hub con radio 100 junto a 3000 hojas con radio 4 colapsa una rejilla de colisión uniforme: un `cellSize = 2·maxRadius` mete cada hoja en una vecindad gigante de 3×3 y el escaneo de pares degenera a cuadrático (el comentario en `BarnesHutQuadtree.ts:189` mide `12 ms → 197 ms` por tick al pasar de 3k a 12k con un hub grande). La solución es una rejilla por niveles con radios en potencias de dos (`BarnesHutQuadtree.ts:190` nivel `t = floor(log2(r))`, celda `Ct = 2^(t+2)`), donde cada nivel posee su propia tabla hash y los pares entre niveles se resuelven exactamente una vez.

3. **Incrementalidad sin teletransporte.** Los grafos de conocimiento se paginan: 50 nodos ahora, 50 más tras el scroll. Los llamantes esperan que `appendGraph` conserve cada posición, velocidad y pin exactamente donde estaban, añada solo los nodos nuevos de forma determinista y recaliente suavemente (`ForceLayout2D.ts:162` `appendGraph`, `ForceLayout2D.ts:199` `if (newNodes.length>0||addedLinks>0) this.reheat()`). Reconstruir con `setGraph` (`ForceLayout2D.ts:123`) teletransportaría el grafo ya asentado.

4. **Determinismo entre plataformas.** `seed` debe reproducir la misma colocación inicial y el mismo jitter de puntos coincidentes en JS y Rust, para que tests, snapshots y futuros oráculos diferenciales WASM coincidan bit a bit. Las matemáticas elegidas son `mulberry32` (`ForceLayout2D.ts:868`), `Math.sqrt` (no `Math.hypot` — aproximado por el motor, nota en `VectoForceLayout.ts:618`) y jitter entero con `Math.imul` (`BarnesHutQuadtree.ts:618` `collisionPairAngle`, `VectoForceLayout.ts:606` `jitterFor` / `crates/vectojs-force-rs/src/lib.rs:83` `jitter_for`).

Si falta uno solo, el grafo o bien sufre tirones, explota, se teletransporta o diverge entre JS y WASM.

## 2. Mapa de paquetes

```text
@vectojs/graph-layout          motor 2D sin dependencias, sin peer de renderer
  src/ForceLayout2D.ts         el bucle de tick, almacenes SoA, API pública
  src/types.ts                 NodeId/GraphData/ForceLayout2DOptions
  src/internal/BarnesHutQuadtree.ts  quadtree + rejilla de colisión por niveles
  src/index.ts                 barrel (types + layout)

@vectojs/graph3d               renderer instanciado 3D + backends de layout
  src/layout/GraphLayout.ts    contrato 3D mínimo (setGraph/step/positions/pin/reheat/dispose)
  src/layout/VectoForceLayout.ts  octree Barnes-Hut 3D propio (oráculo JS + WASM)
  src/layout/D3ForceLayout.ts  adaptador d3-force-3d (fidelidad de migración)
  src/wasm/force-backend.ts    cargador streaming/sync para el kernel Rust
  src/wasm/asset.ts            helper forceWasmUrl para el bundler
  src/wasm/vectojs_force.wasm  salida gitignoreada de vectojs-force-rs

@vectojs/knowledge-graph       consumidor paginado (KnowledgeGraphModel)
  src/KnowledgeGraphModel.ts   único driver de un GraphLayout (setGraph/reheat)
  src/FixedZLayout.ts          VectoForceLayout con z fijada a un plano
  src/KnowledgeGraphSession.ts wiring de fábrica (theta 0.9, opt-in WASM)

crates/vectojs-force-rs        kernel de fuerzas WASM en octree (backend invisible)
  src/lib.rs                   solo build + acumulación de fuerzas, acumuladores f64

benchmarks/graph-layout        matriz 4 brazos con ventana visible (d3-force-3d, vecto-force, d3-force-2d, force-layout-2d)
benchmarks/graph3d-frame       harness de coste por frame para el renderer 3D (no la matriz de física)
benchmarks/_shared/*           servidor único + bundler + stats + runner (run-browsers.sh)
```

`@vectojs/graph-layout` tiene cero dependencias `@vectojs/*` (`package.json:1` `name: @vectojs/graph-layout`); `@vectojs/graph3d` depende solo de `three`; `@vectojs/knowledge-graph` depende del contrato de layout de `graph3d`. Orden de build: `math+text → graph-layout → three/graph3d → knowledge-graph` (verificado vía `package.json` workspaces).

## 3. ForceLayout2D — el motor 2D

### 3.1 Estado y el contrato de positions

Arrays tipados SoA, alineados por índice con el orden de nodos de entrada (`ForceLayout2D.ts:48` `nodes: GraphNode[]`, `ForceLayout2D.ts:49` `nodeIndex: Map<NodeId,number>`, `ForceLayout2D.ts:50` `positionStorage: Float32Array`, `ForceLayout2D.ts:51` `velocityX/Y`, `ForceLayout2D.ts:53` `fixedX/Y` + `pinnedX/Y`, `ForceLayout2D.ts:57` `repulsion`/`collisionRadius`, `ForceLayout2D.ts:60` `linkSource/Target/Distance/Strength/Share`, `ForceLayout2D.ts:76` `quadtree`).

`positions` público es una vista XY entrelazada viva sobre `positionStorage` en el orden de nodos de entrada (`ForceLayout2D.ts:32` `public positions = new Float32Array(0)`, `ForceLayout2D.ts:748` `refreshPositionView` vía `subarray`). La identidad es estable entre llamadas a `step()`, pero cambios de topología o capacidad pueden reemplazar el backing store — los hosts deben volver a adquirir `positions` tras `setGraph`/`appendGraph`/`removeNodes` (doc de clase `ForceLayout2D.ts:18`).

Toda aritmética que toca estado público se redondea vía `Math.fround` (`ForceLayout2D.ts:13` `const f = Math.fround`, `ForceLayout2D.ts:808` `toF32`), coincidiendo con la exposición en `Float32Array`. La ruta 3D hace lo mismo (`VectoForceLayout.ts:48` `const f = Math.fround`) mientras los acumuladores Barnes-Hut permanecen en `f64` (`BarnesHutQuadtree.ts:9` `cellX/Y/centerX/Y/halfSize/charge: Float64Array`).

### 3.2 Identidad de nodos/enlaces y mutación incremental

Los nodos se direccionan en todas partes por `NodeId` (`types.ts:2` `string|number`), no por índice de array, así los pins sobreviven a la compactación (`ForceLayout2D.ts:25` doc). Cuatro puntos de entrada de mutación, cada uno con validación estricta de todo-o-nada:

| método               | doc                    | propiedad                                                     | modo de fallo                                                                                                                                                           |
| -------------------- | ---------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setGraph(data)`     | `ForceLayout2D.ts:122` | reemplaza todo, re-siembra, `alpha=1`                         | ID de nodo duplicado o enlace que referencia un nodo faltante/propio → lanza antes de limpiar el estado anterior (`ForceLayout2D.ts:132` validar-antes-de-intercambiar) |
| `appendGraph(data)`  | `ForceLayout2D.ts:151` | conserva lo existente, añade IDs nuevos, deduplica            | enlace desconocido/faltante/propio → lanza antes de cualquier mutación (`ForceLayout2D.ts:186` `resolveEndpoint` + guarda `UNKNOWN_ENDPOINT`)                           |
| `removeNodes(ids)`   | `ForceLayout2D.ts:202` | compacta supervivientes en orden original, reconstruye índice | no-op cuando nada coincide; recalienta una vez (`ForceLayout2D.ts:252`)                                                                                                 |
| `removeLinks(items)` | `ForceLayout2D.ts:265` | conserva estado de nodos, compacta enlaces                    | coincidencia por identidad dirigida `(source,target,id)` (`ForceLayout2D.ts:826` `linkIdentity`); idempotente                                                           |
| `updateLinks(links)` | `ForceLayout2D.ts:324` | re-resuelve distancia/fuerza para enlaces existentes          | endpoints desconocidos/idénticos → lanza; identidad no existente se ignora; recalienta solo cuando un valor realmente cambió (`ForceLayout2D.ts:361`)                   |

La identidad de enlace es la trampa sutil. `ForceLayout2D.ts:826` `linkIdentity` serializa `[idKey(source), idKey(target), idKey(id)]` donde `idKey` (`ForceLayout2D.ts:835`) prefija el tipo para evitar colisiones `"1"` vs `1`. Sin `id`, la identidad es el par dirigido de endpoints; los enlaces paralelos requieren `id`s distintos (`types.ts:19` `GraphLink.id`). Los backends 3D difieren: `VectoForceLayout` y `D3ForceLayout` tratan cada par `(source,target)` como un enlace e incluso omiten self-loops (`VectoForceLayout.ts:178` `if (ia===ib) continue`), mientras la guarda de enlaces duplicados del editor es más estricta — señalado en la nota de divergencia en `ForceLayout2D.ts:387`.

`appendLinks` (`ForceLayout2D.ts:637`) deduplica dentro del lote vía `pendingKeys` y resuelve `distance`/`strength` a través de los accesores `NodeValue`/`LinkValue` suministrados por el llamante (`ForceLayout2D.ts:777` `resolveNodeValue`, `ForceLayout2D.ts:787` `resolveLinkValue`), con guardas `finiteOr` (`ForceLayout2D.ts:797`).

El crecimiento de capacidad es geométrico, amortizado O(1) (`ForceLayout2D.ts:851` `grownCapacity` doblando desde 4, `ForceLayout2D.ts:672` `ensureNodeCapacity`, `ForceLayout2D.ts:689` `ensureLinkCapacity`, `ForceLayout2D.ts:857` `resize` preservando prefijo).

### 3.3 El tick — seis fases

`tick()` (`ForceLayout2D.ts:480`) es síncrono y dirigido por el host (`step()` en `ForceLayout2D.ts:368` hace bucle con `tick()` mientras `alpha >= alphaMin`). No posee ningún timer — el host decide cuándo llamar a `step()` (doc de clase `ForceLayout2D.ts:21`).

```text
sanitizeState → quadtree.build → repulsión (Barnes-Hut por nodo)
              → muelles de enlace → rejilla de colisión → centrado+integración+clamp de pin → decaimiento de alpha
```

Cada fase en detalle:

1. **Sanitizar** (`ForceLayout2D.ts:752`) — `toF32` en cada posición/velocidad/pin/repulsión/radio para que un NaN perdido no envenene el árbol; las coords pineadas sobrescriben posiciones almacenadas.

2. **Construcción del árbol** (`ForceLayout2D.ts:483` `quadtree.build(positions, repulsion, nodeCount)`) — ver §5.

3. **Repulsión** (`ForceLayout2D.ts:484` bucle llamando a `quadtree.force(qx,qy,theta,nodeIndex,out,maxDistance)`) — inverso-cuadrático `(-charge / d³) * (dx,dy)` con `distanceSquared` con suelo en `1e-6` y `pairAngle` determinista para coincidencias exactas (`BarnesHutQuadtree.ts:126` / `BarnesHutQuadtree.ts:610` `pairAngle`). Respeta `repulsionDistanceMax` (`ForceLayout2D.ts:92` no-finito = sin corte; `BarnesHutQuadtree.ts:85` `maxDistanceSquared` + pre-test de celda más cercana `distanceToCellSquared` en `BarnesHutQuadtree.ts:632`). El lado 3D usa el mismo suelo y `jitterFor` en la inserción del octree.

4. **Muelles de enlace** (`ForceLayout2D.ts:499`) — tipo Hooke `displacement = ((d - rest)/d) * strength * alpha`, dividido por shares ponderados por grado (`ForceLayout2D.ts:701` `recomputeLinkBias`: `sourceShare = targetDegree/total`, con suelo vía `springShare` cuando un pin fija un endpoint en `ForceLayout2D.ts:846`). Usa posiciones predichas para targets pineados para que un nodo pineado siga tirando.

5. **Colisión** (`ForceLayout2D.ts:580` `applyCollisions` → `BarnesHutQuadtree.ts:172` `applyGridCollisions`) — rejilla por niveles, §5.

6. **Centro + integración** (`ForceLayout2D.ts:554` atracción `center*alpha` hacia el origen, decaimiento de velocidad, luego clamp de pin por eje: ejes pineados se ajustan a `fixedX/Y` y ponen velocidad a cero). **Enfriamiento** (`ForceLayout2D.ts:577` `alpha += (0-alpha)*alphaDecay`) con la guarda `alphaDecay > 0` en `ForceLayout2D.ts:95` porque `0` haría bucle infinito (`step()` en `ForceLayout2D.ts:372` `while (alpha>=alphaMin)`).

## 4. Fuerzas como configuración

`ForceLayout2DOptions` (`types.ts:42`) y `VectoForceLayoutOptions` (`VectoForceLayout.ts:12`) exponen el mismo modelo con defaults distintos:

| parámetro                      | default 2D (`types.ts:43`) | default 3D (`VectoForceLayout.ts:14`)            | rol                                                                | pista de ajuste                                                                                                                                                 |
| ------------------------------ | -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repulsion` / `chargeStrength` | `300` (fuerza positiva)    | `300` (VectoForce) / `-30` (D3 `chargeStrength`) | empuje N-body                                                      | aumenta para separar hubs; 2D clamp de negativos a `0` (`ForceLayout2D.ts:629`/`ForceLayout2D.ts:761` y `BarnesHutQuadtree.ts:109` invariante `charge<=0 skip`) |
| `collisionRadius`              | `0` (off)                  | n/a (graph3d no tiene rejilla 2D)                | radio por nodo, `0` desactiva (`ForceLayout2D.ts:582` escaneo max) | establecido vía accesor a `radius+14` en bench (`entry.ts:631`)                                                                                                 |
| `collisionStrength`            | `1`                        | —                                                | fracción de solapamiento corregida                                 | `0` omite todo el pase                                                                                                                                          |
| `linkDistance`                 | `30`                       | `30`                                             | longitud de reposo del muelle                                      | accesor por grado de enlace en bench (`entry.ts:632`)                                                                                                           |
| `linkStrength`                 | `0.3`                      | `0.3`                                            | rigidez del muelle `[0,1]`                                         | `0` = los enlaces no ejercen nada                                                                                                                               |
| `centerStrength`               | `0.02`                     | `0.02`                                           | atracción hacia el origen                                          | `0` = grafo flotante                                                                                                                                            |
| `velocityDecay`                | `0.6`                      | `0.6`                                            | `1-fricción`, retención `[0,1)`                                    | menor = más amortiguación                                                                                                                                       |
| `theta`                        | `0.9`                      | `0.9`                                            | ángulo de apertura Barnes-Hut                                      | `0` = exacto O(N²); mayor = más rápido/menos preciso                                                                                                            |
| `repulsionDistanceMax`         | `Infinity`                 | `Infinity` (no expuesto separado en bench 3D)    | GC de repulsión lejana                                             | `Infinity`/no-finito = sin corte (`ForceLayout2D.ts:91`); `0` también desactiva vía early-return en `BarnesHutQuadtree.ts:77` — un footgun silencioso           |
| `alphaDecay` / `alphaMin`      | `0.0228` / `0.001`         | `0.0228` / `0.001`                               | enfriamiento (`~1-0.001^(1/300)` ≈300 ticks hasta asentar)         | `0` decay cae a `0.0228` (`ForceLayout2D.ts:96`)                                                                                                                |

La forma de accesor `number | ((node, index)=>number)` (`types.ts:38` `NodeValue`, `LinkValue`) permite mapear tamaño de entidad a radio sin reconstruir. Los shares de enlace se recomputan en cada cambio de topología (`ForceLayout2D.ts:702`).

## 5. Dos índices espaciales

### 5.1 Quadtree Barnes-Hut 2D

`BarnesHutQuadtree.ts:8` es un quadtree en array plano reutilizado por tick. `build()` (`BarnesHutQuadtree.ts:36`) deriva límites cuadrados desde el AABB de posiciones (`+1e-6` de holgura), asegura capacidad (`BarnesHutQuadtree.ts:531` doblando desde 64, heurística `count*4+4`), e inserta cada punto (`BarnesHutQuadtree.ts:437` `insert` con `MAX_DEPTH=40` en línea 1 — guarda de profundidad para puntos coincidentes, la hoja guarda lista enlazada `pointHead→pointNext`). `finalize()` (`BarnesHutQuadtree.ts:485`) recorre nodos en reversa (hijos antes que padres, nodos asignados top-down) acumulando `charge` y `centerX/Y` como promedios ponderados por masa; la guarda `total>0` en `BarnesHutQuadtree.ts:507` se empareja con el invariante `charge<=0 skip` señalado arriba — cargas negativas requerirían repensar ambos.

`force()` (`BarnesHutQuadtree.ts:69`) es un recorrido iterativo con pila (`BarnesHutQuadtree.ts:87` `ensureStack`), con `distanceToCellSquared` (`BarnesHutQuadtree.ts:632`) para el pre-test de corte y el test de aproximación exacto en `BarnesHutQuadtree.ts:117`.

### 5.2 Rejilla de colisión por niveles

`applyGridCollisions` (`BarnesHutQuadtree.ts:172`) existe porque la colisión es una consulta espacial _distinta_ a la repulsión (solapamiento de corto alcance, no campo de largo alcance). Ideas clave:

- **Asignación de nivel** (`BarnesHutQuadtree.ts:206` `tier = floor(log2(radius))`, celda `4*2^tier` en `BarnesHutQuadtree.ts:267`) — radios uniformes colapsan a un solo nivel, comportándose como la antigua rejilla `2·maxRadius`; el límite `cellSize < r_i+r_j` en `BarnesHutQuadtree.ts:198` garantiza que una sonda 3×3 encuentre cada solapamiento.
- **Centinela de radio cero** (`BarnesHutQuadtree.ts:5` `ZERO_TIER = -0x40000000`, `BarnesHutQuadtree.ts:222` bucket) — puntos de radio cero nunca poseen rejilla pero siguen colisionando como iniciadores contra niveles mayores.
- **Counting sort por nivel** (`BarnesHutQuadtree.ts:240` prefix-sum en `collisionOrderOffsets`, `BarnesHutQuadtree.ts:248` llenado con cursor) — O(N) y seguro ante span: las tablas de offset se dimensionan por _span de nivel_, no por conteo de puntos, porque los radios `f32` abarcan ~280 potencias de dos (`BarnesHutQuadtree.ts:237` comentario, `BarnesHutQuadtree.ts:587` `ensureCollisionOffsets`).
- **Sonda 3×3 deduplicada** (`BarnesHutQuadtree.ts:349` `probeCollisionCell`) — 9 slots, hash con sonda lineal `imul(cellX,73856093)^imul(cellY,19349663)` (`BarnesHutQuadtree.ts:596`), filtro de celda duplicada en `BarnesHutQuadtree.ts:372`, regla de par único (`sameTier && target<=source` skip en `BarnesHutQuadtree.ts:390`; entre niveles no necesita skip — cada par de nivel mayor es visitado exactamente una vez por su iniciador menor).
- **Impulso consciente de share** (`BarnesHutQuadtree.ts:406` `pinned?0:otherPinned?1:0.5`) — refleja los shares de muelle pero clamp a mitad cuando ambos están libres (d3-force usa shares ponderados por radio; el comentario en `entry.ts:745` marca la salvedad de comparación).

El octree 3D (`VectoForceLayout.ts:402`) refleja esta estructura en 3D: `BarnesHutOctree.build` cubiciza el AABB, `insert` con la misma guarda `depth < 40` y `jitterFor` determinista para puntos coincidentes (`VectoForceLayout.ts:561`), `finalizeMass` bottom-up, `force` con `size² < theta²*d²` y skip por identidad `pointIndex` (`VectoForceLayout.ts:726`) en lugar de skip por distancia cero — puntos distintos coincidentes se separan con jitter y aún deben ejercer fuerza.

## 6. Pins, recalentamiento y determinismo

**Los pins son por eje, direccionados por ID.** `ForceLayout2D` pinea por `NodeId` (`ForceLayout2D.ts:393` `pinNode(id,x,y)`, `ForceLayout2D.ts:413` `setNodePin({x?,y?})`, `ForceLayout2D.ts:436` `clearNodePin`) almacenando `fixedX/Y` + `pinnedX/Y` (`ForceLayout2D.ts:53`); el `GraphLayout` de graph3d pinea por _índice_ (`GraphLayout.ts:46` `pinNode(nodeIndex,x,y,z)`, `VectoForceLayout.ts:337` `fx/fy/fz = NaN` centinela vs `D3ForceLayout.ts:122` `fx/fy/fz = null`). La divergencia está documentada en `ForceLayout2D.ts:387` — traduce al cruzar stacks. Los `fx/fy` iniciales en un `GraphNode` (`types.ts:12`) se respetan en `ForceLayout2D.ts:619` `addNode` como pre-pins.

**Recalentar eleva alpha pero nunca lo baja** (`ForceLayout2D.ts:450` `alpha = max(alpha, requested)`, `VectoForceLayout.ts:359` igual, `D3ForceLayout.ts:150` `alpha = max(alphaMin, min(1,alpha))`). Cada mutación de topología recalienta una vez (`ForceLayout2D.ts:199`, `ForceLayout2D.ts:252`, `ForceLayout2D.ts:308`, `ForceLayout2D.ts:361` condicional) — los llamantes no necesitan recordarlo. La ruta de knowledge-graph recalienta explícitamente en `KnowledgeGraphModel.ts:285` `layout?.reheat?.(0.5)` tras `rebuildGraph`, que a su vez llama a `layout?.setGraph` en `KnowledgeGraphModel.ts:356`.

**Determinismo** es triple: colocación en espiral sembrada con `mulberry32` (`ForceLayout2D.ts:613` `radius=10*sqrt(i+1), angle=rand()*2π` / `VectoForceLayout.ts:143` `r=10*cbrt(i+1)` esférico), ángulo determinista para coincidencia vía `deterministicAngle` (`ForceLayout2D.ts:878` hasheado desde `(source,target,seed)`) y `collisionPairAngle` (`BarnesHutQuadtree.ts:618` sembrado), y elecciones idénticas de punto flotante entre JS y Rust (la trampa `Math.hypot` de arriba).

**Enfriamiento** usa `alphaDecay = 0.0228` (`≈ 1-0.001^(1/300)`, igual que el default de d3-force-3d, comentario en `VectoForceLayout.ts:32`) con `alphaMin = 0.001`; `step()` retorna `alpha >= alphaMin` como "aún caliente" (`ForceLayout2D.ts:375`), coincidiendo con el contrato `GraphLayout` (doc en `GraphLayout.ts:26`). Un `alpha=0` no liberado nunca se enfría — con guarda en construcción.

## 7. La familia 3D y el consumidor Knowledge Graph

### 7.1 VectoForceLayout vs D3ForceLayout

Ambos implementan `GraphLayout` (`GraphLayout.ts:12` — `Float32Array` plano de tripletas xyz en orden `GraphData.nodes`, transferible a worker, `step()` dirigido por host). Diferencias:

- **Modelo:** `VectoForceLayout` (`VectoForceLayout.ts:50`) es un modelo _nuevo_ — repulsión con octree Barnes-Hut (`VectoForceLayout.ts:402`), muelles de enlace, centrado, decaimiento de velocidad, enfriamiento por alpha — determinista y sin dependencias. `D3ForceLayout` (`D3ForceLayout.ts:25`) es un _adaptador d3-force-3d_ (`forceSimulation(…,3).force('link', forceLink).force('charge', forceManyBody).force('center', forceCenter)` en `D3ForceLayout.ts:88`), manteniendo la sensación de `3d-force-graph` para migración.
- **Propiedad de estado:** `VectoForceLayout` mantiene SoA `positions/vx/vy/vz/fx/fy/fz/linkA/B` (`VectoForceLayout.ts:87`) y nunca muta los nodos del llamante; `D3ForceLayout` clona en `simNodes: SimulationNode[]` (`D3ForceLayout.ts:71`) porque d3 los muta.
- **Pins:** `fx/fy/fz` basado en índice NaN vs centinela `null`; `VectoForceLayout.tick` hace clamp antes de integrar (`VectoForceLayout.ts:308`), el `fx` de d3 hace lo mismo dentro de su tick.
- **Alpha:** `VectoForceLayout.reheat` con suelo en `alphaMin` y tope en `1` (`VectoForceLayout.ts:361`); `D3ForceLayout.reheat` escribe `simulation.alpha()` directamente (`D3ForceLayout.ts:151`).

`FixedZLayout` (`knowledge-graph/src/FixedZLayout.ts:10`) envuelve `VectoForceLayout` y fija cada `z` a una constante tras el step interno, permitiendo que un layout 3D impulse una vista 2D de knowledge-graph sin intercambiar motores. `KnowledgeGraphSession` (`knowledge-graph/src/KnowledgeGraphSession.ts:59` doc "la sesión solo refleja") construye un `VectoForceLayout({theta:0.9})` en línea 117 y delega `setGraph`/`reheat` a `KnowledgeGraphModel`.

### 7.2 KnowledgeGraphModel — el consumidor incremental

`KnowledgeGraphModel` (`knowledge-graph/src/KnowledgeGraphModel.ts:62`) posee el corte materializado (`entities`, `facts`, `factKeys`, `expansions`) y es el **único driver** de su `GraphLayout` prestado (doc en `KnowledgeGraphModel.ts:43`: un `setGraph` por `rebuildGraph`, un `reheat` por `expand`). En `expand(id)` (`KnowledgeGraphModel.ts:127`) pagina vía `KgDataSource.getNeighbors` con cancelación por `AbortSignal` (`KnowledgeGraphModel.ts:148` dedup de promesa compartida, `KnowledgeGraphModel.ts:150` `cancelExpand`), ingiere entidades/facts, avanza `loaded` por conteo de facts del _lote_ (no net-new, así vecindades solapadas no bloquean progreso — comentario en `KnowledgeGraphModel.ts:273`), llama a `rebuildGraph()` (`KnowledgeGraphModel.ts:332` captura posiciones, fusiona en `entityOrder` estable, siembra nodos nuevos desde `lastPositions`, escribe `GraphData` y llama a `layout?.setGraph`), recalienta (`KnowledgeGraphModel.ts:285`) y registra `ExpansionState` (`KnowledgeGraphModel.ts:7`). `dispose()` (`KnowledgeGraphModel.ts:225`) intencionadamente _no_ dispone el layout prestado — la sesión aún puede compartirlo.

### 7.3 WASM — el kernel de fuerzas invisible

`crates/vectojs-force-rs` (`crates/vectojs-force-rs/Cargo.toml:6` "backend invisible; la ruta TypeScript es el fallback permanente") refleja `BarnesHutOctree` en Rust: `Octree` (`lib.rs:47`), `jitter_for` (`lib.rs:83`), `build`/`insert`/`place_child`/`finalize_mass`/`force` (`lib.rs:194` / `lib.rs:401`), exports `force_init`/`force_pos`/`force_accel`/`force_step` (`lib.rs:457` / `lib.rs:484` / `lib.rs:491` / `lib.rs:503`) con `STATUS_OK/CAPACITY/UNINITIALIZED/OVERFLOW` (`lib.rs:31`). El alcance es _solo build + acumulación de fuerzas_ (comentario en `lib.rs:10` — esa fase es 78–90% de un tick 3D, split de fases en `VectoForceLayout.ts:240`) — los muelles de enlace, centrado e integración permanecen en el tick JS, así la costura es un `Float32Array.set` gather y un `Float64Array` read-back por tick.

El cargador (`packages/graph3d/src/wasm/force-backend.ts:42` `ForceBackend`) hace fetch streaming con fallback a `arrayBuffer` (`force-backend.ts:104` `instantiateStreaming`), crecimiento `ensure`/`force_init` (`force-backend.ts:52`), gather en `step` + `force_step` + refresco de vista obsoleta (`force-backend.ts:65` + `force-backend.ts:37` `viewsStale` — el octree puede hacer crecer la memoria lineal a mitad de step, desanclando vistas). El fallo en cualquier punto retorna `null` y el llamante mantiene el octree JS (`VectoForceLayout.ts:106` / `VectoForceLayout.ts:246` fallback a `this.tree.build` + `this.tree.force`; la URL del asset es `packages/graph3d/src/wasm/asset.ts:22` `forceWasmUrl` vía `new URL('./vectojs_force.wasm', import.meta.url)` — la única forma segura para el bundler). El `.wasm` está gitignoreado y se copia vía `tsup.config.ts:40` en publish, exactamente como `vectojs-core-rs`.

La paridad bit a bit es innegociable: el árbol Rust debe computar los mismos centros de masa `f64` e integrales de repulsión `f64` que el árbol JS (posiciones y velocidades permanecen `f32` en ambos lados). `VectoForceLayout.ts:58` lo explicita: "Un futuro kernel Rust/WASM … debe por tanto reproducir la acumulación `f64` exactamente." Los tests hacen differential-testing de ambas rutas bit a bit (ver `packages/graph3d/test/VectoForceLayout.wasm.test.ts:6` habilitación streaming/sync y las copias espaciadas en `VectoForceLayout.ts:618`).

El build es el mismo que la trampa del boss 08: `crates/vectojs-force-rs/build.sh` con `RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld"`; un `cargo build --target wasm32-unknown-unknown` pelado filtra flags del host en `~/.cargo/config.toml` y rompe el link.

## 8. Metodología de benchmark — qué es citable

El encabezado en `benchmarks/graph-layout/entry.ts:1` es la autoridad. Solo `benchmarks/run-browsers.sh` (un wrapper `bun runner/cli.ts` en `benchmarks/run-browsers.sh:4`) produce números citables — conduce un **navegador real con ventana visible en un workspace dedicado de Hyprland, ventana enfocada, GPU real** (según contrato de benchmark en `AGENTS.md` del workspace). `benchmarks/debug-page.ts` y `scripts/benchmark.ts` son headless (`--disable-gpu`) — un tripwire de regresión y una ayuda de depuración, no una cita.

### 8.1 Matriz, presupuesto y qué significa estabilizar

Los **defaults presupuestados** (CTX-0517, 2026-08-26 — `entry.ts:4`) son:

- `COUNTS = 100,1000,3000` (`entry.ts:48` — se eliminó 500 como vecino logarítmico de 1000; 3000 retenido como baseline `#559`)
- `TICKS = 30` muestras regulares por tick (`entry.ts:49`)
- `TRIALS = 3` (`entry.ts:50` — protocolo baseline `#559`; repetición a nivel de suite vía `run-browsers.sh --iterations`)
- `SETTLE_CAP = 120` (`entry.ts:51` — primeros 120 ticks post-append, no convergencia natural a ~285–300 ticks; `settleCappedTrials == TRIALS` por diseño, según sweep 2026-08-25)
- `APPEND_NODES = 50` (`entry.ts:57`), `WARMUP_TICKS = 5` (`entry.ts:58`), `POST_TOPOLOGY_ALPHA = 1` (`entry.ts:59`)

Los **defaults antiguos** (`counts 100,500,1000,3000 × 2 workloads × 4 brazos × 6 trials × cap 500`) proyectaban >1500 s/motor porque cada tick de asentamiento paga un `setTimeout(0)` con clamp de timer de ~4 ms (`entry.ts:301` `yieldToPaint`) y los asentamientos corrían hasta ~300 ticks — ahora ~150 s en Chrome headless por envelope (`entry.ts:25`).

**Workloads** son `star-hub` y `mixed-sparse` (`entry.ts:61`), con grafos construidos en `entry.ts:226` / `entry.ts:252` (posiciones sembradas en espiral `sqrt` para evitar apilamiento) y payloads de append que añaden 50 nodos + hub o enlaces preferenciales+aleatorios.

**Brazos** son cuatro (`entry.ts:599`):

| brazo             | dims | impl               | `appendMode`       | construcción                                                                                                                                                                                                                     |
| ----------------- | ---- | ------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d3-force-3d`     | 3    | `D3ForceLayout`    | `setGraph-rebuild` | `new D3ForceLayout()`                                                                                                                                                                                                            |
| `vecto-force`     | 3    | `VectoForceLayout` | `setGraph-rebuild` | `new VectoForceLayout()`                                                                                                                                                                                                         |
| `d3-force-2d`     | 2    | d3-force in-page   | `appendGraph`      | `D3Force2DLayout` en `entry.ts:78` (charge `300`, `distanceMax 450`, `theta 0.9`, collide `radius+14`)                                                                                                                           |
| `force-layout-2d` | 2    | `ForceLayout2D`    | `appendGraph`      | `new ForceLayout2D({repulsion: charge, collisionRadius: radius+14, linkDistance accesor, linkStrength 0.42, center 0.016, velocityDecay 0.64, alphaDecay 0.024, repulsionDistanceMax 450, theta 0.9, seed 7})` en `entry.ts:625` |

El orden de brazos se **rota determinísticamente** por `(workloadIndex, countIndex)` (`entry.ts:647` `rotatedArms`) para que el orden motor/agente no sesgue un conteo.

### 8.2 Qué se mide

Tres observables por brazo/workload/conteo, todos tras `performance.now()` y límites de tarea `setTimeout(0)` para que entradas long-task no se fusionen (`entry.ts:330` `captureLongTasks` vía `PerformanceObserver 'longtask'`):

- **`benchTicks`** (`entry.ts:501`) — `TICKS` llamadas regulares a `step()` desde un grafo reheated fresco: `median/p95/max` (`entry.ts:292` `summarize` vía `median`/`percentile` de `_shared/stats.ts`).
- **`benchAppend`** (`entry.ts:526`) — solo mutación de topología (payloads clonados pre-construidos en `entry.ts:346` `prepareAppendPayloads` para que el clonado nunca favorezca a `appendGraph`); luego `reheat(POST_TOPOLOGY_ALPHA)` explícito antes de cada primer tick post-append y cada bucle de asentamiento (`entry.ts:559`). Retorna `append` median/p95, `firstTick` median/p95, `settleTotal` median/p95 sobre hasta `SETTLE_CAP` ticks, `settleTicks` median/p95, `settleCappedTrials` y `maxStepMs` (máximo `step()` individual entre todas las fases, `entry.ts:679`).
- **`observeLiveAppendMemory`** (`entry.ts:398`) — un layout vivo dedicado y calentado retenido entre lecturas inmediatas antes/después, creación de payload y disposal _fuera_ del delta (`entry.ts:415` comentario). Prefiere `performance.measureUserAgentSpecificMemory` (`entry.ts:444`, acotado por `UA_MEMORY_TIMEOUT_MS = 1250` en `entry.ts:55` vía `entry.ts:353` `readUaMemoryWithTimeout`); un único fallo de timeout deshabilita lecturas UA posteriores para la ejecución (`entry.ts:454` `uaMemoryDisabledReason`); reintenta la observación completa con layout fresco en el fallback de heap (`performance.memory.usedJSHeapSize` en `entry.ts:465`). Ambos son **observaciones ruidosas, no evidencia de memoria retenida ni de selección de backend** (`entry.ts:740` salvedades). No soportado se reporta como `status: 'unsupported'` con razón.

También reportado: `longTaskMaxDurationMs` por captura long-task (`entry.ts:678`), contado solo cuando el intervalo `longtask` cubre un `[started,ended]` medido (`entry.ts:326` `include`).

### 8.3 Contrato del runner con ventana

Medido el 2026-08-02, el panel de 240 Hz es Hyprland `eDP-1 2560x1600` escala 1.6. Tres trampas de cadencia invalidan cualquier cifra silenciosamente: Chrome no enfocado cae a ~60 Hz, Firefox necesita `layout.frame_rate` y es 60 Hz por defecto incluso enfocado (Firefox manual es erróneo por 4×), y un `refreshHz` de exactamente 250 es un artefacto de mediana en un panel de 240 Hz. El harness (`benchmarks/_shared/server.ts`, `runner.ts`, `loaf.ts`) hace `validateEnvironment`, detección de inanición, agregación entre ejecuciones y porta commit + CPU/GPU/driver del host (una página no puede verlos). Cada benchmark posee solo `entry.ts` + `build.ts` de tres líneas (`benchmarks/graph-layout/build.ts:11` delegando a `_shared/build.ts`); el servidor/bundler viven en `_shared/` — no los dupliques.

**Nunca hardcodees un refresh rate** — llama a `calibrateRefreshRate()` y reporta `refreshHz` junto a cualquier cifra por frame. Cita ambos motores (V8 y SpiderMonkey divergen).

### 8.4 Snapshots de referencia

La **baseline completa N=7** a 500 nodos (`benchmarks/graph-layout/README.md:44`, ejecución `20260820T135641Z-1a6d54`, Chrome `240.04 Hz` / Firefox `240.64 Hz`) es la última matriz completa totalmente iterada bajo el presupuesto con ventana (las matrices completas de 1000 y 3000 nodos agotaron tiempo con los defaults de `entry.ts` — ver `README.md:11` y `README.md:28`). Las medianas de asentamiento representativas (500 nodos, `TICKS 30`, `TRIALS 1`, `SETTLE_CAP 500`, ambos workloads) están en ese README; los defaults presupuestados reducidos de arriba los sustituyen para coste por motor (~150 s). Mantén resultados bajo `benchmarks/graph-layout/results/` (gitignoreado) e identifica ejecuciones por el ID de historial del runner, no copiando líneas.

## 9. Migración desde d3-force, interacción y culling

**Migrar desde d3-force** (`d3-force`/`d3-force-3d`) a `ForceLayout2D`/`VectoForceLayout` no es un renombrado. La salvedad del bench en `benchmarks/graph-layout/entry.ts:745` es load-bearing: "Las filas 2D … comparan leyes de fuerza distintas: `ForceLayout2D` usa repulsión inverso-cuadrática y shares de colisión iguales free/free; `d3-force` usa repulsión inverso-distancia y shares de colisión ponderados por radio al cuadrado. Trata los ratios como comparaciones de workload a nivel de implementación, no como mediciones de kernel con ecuaciones equivalentes."

Deltas concretos a traducir:

- **Ley de repulsión:** `ForceLayout2D` es `−charge / d³ * (dx,dy)` (`BarnesHutQuadtree.ts:134` `factor = -charge*invD/d²`), es decir inverso-cuadrático en magnitud de fuerza; `forceManyBody` de d3 es inverso-distancia (`strength / d`). Los números absolutos no son comparables — re-ajusta `repulsion`/`chargeStrength` en lugar de copiarlos.
- **Semántica de corte:** `ForceLayout2D` testea el centro de carga del _agregado_ contra `repulsionDistanceMax` (`BarnesHutQuadtree.ts:98` `nearestDistanceSquared` + pre-test `maxDistanceSquared`), coincidiendo con el corte many-body de d3; con `theta: 0` el corte es exacto por punto (doc en `types.ts:59`). `Infinity`/no-finito lo desactiva — `0` lo desactiva _silenciosamente_ vía early-return, así `finiteOr` en `ForceLayout2D.ts:91` mapea cualquier no-positivo a `Infinity`.
- **Identidad de enlace:** `ForceLayout2D` deduplica en `(source,target,id)` dirigido vía `linkIdentity` (`ForceLayout2D.ts:826`) y lanza en enlaces colgantes/propios antes de mutar; d3 mantiene ids string crudos en los objetos de enlace y la guarda `duplicate-link` del editor es aún más estricta (nota de divergencia en `ForceLayout2D.ts:387`). Al migrar un grafo persistido, normaliza primero los campos `id`.
- **Direccionamiento de pins:** cubierto en §6 — `ForceLayout2D` por `NodeId`, `GraphLayout` de graph3d por índice. Los handlers drag-to-pin que capturan un índice deben re-resolver tras `removeNodes` en el lado 2D.
- **Theta:** rango y efecto idénticos — `0` = exacto `O(N²)`, mayor = más rápido/menos preciso (`types.ts:57`, `VectoForceLayout.ts:28`). El default `0.9` está afinado para sentirse similar entre stacks pero no es bit-idéntico entre quadtree y octree.

**Interacción y visibilidad** están fuera del tick de física pero son costosas a escala. `packages/graph3d/src/GraphInteraction.ts:1` (`GraphInteraction`) mapea hits del raycaster de Three.js a `nodeIndex` para hover/select/drag-to-pin, y hace el debounce habitual de hover; `Graph3D.ts:1` (`Graph3D`) renderiza el grafo con instancing y hace culling off-screen. Ninguno reemplaza el layout — consumen `positions` tras `step()`. Con 3000 nodos el renderer, no el layout, suele ser el cuello de botella por frame (`benchmarks/graph3d-frame/entry.ts:1` harness de coste por frame vs `benchmarks/graph-layout/entry.ts:1` matriz de física — mantén los dos harnesses distintos). Para hosts `Scene` de canvas (no Three.js), el culling en `packages/core/src/tree/Scene.ts:1` hace el mismo trabajo; graph-layout en sí nunca hace culling.

## 10. Ajuste y trampas

Los pins difieren por stack (`ForceLayout2D` por ID, graph3d por índice — `ForceLayout2D.ts:387`); traduce al portar. `repulsionDistanceMax = 0` desactiva la repulsión por completo (`BarnesHutQuadtree.ts:77` early-return) — no-finito es el "sin corte" intencionado (`ForceLayout2D.ts:91`). `alphaDecay = 0` cae a `0.0228` o el bucle de asentamiento nunca termina (`ForceLayout2D.ts:95`). Un `RUSTFLAGS` no-finito o filtrado desde el host rompe el build WASM o su paridad bit a bit (`fma` en una CPU afinada, `crates/vectojs-force-rs/build.sh:8`); usa `just wasm`. El bug de dimensionado por span de niveles (`BarnesHutQuadtree.ts:237`) — dimensionar tablas de offset por conteo de puntos en lugar de por span de nivel — deja caer silenciosamente incrementos de counting-sort cuando los radios abarcan ~280 niveles de `f32`. El desanclaje de vista tras crecimiento `force_init` (`force-backend.ts:37` `viewsStale`) debe re-validar vistas de typed-array tras cada `force_step`.

Minas adicionales encontradas durante esta investigación:

- **Repulsión negativa en 2D está clampada, no soportada.** `ForceLayout2D` clamp `repulsion` a `>=0` en `ForceLayout2D.ts:629`/`ForceLayout2D.ts:761` y `BarnesHutQuadtree.ts:109` omite subárboles `charge<=0` — la guarda `finalize` en `BarnesHutQuadtree.ts:507` de lo contrario colocaría mal el centro de carga para nodos atractivos. La carga negativa (atractiva) de D3 no tiene equivalente aquí; revisa ambas guardas antes de permitirla.
- **Enlace `id` vs direccionamiento por endpoints.** `removeLinks` construye perezosamente un mapa `linksByIdKey` solo cuando aparece un `LinkId` suelto (`ForceLayout2D.ts:270`), reemplazando el previo escaneo `O(items×L)` por item. Pasar un objeto `GraphLink` completo con un `id` distinto al almacenado no coincidirá — la identidad es la tripleta serializada, no la identidad del objeto.
- **Aliasing de vista `positions`.** `refreshPositionView` retorna un `subarray` sobre el _mismo_ `ArrayBuffer` (`ForceLayout2D.ts:749`). Mantener una referencia a través de `ensureNodeCapacity` o `removeNodes` (que hacen `resize` del buffer en `ForceLayout2D.ts:857`) deja una vista desanclada de longitud 0. Vuelve a leer `layout.positions` tras cada mutación.
- **Aún no hay `forge/baselines/graph-layout*`.** `benchmarks/graph-layout/results/` está gitignoreado y no hay `forge/baselines/graph-layout.json` checkeado — cada afirmación en §8 debe re-medirse en el host que cita. El hallazgo N=7 de 500 nodos en `benchmarks/graph-layout/README.md:44` es un snapshot específico del host, no un baseline portable.
- **`crates/vectojs-force-rs` tiene exactamente un artefacto de build.** `build.sh` emite `packages/graph3d/src/wasm/vectojs_force.wasm` y `tsup` lo copia a `dist/wasm/` (`packages/graph3d/tsup.config.ts:40`). Nunca hay un segundo crate ni un paquete WASM compartido — hasta que aparezca un tercer consumidor (`DEC-0081` en `force-backend.ts:12`), mantenlo local.
- **Disciplina de oráculo diferencial.** La ruta 3D `VectoForceLayout` con octree JS es el _oráculo permanente_; el kernel Rust en `crates/vectojs-force-rs/src/lib.rs:1` debe permanecer bit-idéntico en acumulación `f64` (posiciones `f32` en ambos lados). Haz grep de `jitter_for`/`jitterFor`/`mulberry32` en `VectoForceLayout.ts:606`, `BarnesHutQuadtree.ts:610`, `lib.rs:83` — cualquier cambio en uno que no aterrice en el otro es un fallo de diff. El opt-in `measurePhases` (`VectoForceLayout.ts:45`) mantiene el oráculo medible sin pagar `performance.now()` en prod.

Al añadir una nueva fuerza, escribe primero el oráculo JS (estructura `tick` en `VectoForceLayout.ts:232`), mantén orden de ops y semántica NaN de `Math.min/Math.max` (ver comentario de orden total en `BarnesHutQuadtree.ts:632` `distanceToCellSquared`), y condiciona la ruta WASM tras `measurePhases` (`VectoForceLayout.ts:45` opt-in `tickPhases: [octree, force, link, integrate]` wall-ms) para que el hot path no pague nada cuando el profiling está desactivado.

## 11. Tests, oráculos diferenciales y cómo se ha roto realmente

Tres suites de tests cubren el lado 2D (`packages/graph-layout/test/BarnesHutQuadtree.test.ts:1` quadtree aprox vs exacto, `packages/graph-layout/test/ForceLayout2D.test.ts:1` `setGraph`/`appendGraph`/`removeNodes`/`removeLinks`/`updateLinks`/pins/alpha, `packages/graph-layout/test/ForceLayout2D.linkMutations.test.ts:1` dedup/sesgo de grado/shares de enlace). El lado 3D añade `packages/graph3d/test/VectoForceLayout.wasm.test.ts:1` (paridad bit JS vs WASM: streaming, sync, fallback en URL mala en `VectoForceLayout.wasm.test.ts:123` `file:///nonexistent` → `false`).

Qué protegen y qué ha mordido antes — léelo como checklist de revisión:

- **Sanitizar antes de construir.** Una posición `NaN` dejada en `positionStorage` envenena los límites del quadtree (`minX = NaN` → `size = NaN`). `sanitizeState` en `ForceLayout2D.ts:752` `toF32`+sobrescritura de pin existe porque esto ocurrió una vez con un `x: NaN` de un JSON destructurado suministrado por el llamante. Nunca elimines ese bucle.
- **Suelo de distancia cero.** Sin el suelo `1e-6` en `BarnesHutQuadtree.ts:132`/`BarnesHutQuadtree.ts:154` y `VectoForceLayout.ts:727`, dos puntos coincidentes en la misma celda producen `factor = -m/0 = ±Infinity` → velocidades `NaN` que infectan cada tick posterior. El ángulo determinista en `BarnesHutQuadtree.ts:610`/`ForceLayout2D.ts:878` hace el empuje repetible.
- **Fuga de share pineado.** Olvidar el fallback `springShare` cuando un endpoint está pineado (fijo `0` o `1` en `ForceLayout2D.ts:846` / `BarnesHutQuadtree.ts:406`) deja que un nodo pineado sea arrastrado por la velocidad del otro endpoint. Historial: los primeros pins 3D temblaban porque los muelles de enlace aún integraban la coordenada pineada.
- **Alpha nunca alcanza min.** Pasar `alphaDecay: 0` mantuvo `alpha` en `1` para siempre — el bucle del host `while(layout.step())` nunca terminó. La guarda en `ForceLayout2D.ts:95` / `VectoForceLayout.ts:117` mapeando `0` → `0.0228` existe desde un incidente real donde una opción computada produjo `0`.
- **Observación de memoria malinterpretada.** Los números `liveAppendMemoryObservation` en `entry.ts:398` son observaciones de _agente completo_ con ruido de GC (salvedad en `entry.ts:449`); tratarlos como heap retenido por backend es la cita errónea más común de los benchmarks de grafos. La ejecución también deshabilita lecturas UA-específicas tras un timeout (`entry.ts:454`) y reintenta en `usedJSHeapSize` — comparar una ejecución que cambió de fuente a mitad de matriz contra una que no lo hizo no es válido.

Resumen de complejidad para revisores:

| fase               | 2D                                                                           | 3D                                    | dónde                                                 |
| ------------------ | ---------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| construcción árbol | O(N log N) quadtree                                                          | O(N log N) octree                     | `BarnesHutQuadtree.ts:36` / `VectoForceLayout.ts:414` |
| repulsión          | O(N log N) promedio, O(N²) peor con `theta=0`                                | igual                                 | `ForceLayout2D.ts:484` / `VectoForceLayout.ts:259`    |
| enlaces            | O(L)                                                                         | O(L)                                  | `ForceLayout2D.ts:499` / `VectoForceLayout.ts:274`    |
| colisión           | O(N) promedio vía rejilla por niveles; O(N²) sin niveles con radios sesgados | —                                     | `BarnesHutQuadtree.ts:172`                            |
| memoria por layout | ~6×N f32 + enlaces + árbol ~4N nodos                                         | ~7×N f32 + enlaces + octree ~8N nodos | `ForceLayout2D.ts:672` / `VectoForceLayout.ts:445`    |

## 12. Reproducibilidad — comandos que puedes citar

```bash
# Construir el kernel de fuerzas WASM (requerido antes de cualquier ruta WASM):
just wasm                         # o crates/vectojs-force-rs/build.sh
# Opcional: verificar solo el oráculo JS (sin Rust necesario):
just test-pkg graph-layout && just test-pkg graph3d

# Matriz de física con ventana visible — la ruta citable (necesita Hyprland + Chrome/Firefox con ventana):
./benchmarks/run-browsers.sh graph-layout 8272 --viewport 1280x720 \
  --param counts=100,1000,3000 --param ticks=30 --param trials=3 \
  --param settleCap=120 chrome firefox
# Variante de convergencia completa (reproduce el antiguo settle de 500 ticks, presupuestado explícitamente):
./benchmarks/run-browsers.sh graph-layout 8273 --viewport 1280x720 \
  --param counts=100,500,1000,3000 --param ticks=30 --param trials=6 \
  --param settleCap=500 chrome firefox   # espera >1500 s — presupuesta en consecuencia

# Coste por frame 3D (renderer, no física — no conflar):
./benchmarks/run-browsers.sh graph3d-frame 8274 --viewport 1280x720 chrome firefox
```

Reporta `refreshHz` de `calibrateRefreshRate()`, ambos motores, commit SHA y CPU/GPU/driver del host (la página no puede verlos — el harness en `benchmarks/_shared/server.ts:1` los captura). Mantén JSON crudo bajo `benchmarks/graph-layout/results/` (gitignoreado) y cita su ID de historial, no medianas pegadas.

## Apéndice — dónde leer a continuación

| objetivo                                | empieza                                                                                  | luego                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| ajustar un layout 2D a un nuevo dataset | `packages/graph-layout/src/types.ts:42` + `ForceLayout2D.ts:79` defaults del constructor | `ForceLayout2D.ts:480` fases del tick → `BarnesHutQuadtree.ts:8` índices                              |
| añadir una nueva fuerza (p. ej. radial) | `VectoForceLayout.ts:232` estructura `tick` como plantilla                               | `crates/vectojs-force-rs/src/lib.rs:10` nota de alcance — solo fuerzas de octree pertenecen al kernel |
| paginar un grafo de conocimiento        | `knowledge-graph/src/KnowledgeGraphModel.ts:62` ciclo de vida                            | `FixedZLayout.ts:10` si necesitas una proyección 2D de un layout 3D                                   |
| citar un número                         | `benchmarks/graph-layout/entry.ts:1` encabezado + `benchmarks/graph-layout/README.md:44` | `benchmarks/_shared/stats.ts:1` para semántica `median`/`percentile`                                  |

---

_Siguiente: **Boss 12 — DevTools** (el inspector de runtime que te permite apuntar a un píxel y leer qué entidad lo posee, y por qué). Anterior: **Boss 10 — Video Export** (captura determinista de paso fijo). Serie: 00 Overview → 01 Selection → … → 11 Layout de Grafos (este doc) → 12 DevTools → 99 Synthesis._
