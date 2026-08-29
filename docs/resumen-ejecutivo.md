# Resumen Ejecutivo — 4to7 Mania

> Herramienta de escritorio para convertir beatmaps de **osu!mania 4K a 7K** con un editor visual de mapeo de carriles, audio sincronizado y vista previa en canvas.

---

## 1. Visión general

**4to7 Mania** es un proyecto personal que resuelve un problema concreto: el conversor automático por defecto de osu! produce, al subir un mapa de 4K a 7K, patrones incómodos y asignaciones poco naturales. La propuesta de este proyecto es dar **control total** sobre cómo se redistribuyen las notas, en tiempo real, antes de exportar el `.osu` final.

| Dato | Valor |
| :--- | :--- |
| Nombre | 4to7 Mania |
| Versión | `0.3.0` (Monorepo) |
| Plataforma | Escritorio (Windows, prioridad) + CLI |
| Licencia | MIT |
| Estado | Prototipo funcional con deuda técnica explícita |

---

## 2. El problema

- Los conversores automáticos de osu! asignan notas a los carriles de forma genérica y generan mapas en "decadencia": patrones incómodos, asignaciones poco ergonómicas y sin posibilidad de ajuste fino.
- Los mapas 4K son abundantes; los de 7K (manía estándar) requieren conversión y re-mapeo cuidadoso.
- No hay, en general, una herramienta que combine **conversión + vista previa interactiva + audio sincronizado** en un solo flujo.

---

## 3. Solución

4to7 Mania ataca el problema desde dos frentes:

1. **Conversión controlada**: un motor de conversión que mapea cada columna fuente (4K) a **una o varias** columnas destino (7K), con validación de colisiones.
2. **Vista previa en tiempo real**: una interfaz React con canvas de alta frecuencia que permite escuchar, ver y ajustar el resultado **antes** de exportar.

---

## 4. Stack tecnológico

| Capa | Tecnología |
| :--- | :--- |
| **Motor de conversión** | TypeScript puro (sin dependencias de runtime) |
| **Interfaz de escritorio** | React 19 + Vite + **Tauri v2** |
| **Backend nativo** | Rust (Tauri), `rayon` para escaneo paralelo |
| **Escáner de proceso** | Windows (`Toolhelp32` + helper .NET 9 `osu-detector.exe`) |
| **Pruebas** | Vitest (82 tests) |
| **Lint / formato** | ESLint 10 + Prettier |

Monorepo con dos zonas bien separadas:
- **`src/`**: núcleo de conversión y CLI, **puro TypeScript**, sin UI (ideal para testear).
- **`app/`**: cliente de escritorio (Tauri + React + Rust), toda la capa visual.

---

## 5. Arquitectura

### Núcleo de conversión (`src/core/`)

- **`convert/engine.ts`** — `convertBeatmap(beatmap, options)`: algoritmo principal. Valida el lane map y proyecta cada hit object a través de `projectHitObject`, reordenando por tiempo → columna → tipo.
- **`convert/lane-map.ts`** — modelo de datos `LaneMap`:
  ```
  sourceColumnToTargetColumns: (number[])[]
  ```
  El índice `i` es la columna fuente; su valor es la lista de columnas destino (el orden interno se conserva). Validado con `createLaneMap` / `assertValidLaneMap` (códigos de error estables 2001–2004).
- **`convert/section-lane-map.ts`** — mapeo por **secciones temporales** (`LaneMapSection { id, name, startMs, endMs, laneMap }`): permite cambiar la asignación de carriles a lo largo de la canción.
- **`convert/validate.ts`** — `validateConvertedBeatmap`: detecta colisiones *post-conversión* (`DuplicateNote` 3001, `HoldOverlap` 3002, `ColumnOutOfRange` 3003).
- **`osu/`** — parser y serializador `.osu`:
  - `parseOsuFile`: lee `[General]`, `[Difficulty]`, `[Metadata]`, `[TimingPoints]`, `[HitObjects]`, `[Events]`. Valida `Mode: 3`, extrae `keyCount` desde `CircleSize`, calcula la columna desde la coordenada `x`, preserva la máscara `effects` (bit 0 = Kiai).
  - `serializeOsuFile`: escritura canónica y minimalista, recalculando `x` desde el centro de columna.

### CLI (`src/cli/`)

- Entrada: `npm run convert "mapa.osu" --output "salida.osu" --lane-map '[[0,1],[2,3],[4],[5,6]]'`.
- Flags: `--output/-o`, `--lane-map/-m` (JSON), `--keys/-k` (por defecto 7), `--help/-h`.
- Exito o error de severidad se traduce en código de salida 0/1.

### Aplicación de escritorio (`app/`)

- **Backend Rust (`app/src-tauri/src/lib.rs`)** — comandos expuestos:
  - `load_beatmap`, `save_beatmap`, `detect_osu_map`
  - `list_beatmap_difficulties`, `search_beatmaps`, `get_library_stats`
  - `invalidate_search_index`, `rescan_songs_library`, `list_osu_skins`, `load_osu_skin_config`
- **Motor de búsqueda en memoria**: índice `SEARCH_INDEX` (Mutex + `rayon`) que reduce la búsqueda de canciones de 3–4 s a **<5 ms** (warm-up en background).
- **Frontend React**: componentes en `components/` (home, editor, playback, playfield, modals, overlays), lógica en `lib/` y renderizado de canvas en `preview/` (`renderer`, `play-engine`, `beat-grid`, `preview-math`, `skin-manager`).
- **`App.tsx`** orquesta la conversión: `convertBeatmap(...toLaneMap(laneMapState), zeroLn, sections)` + `validateConvertedBeatmap`.

---

## 6. Capacidades implementadas (reales)

| Capacidad | Estado | Notas |
| :--- | :--- | :--- |
| Conversión 4K→7K con lane map configurable | ✅ Implementada | Proyección 1:N de columnas |
| Secciones de carril por tiempo | ✅ Implementada | `section-lane-map.ts` |
| Detección de colisiones | ✅ Implementada | Validación lane map + post-conversión |
| Filtro **0 LN** (Long Notes → Rice) | ✅ Implementada | `zeroLn` en el motor |
| Vista previa de canvas (Split 4K/7K) | ✅ Implementada | Renderer a 60/144/240+ FPS |
| Audio sincronizado + hitsounds | ✅ Implementada | Navegación por rueda |
| Presets de entrenamiento (`trills`, `mirror`, `staircase`, `Brackets`, `Blender`) | ✅ Implementada | `lane-presets.ts` |
| Detección de canción activa en osu! (RAM) | ✅ Implementada | Windows, `osu_memory.rs` |
| Búsqueda instantánea de beatmaps | ✅ Implementada | Índice en memoria (v0.3.0) |
| Pista visual de Kiai en el timeline | ✅ Implementada | Solo *visualización*, no boost |

### Pendientes / placeholders

| Capacidad | Estado real |
| :--- | :--- |
| **Anti-Jack** | ⚠️ **Solo UI** (`is-disabled`, "Próximamente") en `BeatmapHeaderCard.tsx`. **Sin lógica en el motor.** |
| **Kiai Boost** | ⚠️ **Solo UI** (`is-disabled`, "Próximamente"). El Kiai se usa solo para *visualización/ritmo*, no para aumentar densidad. |

> **Nota de integridad**: el README presenta Anti-Jack y Kiai Boost como características principales, pero en el código actual son **stubs de interfaz** deshabilitados. Solo `0 LN` está realmente implementado como filtro de conversión.

---

## 7. Salud del código y pruebas

- **Tests**: 9 archivos, **82 tests** con Vitest.
- **Resultado actual**: **80/82 pasan (97.6%)**.
  - `src/` (núcleo: parser, conversión, filtros, validación, CLI) está **completamente verde**.
  - **1 archivo en rojo**: `app/src/lib/lane-presets.test.ts` (2 tests fallando):
    - Corrupt-JSON: se espera `[]` pero `loadPresets` devuelve los *defaults*.
    - Round-trip: se espera solo presets de usuario, pero se mezclan los *defaults*.
    - Causa probable: **desvío de comportamiento** (la implementación devuelve defaults de respaldo; el test fue escrito antes o quedó desactualizado).
- **Deuda documental**: el formato de `--map` del README (`"0:0,1:1,2:5,3:6"`) **no coincide** con el código real (`--lane-map` + JSON `sourceColumnToTargetColumns`).

---

## 8. Fortalezas

- **Separación limpia** entre el motor de conversión (TypeScript puro, testeable) y la UI (Tauri/React). El núcleo no depende de la interfaz.
- **Modelo de lane map flexible y validado**: proyección 1:N + mapeo por secciones temporales + detección de colisiones = control granular real.
- **Rendimiento notable** en la capa de búsqueda e índice (de 3–4 s a <5 ms).
- **Excelente enfoque de UX** para un prototipo: canvas fluido, audio sincronizado, navegación por rueda, presets, persistencia de estado.
- **Código documentado en español** y coherente (comentarios explicando el *porqué*, no solo el *qué*).

## 9. Debilidades / riesgos

- **Funcionalidad prometida vs. real**: 2 de 3 filtros "smart" son solo UI. El marketing interno (README) adelanta features que no existen.
- **Escáner de osu! atado a Windows** — no portable a Linux/macOS sin reescritura.
- **2 tests en rojo** en la capa de presets — reflejan un contrato de comportamiento no resuelto.
- **Cobertura desbalanceada**: fuerte en el núcleo, más débil en la capa de UI/rendering (puede ser intencional).

## 10. Próximos pasos sugeridos

1. **Resolución del contrato de presets**: decidir si `loadPresets` debe devolver solo presets de usuario o fusionar los *defaults*, y alinear tests + implementación.
2. **Implementar Anti-Jack y Kiai Boost en el motor** (o eliminar los stubs de la UI si no se priorizan) para que el README deje de adelantar features inexistentes.
3. **Sincronizar el README** con el formato real de la CLI (`--lane-map` + JSON).
4. **Cobertura de conversión por secciones temporales** en tests, si el mapeo por tramos gana complejidad.
5. Evaluar **portabilidad del escáner** si el proyecto aspira a salir de Windows.

---

## TL;DR

**4to7 Mania** es un proyecto personal sólido con una **arquitectura bien separada**: un motor de conversión TypeScript puro (validado y testeado) y una app de escritorio Tauri/React con una vista previa de canvas de alta calidad. Resuelve un problema real (conversión 4K→7K controlada) y ya rinde **80/82 tests (97.6%)** en el núcleo. Su principal deuda es de **coherencia**: el README promete Anti-Jack y Kiai Boost que hoy solo son placeholders de UI, y hay 2 tests de presets sin resolver. Con esos ajustes, es una base muy prometedora.
