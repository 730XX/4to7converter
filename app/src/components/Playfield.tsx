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
import type { LoadedSkinTextures } from "../preview/skin-manager";

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
  onExitPlayMode,
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
                hitGlow={hitGlow}
                volume={volume}
                hitsoundVolume={hitsoundVolume}
                isPlayMode={false}
                receptorOffset={receptorOffset}
                customSkinTextures={customSkinTextures}
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
            hitGlow={hitGlow}
            volume={volume}
            hitsoundVolume={hitsoundVolume}
            isPlayMode={false}
            receptorOffset={receptorOffset}
            customSkinTextures={customSkinTextures}
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
  onExitPlayMode?: () => void;
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
  const onExitPlayModeRef = useRef(onExitPlayMode);
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
  onExitPlayModeRef.current = onExitPlayMode;

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

      if (event.code === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
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
    const effectiveTimeMs = isPlayModeRef.current
      ? rawTimeMs - activeOffset
      : rawTimeMs;

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
        isCompleted:
          isPlayModeRef.current &&
          playback.durationMs > 0 &&
          effectiveTimeMs >= playback.durationMs - 200,
      },
    );
  }

  return (
    <div ref={containerRef} className="single-canvas-container">
      <canvas ref={canvasRef} className="preview-canvas" />
    </div>
  );
}
