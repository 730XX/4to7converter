import { useEffect, useMemo, useRef } from "react";
import type { OsuBeatmap } from "../../../src/core/osu/types";
import { hitSoundEngine } from "../lib/hitsound";
import type { PlaybackControls } from "../lib/use-playback";
import {
  buildPlayfieldPalette,
  drawPlayfieldFrame,
  type PlayfieldPalette,
} from "../preview/renderer";

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
  hitsounds?: boolean;
  volume?: number;
  hitsoundVolume?: number;
}

/**
 * Vista previa animada del playfield. Si previewMode es 'split', renderiza
 * ambos mapas (4k y 7k) dentro de la misma tarjeta con anchos proporcionales.
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
  hitsounds = true,
  volume = 80,
  hitsoundVolume = 80,
}: PlayfieldProps) {
  const isSplit = previewMode === "split" && sourceBeatmap && targetBeatmap;
  const activeBeatmap = beatmap ?? (previewMode === "4k" ? sourceBeatmap : targetBeatmap);

  
  if (isSplit) {
    return (
      <section className="preview-card preview-card--split">
        <div className="preview-split-container">
          
          <div className="preview-split-track preview-split-track--4k">
            {/* <span className="preview-pane-badge mono">4K Originalasdasda</span>*/}
            <SinglePlayfieldCanvas
              beatmap={sourceBeatmap}
              playback={playback}
              scrollSpeed={scrollSpeed}
              scrollDirection={scrollDirection}
              hitGlow={hitGlow}
              hitsounds={hitsounds}
              volume={volume}
              hitsoundVolume={hitsoundVolume}
            />
          </div>
          <div className="preview-split-divider" aria-hidden="true" />
          <div className="preview-split-track preview-split-track--7k">
            {/* <span className="preview-pane-badge mono">7K Convertido</span> */}
            <SinglePlayfieldCanvas
              beatmap={targetBeatmap}
              playback={playback}
              scrollSpeed={scrollSpeed}
              scrollDirection={scrollDirection}
              hitGlow={hitGlow}
              hitsounds={hitsounds}
              volume={volume}
              hitsoundVolume={hitsoundVolume}
            />
          </div>
        </div>
      </section>
    );
  }

  if (!activeBeatmap) {
    return null;
  }

  return (
    <section className="preview-card">
      <div className={`preview-canvas-shell preview-canvas-shell--${playfieldWidth}`}>
        <SinglePlayfieldCanvas
          beatmap={activeBeatmap}
          playback={playback}
          scrollSpeed={scrollSpeed}
          scrollDirection={scrollDirection}
          hitGlow={hitGlow}
          hitsounds={hitsounds}
          volume={volume}
          hitsoundVolume={hitsoundVolume}
        />
      </div>
    </section>
  );
}

interface SinglePlayfieldCanvasProps {
  beatmap: OsuBeatmap;
  playback: PlaybackControls;
  scrollSpeed: number;
  scrollDirection: "down" | "up";
  hitGlow: boolean;
  hitsounds: boolean;
  volume: number;
  hitsoundVolume: number;
}

function SinglePlayfieldCanvas({
  beatmap,
  playback,
  scrollSpeed,
  scrollDirection,
  hitGlow,
  hitsounds,
  volume,
  hitsoundVolume,
}: SinglePlayfieldCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const beatmapRef = useRef(beatmap);
  const paletteRef = useRef<PlayfieldPalette | null>(null);
  const scrollSpeedRef = useRef(scrollSpeed);
  const scrollDirectionRef = useRef(scrollDirection);
  const hitGlowRef = useRef(hitGlow);
  const hitsoundsRef = useRef(hitsounds);
  const volumeRef = useRef(volume);
  const hitsoundVolumeRef = useRef(hitsoundVolume);
  const lastCheckedTimeRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  beatmapRef.current = beatmap;
  scrollSpeedRef.current = scrollSpeed;
  scrollDirectionRef.current = scrollDirection;
  hitGlowRef.current = hitGlow;
  hitsoundsRef.current = hitsounds;
  volumeRef.current = volume;
  hitsoundVolumeRef.current = hitsoundVolume;

  const palette = useMemo(() => buildPlayfieldPalette(beatmap.keyCount), [beatmap.keyCount]);
  paletteRef.current = palette;

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

    const currentTimeMs = playback.currentTimeMsRef.current;

    // Hitsounds sintéticos en reproducción activa
    if (hitsoundsRef.current && playback.isPlaying) {
      const prevTime = lastCheckedTimeRef.current;
      if (currentTimeMs > prevTime && currentTimeMs - prevTime < 250) {
        let hasHit = false;
        for (const ho of beatmapRef.current.hitObjects) {
          if (ho.timeMs > prevTime && ho.timeMs <= currentTimeMs) {
            hasHit = true;
            break;
          }
        }
        if (hasHit) {
          hitSoundEngine.playHit(hitsoundVolumeRef.current / 100);
        }
      }
      lastCheckedTimeRef.current = currentTimeMs;
    } else {
      lastCheckedTimeRef.current = currentTimeMs;
    }

    // 17500 / scrollSpeed (25 = 700ms)
    const approachMs = Math.round(17500 / Math.max(scrollSpeedRef.current, 5));

    drawPlayfieldFrame(
      ctx,
      cssWidth,
      cssHeight,
      beatmapRef.current.hitObjects,
      currentTimeMs,
      beatmapRef.current.keyCount,
      paletteRef.current,
      approachMs,
      scrollDirectionRef.current,
      hitGlowRef.current,
    );
  }

  return (
    <div ref={containerRef} className="single-canvas-container">
      <canvas ref={canvasRef} className="preview-canvas" />
    </div>
  );
}
