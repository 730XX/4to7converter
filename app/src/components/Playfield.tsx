import { useEffect, useMemo, useRef, useState } from "react";
import type { OsuBeatmap } from "../../../src/core/osu/types";
import type { PlaybackControls } from "../lib/use-playback";
import {
  buildPlayfieldPalette,
  drawPlayfieldFrame,
  type PlayfieldPalette,
} from "../preview/renderer";
import { PlayEngine } from "../preview/play-engine";
import { DEFAULT_KEYBINDS_7K } from "../lib/settings";

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
  isPlayMode?: boolean;
  keybinds?: string[];
  playOffsetMs?: number;
  comboPositionPercent?: number;
  playShowLaneSeparators?: boolean;
  noteHeight?: number;
  onExitPlayMode?: () => void;
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
  isPlayMode = false,
  keybinds = DEFAULT_KEYBINDS_7K,
  playOffsetMs = 0,
  comboPositionPercent = 55,
  playShowLaneSeparators = true,
  noteHeight = 16,
  onExitPlayMode,
}: PlayfieldProps) {
  const [debugHitWindows, setDebugHitWindows] = useState(false);
  const isSplit = previewMode === "split" && sourceBeatmap && targetBeatmap;
  const activeBeatmap = beatmap ?? (previewMode === "4k" ? sourceBeatmap : targetBeatmap);

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
                hitGlow={hitGlow}
                volume={volume}
                isPlayMode={false}
              />
            </div>
            <div className="preview-split-divider" aria-hidden="true" />
            <div className="preview-split-track preview-split-track--7k">
              <SinglePlayfieldCanvas
                beatmap={targetBeatmap}
                playback={playback}
                scrollSpeed={scrollSpeed}
                scrollDirection={scrollDirection}
                hitGlow={hitGlow}
                volume={volume}
                isPlayMode={false}
              />
            </div>
          </div>
        </section>

        {/* Si se activa Modo Play durante Split, proyectar el 7K al frente a pantalla completa */}
        {isPlayMode && (
          <div className="play-stage-overlay">
            <div className="play-stage-container">
             
              <div className="play-stage-track">
                <SinglePlayfieldCanvas
                  beatmap={targetBeatmap}
                  playback={playback}
                  scrollSpeed={scrollSpeed}
                  scrollDirection={scrollDirection}
                  hitGlow={hitGlow}
                  volume={volume}
                  isPlayMode={true}
                  keybinds={keybinds}
                  playOffsetMs={playOffsetMs}
                  comboPositionPercent={comboPositionPercent}
                  debugHitWindows={debugHitWindows}
                  showLaneSeparators={playShowLaneSeparators}
                  noteHeight={noteHeight}
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
            hitGlow={hitGlow}
            volume={volume}
            isPlayMode={false}
          />
        </div>
      </section>

      {/* OVERLAY DEL MODO PLAY: Se coloca por encima de toda la app ocupando todo el alto */}
      {isPlayMode && (
        <div className="play-stage-overlay">
          <div className="play-stage-container">
            <div className="play-stage-track">
              <SinglePlayfieldCanvas
                beatmap={activeBeatmap}
                playback={playback}
                scrollSpeed={scrollSpeed}
                scrollDirection={scrollDirection}
                hitGlow={hitGlow}
                volume={volume}
                isPlayMode={true}
                keybinds={keybinds}
                playOffsetMs={playOffsetMs}
                comboPositionPercent={comboPositionPercent}
                debugHitWindows={debugHitWindows}
                showLaneSeparators={playShowLaneSeparators}
                noteHeight={noteHeight}
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
  isPlayMode?: boolean;
  keybinds?: string[];
  playOffsetMs?: number;
  comboPositionPercent?: number;
  debugHitWindows?: boolean;
  showLaneSeparators?: boolean;
  noteHeight?: number;
  onExitPlayMode?: () => void;
}

function SinglePlayfieldCanvas({
  beatmap,
  playback,
  scrollSpeed,
  scrollDirection,
  hitGlow,
  volume,
  isPlayMode = false,
  keybinds = DEFAULT_KEYBINDS_7K,
  playOffsetMs = 0,
  comboPositionPercent = 55,
  debugHitWindows = false,
  showLaneSeparators = true,
  noteHeight = 16,
  onExitPlayMode,
}: SinglePlayfieldCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const beatmapRef = useRef(beatmap);
  const paletteRef = useRef<PlayfieldPalette | null>(null);
  const scrollSpeedRef = useRef(scrollSpeed);
  const scrollDirectionRef = useRef(scrollDirection);
  const hitGlowRef = useRef(hitGlow);
  const volumeRef = useRef(volume);
  const isPlayModeRef = useRef(isPlayMode);
  const keybindsRef = useRef(keybinds);
  const playOffsetMsRef = useRef(playOffsetMs);
  const comboPositionPercentRef = useRef(comboPositionPercent);
  const debugHitWindowsRef = useRef(debugHitWindows);
  const showLaneSeparatorsRef = useRef(showLaneSeparators);
  const noteHeightRef = useRef(noteHeight);
  const onExitPlayModeRef = useRef(onExitPlayMode);
  const rafIdRef = useRef<number | null>(null);

  // Instancia persistente del motor de juego para Modo Play
  const playEngineRef = useRef<PlayEngine>(new PlayEngine(beatmap.hitObjects, beatmap.keyCount));

  beatmapRef.current = beatmap;
  scrollSpeedRef.current = scrollSpeed;
  scrollDirectionRef.current = scrollDirection;
  hitGlowRef.current = hitGlow;
  volumeRef.current = volume;
  isPlayModeRef.current = isPlayMode;
  keybindsRef.current = keybinds;
  playOffsetMsRef.current = playOffsetMs;
  comboPositionPercentRef.current = comboPositionPercent;
  debugHitWindowsRef.current = debugHitWindows;
  showLaneSeparatorsRef.current = showLaneSeparators;
  noteHeightRef.current = noteHeight;
  onExitPlayModeRef.current = onExitPlayMode;

  // Reinicializar engine cuando cambie el mapa
  useEffect(() => {
    playEngineRef.current.init(beatmap.hitObjects, beatmap.keyCount);
  }, [beatmap]);

  const palette = useMemo(() => buildPlayfieldPalette(beatmap.keyCount), [beatmap.keyCount]);
  paletteRef.current = palette;

  // Listeners de teclado para Modo Play (captura de keybinds de los 7 carriles y Escape)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (!isPlayModeRef.current) return;

      // Escape para salir de inmediato del Modo Play
      if (event.code === "Escape") {
        event.preventDefault();
        onExitPlayModeRef.current?.();
        return;
      }

      // CRUCIAL: Ignorar auto-repeat del sistema operativo para evitar spamming automático de combo
      if (event.repeat) {
        return;
      }

      // Si el usuario está escribiendo en un input, ignorar
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
        playEngineRef.current.handleKeyDown(laneIndex, effectiveTime, 0);
      }
    }

    function handleKeyUp(event: KeyboardEvent): void {
      if (!isPlayModeRef.current) return;

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
    // En Modo Play, el offset desplaza el tiempo del canvas para alinear visualmente las notas y el juicio
    const effectiveTimeMs = isPlayModeRef.current
      ? rawTimeMs - playOffsetMsRef.current
      : rawTimeMs;

    // 17500 / scrollSpeed (25 = 700ms)
    const approachMs = Math.round(17500 / Math.max(scrollSpeedRef.current, 5));

    // Actualizar juicio de notas en Modo Play con el tiempo efectivo
    if (isPlayModeRef.current && playback.isPlaying) {
      playEngineRef.current.update(effectiveTimeMs, 0);
    }

    const playState = playEngineRef.current.getState();

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
      },
    );
  }

  return (
    <div ref={containerRef} className="single-canvas-container">
      <canvas ref={canvasRef} className="preview-canvas" />
    </div>
  );
}
