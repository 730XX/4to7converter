# Registro de Cambios (Changelog)

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [0.3.0] - 2026-08-18

### Añadido
- **Búsqueda Instantánea de Beatmaps en RAM (`SEARCH_INDEX`)**:
  - Arquitectura de caché en memoria persistente en Rust (`static Mutex<Option<Vec<IndexedMapset>>>`).
  - Pre-construcción en segundo plano (*Background Warm-up*) al inicio de la aplicación para disponibilidad inmediata sin bloquear la interfaz.
  - Extractor ultra-rápido de modos de juego (`parse_osu_mode_only`) que procesa solo las cabeceras esenciales.
  - Comando `invalidate_search_index` para refrescar la biblioteca de canciones bajo demanda.
  - Modal flotante de búsqueda rápida estilo Spotlight (<kbd>Ctrl</kbd> + <kbd>P</kbd>) con navegación por teclado (<kbd>↑</kbd>, <kbd>↓</kbd>, <kbd>Enter</kbd>, <kbd>Esc</kbd>) y debounce de 30ms.
- **Pista Visual de Kiai Time en el Timeline**:
  - Detección y parsing determinista de intervalos Kiai a través de la máscara de bits en `[TimingPoints]` (`effects & 1`).
  - Franja superior en el canvas con color `#905921` semitransparente que delimita visualmente las secciones Kiai activas.
  - Acento lumínico dinámico en la aguja de reproducción al transitar por zonas de Kiai.
- **Persistencia de Configuración y Estado**:
  - Guardado automático del preset y mapeo de carriles activo en `localStorage` (`saveActiveLaneMapState` / `loadActiveLaneMapState`).
  - Preservación inteligente de la posición temporal de reproducción al cambiar de dificultad dentro de la misma canción.

### Optimizado / Rendimiento
- **Reducción de Latencia de Búsqueda a Milisegundos**:
  - Reducción del tiempo de respuesta en búsquedas de canciones de **3–4 segundos** a **<5ms** al eliminar el I/O continuo de disco por pulsación de tecla.
- **Balance Acústico en Acordes de Hitsounds**:
  - Escalamiento gradual y no lineal de volumen para notas simultáneas (`chordMultiplier`), evitando saturación auditiva (clipping) al impactar múltiples carriles concurrentes.

### Experiencia de Usuario (UI/UX)
- **Animaciones de Salida Fluidas (`is-closing`)**:
  - Transiciones reversas aceleradas para los avisos HUD tipo cápsula (OSD) y para el modal de búsqueda rápida.
- **Paleta de Densidad del Timeline**:
  - Actualización cromática de la gráfica de densidad: `#f7ec00` (amarillo cálido) para intensidad media y `#faaad4` (rosa pastel) para picos de alta densidad.
- **Ajustes de Enfoque y Teclado**:
  - Auto-desenfoque (`blur`) en elementos interactivos (sliders, selectores) para evitar pérdida involuntaria de foco al pausar/reanudar con la barra espaciadora.
  - Eliminación de resaltados azules invasivos en el hover del timeline.

---

## [0.2.0] - 2026-08-18

### Añadido
- **Selector Dinámico de Dificultades**:
  - Detección automática en Rust/Tauri de todos los archivos `.osu` dentro de la carpeta de la canción.
  - Dropdown interactivo integrado en el badge de dificultad de la cabecera para alternar entre dificultades al instante sin reabrir archivos.
- **Filtros Rápidos de Conversión (Smart Engine Tweaks)**:
  - `Anti-Jack`: Dispersión de notas consecutivas en la misma columna a intervalos de tiempo excesivamente cortos.
  - `0 LN`: Conversión masiva de Long Notes (Hold Notes) a notas simples (Rice) para entrenamiento de velocidad.
  - `Kiai Boost`: Aumento selectivo de densidad de notas durante secciones de clímax y coro.
- **Cabecera Rediseñada (BeatmapHeaderCard)**:
  - Banner visual con artwork de fondo del beatmap, desenfoque suave y gradientes de contraste.
  - Metadatos integrados (Título, Artista, Dificultad, Key Count, estado del Audio y botón "Nuevo").
- **Navegación Temporal por Rueda de Ratón**:
  - Desplazamiento en la línea de tiempo mediante la rueda del ratón (Rueda arriba: retroceder, Rueda abajo: adelantar).
  - Aceleración con tecla `Shift` para saltos de 1 segundo.
- **Gestor de Presets Integrado**:
  - Presets predeterminados para entrenamiento de skillsets específicos (`trills`, `mirror`, `staircase`, `Brackets`, `Blender`).
  - Guardado y eliminación de presets personalizados en almacenamiento local (`localStorage`).
  - Modal accesible con atajos <kbd>Enter</kbd> y <kbd>Esc</kbd> (`SavePresetModal`).
- **Consola de Diagnóstico Oculta**:
  - Consola de debug in-app con logs de memoria y escaneo, accesible mediante el atajo <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd>.

### Optimizado
- **Sincronización de Audio y Prevención de Desfases**:
  - Coalescencia de eventos de seek en `requestAnimationFrame` utilizando `fastSeek` para evitar sobrecargar el decodificador de audio nativo durante el scroll rápido.
  - Bloqueo de lecturas de tiempo obsoletas mientras `isSeeking` está activo.
  - Reseteo inmediato del cursor de hitsounds en cada operación de seek para evitar notas fantasma o saltos sonoros.

### Corregido
- Corregido solapamiento visual en la cabecera en resoluciones de pantalla compactas fijando alturas mínimas y límites de flexbox.
- Corregida alineación horizontal centrada en los contadores y métricas de la barra de estadísticas (`StatsBar`).
- Ocultado automático del panel de incidencias (`IssuesPanel`) cuando el mapa no presenta errores ni advertencias.

---

## [0.1.0] - 2026-08-16

### Añadido
- Versión inicial del conversor de osu!mania 4K a 7K.
- Motor de conversión básico en TypeScript con parser y serializador `.osu`.
- Mapeador matricial de carriles 4K a 7K interactivo.
- Playfield básico en HTML5 Canvas con soporte para modo Split (4K / 7K).
- Escáner de memoria en Windows para detección de canciones activas en el proceso de osu!.
- CLI para conversión directa desde la terminal.
