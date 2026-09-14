import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { HitObject, OsuBeatmap } from "../../../../src/core/osu/types";
import { compareHitObjects } from "../../../../src/core/convert/engine";
import type { PlaybackControls } from "../../lib/use-playback";
import {
  buildPlayfieldPalette,
  drawPlayfieldFrame,
  PLAYFIELD_HIT_LINE_OFFSET,
  PLAYFIELD_TOP_PADDING,
  type PlayfieldPalette,
} from "../../preview/renderer";
import { PlayEngine } from "../../preview/play-engine";
import { DEFAULT_KEYBINDS_7K } from "../../lib/settings";
import type { LoadedSkinTextures } from "../../preview/skin-manager";
import { buildSpeedTimeline, type SpeedTimeline } from "../../preview/speed-timeline";
import { getTimingSections, snapTimeToBeat } from "../../preview/beat-grid";
import { columnFromX, getHoldEndY, getNoteY, timeAtY } from "../../preview/preview-math";

/** Zona agarrable de una nota durante el arrastre en el editor. */
type DragNoteKind = "hit" | "ln-head" | "ln-tail" | "ln-body";

/** Resultado del hit-test sobre las notas del playfield. */
interface NoteGrab {
  noteIndex: number;
  kind: DragNoteKind;
  note: HitObject;
}

/** Estado vivo de un arrastre en curso. */
interface DragState {
  pointerId: number;
  noteIndex: number;
  kind: DragNoteKind;
  column: number;
  timeMs: number;
  endTimeMs: number | null;
  originalNote: HitObject;
}

/** Geometría del playfield recalculada bajo demanda para el editor. */
interface EditorGeometry {
  width: number;
  height: number;
  hitLineY: number;
  approachMs: number;
  speedPxPerMs: number;
  currentTimeMs: number;
  scrollDirection: "down" | "up";
}

interface PlayfieldProps {
  beatmap?: OsuBeatmap | null;
  sourceBeatmap?: OsuBeatmap | null;
  targetBeatmap?: OsuBeatmap | null;
  playback: PlaybackControls;
  scrollSpeed?: number;
  playfieldWidth?: "compact" | "normal" | "wide";
  scrollDirection?: "down" | "up";
  previewMode?: "7k" | "4k" | "split";
  hitGlow?: boolean;
  volume?: number;
  hitsoundVolume?: number;
  isPlayMode?: boolean;
  keybinds?: string[];
  playOffsetMs?: number;
  comboPositionPercent?: number;
  playShowLaneSeparators?: boolean;
  noteHeight?: number;
  playShowHitError?: boolean;
  playStageWidth?: number;
  hitPositionOffset?: number;
  receptorOffset?: number;
  customSkinTextures?: LoadedSkinTextures | null;
  beatDivisor?: number;
  onExitPlayMode?: () => void;
  /** Editor: aplica un beatmap derivado con ediciones manuales de notas. */
  onEditNotes?: (nextBeatmap: OsuBeatmap) => void;
}

/**
 * Vista previa animada del playfield con metrónomo de BPM de respuesta elástica,
 * atenuación suave previa al Kiai (2.5s), destello de impacto y Modo Play interactivo por encima de todo.
 */
export function Playfield({
  beatmap,
  sourceBeatmap,
  targetBeatmap,
  playback,
  scrollSpeed = 25,
  playfieldWidth = "normal",
  scrollDirection = "down",
  previewMode = "7k",
  hitGlow = true,
  volume = 80,
  hitsoundVolume = 20,
  isPlayMode = false,
  keybinds = DEFAULT_KEYBINDS_7K,
  playOffsetMs = 0,
  comboPositionPercent = 55,
  playShowLaneSeparators = true,
  noteHeight = 16,
  playShowHitError = true,
  playStageWidth = 500,
  hitPositionOffset = 40,
  receptorOffset = 0,
  customSkinTextures = null,
  beatDivisor = 1,
  onExitPlayMode,
  onEditNotes,
}: PlayfieldProps) {
  const debugHitWindows = false;
  const [isAutoplay, setIsAutoplay] = useState(false);
  const isSplit = previewMode === "split" && sourceBeatmap && targetBeatmap;
  const activeBeatmap = beatmap ?? (previewMode === "4k" ? sourceBeatmap : targetBeatmap);

  useEffect(() => {
    if (!isPlayMode) {
      setIsAutoplay(false);
    }
  }, [isPlayMode]);

  if (isSplit) {
    return (
      <>
        <section className="preview-card preview-card--split">
          <div className="preview-split-container">
            <div className="preview-split-track preview-split-track--4k">
              <SinglePlayfieldCanvas
                beatmap={sourceBeatmap}
                playback={playback}
                scrollSpeed={scrollSpeed}
                scrollDirection={scrollDirection}
                beatDivisor={beatDivisor}
                hitGlow={hitGlow}
                volume={volume}
                hitsoundVolume={hitsoundVolume}
                isPlayMode={false}
                receptorOffset={receptorOffset}
                customSkinTextures={customSkinTextures}
              />
            </div>
            <div className="preview-split-divider" aria-hidden="true" />
            <div className="preview-split-track preview-split-track--7k">
              <SinglePlayfieldCanvas
                beatmap={targetBeatmap}
                playback={playback}
                scrollSpeed={scrollSpeed}
                scrollDirection={scrollDirection}
                beatDivisor={beatDivisor}
                hitGlow={hitGlow}
                volume={volume}
                hitsoundVolume={hitsoundVolume}
                isPlayMode={false}
                receptorOffset={receptorOffset}
                customSkinTextures={customSkinTextures}
                onEditNotes={onEditNotes}
              />
            </div>
          </div>
        </section>

        {isPlayMode && (
          <div className="play-stage-overlay">
            <div className="play-stage-container" style={{ maxWidth: `${playStageWidth}px` }}>
              <div className="play-stage-track">
                <SinglePlayfieldCanvas
                  beatmap={targetBeatmap}
                  playback={playback}
                  scrollSpeed={scrollSpeed}
                  scrollDirection={scrollDirection}
                  beatDivisor={beatDivisor}
                  hitGlow={hitGlow}
                  volume={volume}
                  hitsoundVolume={hitsoundVolume}
                  isPlayMode={true}
                  isAutoplay={isAutoplay}
                  onToggleAutoplay={() => setIsAutoplay((prev) => !prev)}
                  keybinds={keybinds}
                  playOffsetMs={playOffsetMs}
                  comboPositionPercent={comboPositionPercent}
                  debugHitWindows={debugHitWindows}
                  showLaneSeparators={playShowLaneSeparators}
                  noteHeight={noteHeight}
                  showHitError={playShowHitError}
                  hitPositionOffset={hitPositionOffset}
                  receptorOffset={receptorOffset}
                  customSkinTextures={customSkinTextures}
                  onExitPlayMode={onExitPlayMode}
                />
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  if (!activeBeatmap) {
    return null;
  }

  return (
    <>
      <section className="preview-card">
        <div className={`preview-canvas-shell preview-canvas-shell--${playfieldWidth}`}>
          <SinglePlayfieldCanvas
            beatmap={activeBeatmap}
            playback={playback}
            scrollSpeed={scrollSpeed}
            scrollDirection={scrollDirection}
            beatDivisor={beatDivisor}
            hitGlow={hitGlow}
            volume={volume}
            hitsoundVolume={hitsoundVolume}
            isPlayMode={false}
            receptorOffset={receptorOffset}
            customSkinTextures={customSkinTextures}
            onEditNotes={previewMode === "4k" ? undefined : onEditNotes}
          />
        </div>
      </section>

      {isPlayMode && (
        <div className="play-stage-overlay">
          <div className="play-stage-container" style={{ maxWidth: `${playStageWidth}px` }}>
            <div className="play-stage-track">
              <SinglePlayfieldCanvas
                beatmap={activeBeatmap}
                playback={playback}
                scrollSpeed={scrollSpeed}
                scrollDirection={scrollDirection}
                beatDivisor={beatDivisor}
                hitGlow={hitGlow}
                volume={volume}
                hitsoundVolume={hitsoundVolume}
                isPlayMode={true}
                isAutoplay={isAutoplay}
                onToggleAutoplay={() => setIsAutoplay((prev) => !prev)}
                keybinds={keybinds}
                playOffsetMs={playOffsetMs}
                comboPositionPercent={comboPositionPercent}
                debugHitWindows={debugHitWindows}
                showLaneSeparators={playShowLaneSeparators}
                noteHeight={noteHeight}
                showHitError={playShowHitError}
                hitPositionOffset={hitPositionOffset}
                receptorOffset={receptorOffset}
                customSkinTextures={customSkinTextures}
                onExitPlayMode={onExitPlayMode}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface SinglePlayfieldCanvasProps {
  beatmap: OsuBeatmap;
  playback: PlaybackControls;
  scrollSpeed: number;
  scrollDirection: "down" | "up";
  hitGlow: boolean;
  volume: number;
  hitsoundVolume?: number;
  isPlayMode?: boolean;
  isAutoplay?: boolean;
  onToggleAutoplay?: () => void;
  keybinds?: string[];
  playOffsetMs?: number;
  comboPositionPercent?: number;
  debugHitWindows?: boolean;
  showLaneSeparators?: boolean;
  noteHeight?: number;
  showHitError?: boolean;
  hitPositionOffset?: number;
  receptorOffset?: number;
  customSkinTextures?: LoadedSkinTextures | null;
  beatDivisor?: number;
  onExitPlayMode?: () => void;
  onEditNotes?: (nextBeatmap: OsuBeatmap) => void;
}

function SinglePlayfieldCanvas({
  beatmap,
  playback,
  scrollSpeed,
  scrollDirection,
  hitGlow,
  volume,
  hitsoundVolume = 20,
  isPlayMode = false,
  isAutoplay = false,
  onToggleAutoplay,
  keybinds = DEFAULT_KEYBINDS_7K,
  playOffsetMs = 0,
  comboPositionPercent = 55,
  debugHitWindows = false,
  showLaneSeparators = true,
  noteHeight = 16,
  showHitError = true,
  hitPositionOffset = 40,
  receptorOffset = 0,
  customSkinTextures = null,
  beatDivisor = 1,
  onExitPlayMode,
  onEditNotes,
}: SinglePlayfieldCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const beatmapRef = useRef(beatmap);
  const paletteRef = useRef<PlayfieldPalette | null>(null);
  const scrollSpeedRef = useRef(scrollSpeed);
  const scrollDirectionRef = useRef(scrollDirection);
  const hitGlowRef = useRef(hitGlow);
  const volumeRef = useRef(volume);
  const hitsoundVolumeRef = useRef(hitsoundVolume);
  const isPlayModeRef = useRef(isPlayMode);
  const isAutoplayRef = useRef(isAutoplay);
  const onToggleAutoplayRef = useRef(onToggleAutoplay);
  const keybindsRef = useRef(keybinds);
  const playOffsetMsRef = useRef(playOffsetMs);
  const comboPositionPercentRef = useRef(comboPositionPercent);
  const debugHitWindowsRef = useRef(debugHitWindows);
  const showLaneSeparatorsRef = useRef(showLaneSeparators);
  const noteHeightRef = useRef(noteHeight);
  const showHitErrorRef = useRef(showHitError);
  const hitPositionOffsetRef = useRef(hitPositionOffset);
  const receptorOffsetRef = useRef(receptorOffset);
  const customSkinTexturesRef = useRef(customSkinTextures);
  const speedTimeline = useMemo(
    () => buildSpeedTimeline(beatmap.timingPoints),
    [beatmap.timingPoints],
  );
  const speedTimelineRef = useRef<SpeedTimeline>(speedTimeline);
  const timingSections = useMemo(
    () => getTimingSections(beatmap.timingPoints),
    [beatmap.timingPoints],
  );
  const timingSectionsRef = useRef(timingSections);
  const beatDivisorRef = useRef(beatDivisor);
  const onExitPlayModeRef = useRef(onExitPlayMode);
  const onEditNotesRef = useRef(onEditNotes);
  const dragRef = useRef<DragState | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const playEngineRef = useRef<PlayEngine>(new PlayEngine(beatmap.hitObjects, beatmap.keyCount));

  beatmapRef.current = beatmap;
  scrollSpeedRef.current = scrollSpeed;
  scrollDirectionRef.current = scrollDirection;
  hitGlowRef.current = hitGlow;
  volumeRef.current = volume;
  hitsoundVolumeRef.current = hitsoundVolume;
  isPlayModeRef.current = isPlayMode;
  isAutoplayRef.current = isAutoplay;
  onToggleAutoplayRef.current = onToggleAutoplay;
  keybindsRef.current = keybinds;
  playOffsetMsRef.current = playOffsetMs;
  comboPositionPercentRef.current = comboPositionPercent;
  debugHitWindowsRef.current = debugHitWindows;
  showLaneSeparatorsRef.current = showLaneSeparators;
  noteHeightRef.current = noteHeight;
  showHitErrorRef.current = showHitError;
  hitPositionOffsetRef.current = hitPositionOffset;
  receptorOffsetRef.current = receptorOffset;
  customSkinTexturesRef.current = customSkinTextures;
  speedTimelineRef.current = speedTimeline;
  timingSectionsRef.current = timingSections;
  beatDivisorRef.current = beatDivisor;
  onExitPlayModeRef.current = onExitPlayMode;
  onEditNotesRef.current = onEditNotes;

  useEffect(() => {
    playEngineRef.current.init(beatmap.hitObjects, beatmap.keyCount);
  }, [beatmap, isPlayMode]);

  const palette = useMemo(() => buildPlayfieldPalette(beatmap.keyCount), [beatmap.keyCount]);
  paletteRef.current = palette;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (!isPlayModeRef.current) return;

      if (event.code === "Escape") {
        event.preventDefault();
        onExitPlayModeRef.current?.();
        return;
      }

      if (
        event.code === "Tab" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        onToggleAutoplayRef.current?.();
        return;
      }

      if (isAutoplayRef.current) {
        return;
      }

      if (event.repeat) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const isTextInput =
          (target instanceof HTMLInputElement &&
            ["text", "search", "password", "email", "url", "number"].includes(
              target.type || "text",
            )) ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable;

        if (isTextInput) return;
      }

      const laneIndex = keybindsRef.current.indexOf(event.code);
      if (laneIndex !== -1) {
        event.preventDefault();
        const rawTime = playback.currentTimeMsRef.current;
        const effectiveTime = rawTime - playOffsetMsRef.current;
        const wasHit = playEngineRef.current.handleKeyDown(laneIndex, effectiveTime, 0);
        if (wasHit) {
          playback.playHitSound();
        }
      }
    }

    function handleKeyUp(event: KeyboardEvent): void {
      if (!isPlayModeRef.current || isAutoplayRef.current) return;

      const laneIndex = keybindsRef.current.indexOf(event.code);
      if (laneIndex !== -1) {
        event.preventDefault();
        const rawTime = playback.currentTimeMsRef.current;
        const effectiveTime = rawTime - playOffsetMsRef.current;
        playEngineRef.current.handleKeyUp(laneIndex, effectiveTime, 0);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [playback.currentTimeMsRef]);

  useEffect(() => {
    function frame(): void {
      resizeCanvas();
      drawFrame();
      rafIdRef.current = requestAnimationFrame(frame);
    }

    const container = containerRef.current;
    let resizeObserver: ResizeObserver | null = null;
    if (container !== null && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(resizeCanvas);
      resizeObserver.observe(container);
    }
    resizeCanvas();
    rafIdRef.current = requestAnimationFrame(frame);

    return () => {
      resizeObserver?.disconnect();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  /**
   * Convierte coordenadas de puntero (cliente) a coordenadas lógicas del canvas.
   * El renderizador aplica `ctx.setTransform(dpr, ...)`, por lo que el espacio de
   * dibujo es CSS píxeles; se compensa cualquier escalado CSS del rect.
   */
  function getCanvasCoords(event: { clientX: number; clientY: number }): {
    x: number;
    y: number;
  } | null {
    const canvas = canvasRef.current;
    if (canvas === null) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: (event.clientX - rect.left) * (canvas.clientWidth / rect.width),
      y: (event.clientY - rect.top) * (canvas.clientHeight / rect.height),
    };
  }

  /** Recalcula la geometría del editor igual que el bucle de render. */
  function getEditorGeometry(): EditorGeometry {
    const canvas = canvasRef.current;
    const width = canvas?.clientWidth ?? 0;
    const height = canvas?.clientHeight ?? 0;
    const scrollDir = scrollDirectionRef.current;
    const approachMs = Math.round(17500 / Math.max(scrollSpeedRef.current, 5));
    const hitLineY =
      scrollDir === "down" ? height - PLAYFIELD_HIT_LINE_OFFSET : PLAYFIELD_HIT_LINE_OFFSET;
    const speedPxPerMs =
      scrollDir === "down"
        ? (hitLineY - PLAYFIELD_TOP_PADDING) / approachMs
        : (height - PLAYFIELD_TOP_PADDING - hitLineY) / approachMs;
    return {
      width,
      height,
      hitLineY,
      approachMs,
      speedPxPerMs,
      currentTimeMs: playback.currentTimeMsRef.current,
      scrollDirection: scrollDir,
    };
  }

  function timeAtCanvasY(y: number, geometry: EditorGeometry): number {
    return timeAtY(
      y,
      geometry.currentTimeMs,
      geometry.hitLineY,
      geometry.speedPxPerMs,
      geometry.scrollDirection,
      speedTimelineRef.current,
    );
  }

  function noteHeadY(timeMs: number, geometry: EditorGeometry): number {
    return getNoteY(
      timeMs,
      geometry.currentTimeMs,
      geometry.hitLineY,
      geometry.speedPxPerMs,
      geometry.scrollDirection,
      speedTimelineRef.current,
    );
  }

  function noteTailY(timeMs: number, geometry: EditorGeometry): number {
    return getHoldEndY(
      timeMs,
      geometry.currentTimeMs,
      geometry.hitLineY,
      geometry.speedPxPerMs,
      geometry.scrollDirection,
      speedTimelineRef.current,
    );
  }

  /** Alto REAL renderizado de la nota en esa columna (según el asset de la skin). */
  function getColumnNoteRenderHeight(column: number): number {
    const canvas = canvasRef.current;
    const width = canvas?.clientWidth ?? 0;
    const keyCount = beatmapRef.current.keyCount;
    const noteWidth = Math.max(width / keyCount - 2, 2);
    const img = customSkinTexturesRef.current?.noteImages[column] ?? null;
    if (img && img.complete && img.naturalWidth > 0) {
      const aspect = img.naturalHeight / img.naturalWidth;
      return Math.max(noteHeightRef.current, Math.round(noteWidth * aspect));
    }
    return noteHeightRef.current;
  }

  /**
   * Busca la nota agarrable más cercana en la columna del puntero. Detecta la
   * cabeza de hits y LNs, la cola de LN y el cuerpo de LN (las LNs se detectan
   * para habilitar su arrastre en una iteración futura).
   */
  function hitTestNote(geometry: EditorGeometry, x: number, y: number): NoteGrab | null {
    const currentBeatmap = beatmapRef.current;
    const column = columnFromX(x, geometry.width, currentBeatmap.keyCount);
    // El área de agarre coincide con el alto real del asset (no con noteHeight).
    const halfHeight = getColumnNoteRenderHeight(column) / 2;
    const margin = Math.max(noteHeightRef.current, 14) * 0.5;
    const isDown = geometry.scrollDirection === "down";
    let best: NoteGrab | null = null;
    let bestDistance = margin;

    for (let index = 0; index < currentBeatmap.hitObjects.length; index += 1) {
      const note = currentBeatmap.hitObjects[index];
      if (!note || note.column !== column) continue;

      const headY = noteHeadY(note.timeMs, geometry);

      if (note.endTimeMs === null) {
        // El asset se dibuja con su base en headY: el centro está media altura más arriba (o abajo).
        const centerY = isDown ? headY - halfHeight : headY + halfHeight;
        const distance = Math.max(0, Math.abs(y - centerY) - halfHeight);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { noteIndex: index, kind: "hit", note };
        }
        continue;
      }

      // LN: cabeza y cola (se detectan; su arrastre llega en una iteración futura).
      const headDistance = Math.max(0, Math.abs(y - headY) - halfHeight);
      if (headDistance < bestDistance) {
        bestDistance = headDistance;
        best = { noteIndex: index, kind: "ln-head", note };
      }
      const tailY = noteTailY(note.endTimeMs, geometry);
      const tailDistance = Math.max(0, Math.abs(y - tailY) - halfHeight);
      if (tailDistance < bestDistance) {
        bestDistance = tailDistance;
        best = { noteIndex: index, kind: "ln-tail", note };
      }
    }

    if (best !== null) return best;

    // Zona del cuerpo de una LN: entre la cabeza y la cola, fuera de sus extremos.
    for (let index = 0; index < currentBeatmap.hitObjects.length; index += 1) {
      const note = currentBeatmap.hitObjects[index];
      if (!note || note.column !== column || note.endTimeMs === null) continue;
      const headY = noteHeadY(note.timeMs, geometry);
      const tailY = noteTailY(note.endTimeMs, geometry);
      if (y >= Math.min(headY, tailY) && y <= Math.max(headY, tailY)) {
        return { noteIndex: index, kind: "ln-body", note };
      }
    }

    return null;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (isPlayModeRef.current || onEditNotesRef.current === undefined) return;
    if (event.button !== 0) return;

    const canvas = canvasRef.current;
    if (canvas === null) return;
    const coords = getCanvasCoords(event);
    if (coords === null) return;

    const geometry = getEditorGeometry();
    const grab = hitTestNote(geometry, coords.x, coords.y);
    // Las long notes se detectan pero su arrastre se habilitará más adelante.
    if (grab === null || grab.kind !== "hit") return;

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      noteIndex: grab.noteIndex,
      kind: grab.kind,
      column: columnFromX(coords.x, geometry.width, beatmapRef.current.keyCount),
      timeMs: snapTimeToBeat(
        timeAtCanvasY(coords.y, geometry),
        timingSectionsRef.current,
        beatDivisorRef.current,
      ),
      endTimeMs: null,
      originalNote: grab.note,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    if (isPlayModeRef.current || onEditNotesRef.current === undefined) return;

    const coords = getCanvasCoords(event);
    if (coords === null) return;

    const geometry = getEditorGeometry();
    drag.column = columnFromX(coords.x, geometry.width, beatmapRef.current.keyCount);
    drag.timeMs = snapTimeToBeat(
      timeAtCanvasY(coords.y, geometry),
      timingSectionsRef.current,
      beatDivisorRef.current,
    );
    // Estructura lista para LNs: la cola conserva su duración respecto al inicio.
    if (drag.endTimeMs !== null) {
      const durationMs = drag.endTimeMs - drag.originalNote.timeMs;
      drag.endTimeMs = drag.timeMs + durationMs;
    }
  }

  function finishDrag(event: ReactPointerEvent<HTMLCanvasElement>, apply: boolean): void {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;

    const canvas = canvasRef.current;
    if (canvas !== null && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    if (!apply || drag.kind !== "hit") return;
    const onEditNotes = onEditNotesRef.current;
    if (onEditNotes === undefined || isPlayModeRef.current) return;

    const currentBeatmap = beatmapRef.current;
    if (!currentBeatmap.hitObjects[drag.noteIndex]) return;

    const updatedHitObjects = currentBeatmap.hitObjects
      .map((hitObject, index) =>
        index === drag.noteIndex
          ? { ...hitObject, column: drag.column, timeMs: drag.timeMs }
          : hitObject,
      )
      .sort(compareHitObjects);

    onEditNotes({ ...currentBeatmap, hitObjects: updatedHitObjects });
  }

  function resizeCanvas(): void {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas === null || container === null) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const backingWidth = Math.round(Math.max(container.clientWidth, 1) * dpr);
    const backingHeight = Math.round(Math.max(container.clientHeight, 1) * dpr);
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }
  }

  function drawFrame(): void {
    const canvas = canvasRef.current;
    if (canvas === null || paletteRef.current === null) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return;
    }
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth === 0 || cssHeight === 0) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rawTimeMs = playback.currentTimeMsRef.current;
    // En Autoplay se usa siempre el offset 0 (por defecto) para timing matemático puro.
    // Al desactivar Autoplay, vuelve inmediatamente al offset personalizado del usuario.
    const activeOffset = isAutoplayRef.current ? 0 : playOffsetMsRef.current;
    const effectiveTimeMs = isPlayModeRef.current ? rawTimeMs - activeOffset : rawTimeMs;

    const approachMs = Math.round(17500 / Math.max(scrollSpeedRef.current, 5));

    if (isPlayModeRef.current && playback.isPlaying) {
      if (isAutoplayRef.current) {
        playEngineRef.current.updateAutoplay(
          effectiveTimeMs,
          playback.playHitSound,
          hitsoundVolumeRef.current,
        );
      } else {
        playEngineRef.current.update(effectiveTimeMs, 0);
      }
    }

    const playState = playEngineRef.current.getState();

    const drag = dragRef.current;
    const dragGhost =
      drag !== null && !isPlayModeRef.current
        ? {
            index: drag.noteIndex,
            column: drag.column,
            timeMs: drag.timeMs,
            endTimeMs: drag.endTimeMs,
          }
        : null;

    drawPlayfieldFrame(
      ctx,
      cssWidth,
      cssHeight,
      beatmapRef.current.hitObjects,
      effectiveTimeMs,
      beatmapRef.current.keyCount,
      paletteRef.current,
      {
        approachMs,
        scrollDirection: scrollDirectionRef.current,
        hitGlow: hitGlowRef.current,
        isPlayMode: isPlayModeRef.current,
        userActiveLanes: isPlayModeRef.current ? playState.activeHeldLanes : null,
        combo: playState.combo,
        lastBrokenCombo: playState.lastBrokenCombo,
        comboBreakTime: playState.comboBreakTime,
        lastHitTime: playState.lastHitTime,
        hitNoteIndices: isPlayModeRef.current ? playState.hitNoteIndices : null,
        holdingLnIndices: isPlayModeRef.current ? playState.holdingLnIndices : null,
        comboPositionPercent: comboPositionPercentRef.current,
        debugHitWindows: debugHitWindowsRef.current,
        showLaneSeparators: isPlayModeRef.current ? showLaneSeparatorsRef.current : true,
        noteHeight: noteHeightRef.current,
        recentHitErrors: isPlayModeRef.current ? playState.recentHitErrors : null,
        showHitError: showHitErrorRef.current,
        lastJudgement: isPlayModeRef.current ? playState.lastJudgement : null,
        hitPositionOffset: isPlayModeRef.current ? hitPositionOffsetRef.current : 40,
        receptorOffset: receptorOffsetRef.current,
        customSkinTextures: customSkinTexturesRef.current,
        speedTimeline: speedTimelineRef.current,
        timingSections: timingSectionsRef.current,
        beatDivisor: beatDivisorRef.current,
        dragGhost,
        isCompleted:
          isPlayModeRef.current &&
          playback.durationMs > 0 &&
          effectiveTimeMs >= playback.durationMs - 200,
      },
    );
  }

  return (
    <div ref={containerRef} className="single-canvas-container">
      <canvas
        ref={canvasRef}
        className="preview-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishDrag(event, true)}
        onPointerCancel={(event) => finishDrag(event, false)}
      />
    </div>
  );
}
