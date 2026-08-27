import { useEffect, useMemo, useRef } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { Download, Eye, Gamepad2, Pause, Play } from "lucide-react";
import type { OsuBeatmap } from "../../../../src/core/osu/types";
import type { PlaybackControls } from "../../lib/use-playback";
import { formatTimeMs } from "../../preview/preview-math";
import type { UiTimelineSection } from "../../lib/timeline-sections";
import { TimelineSectionTrack } from "./TimelineSectionTrack";

/** Velocidades de desplazamiento cíclicas, multiplicando el reloj maestro. */
const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2];

interface PlaybackFooterProps {
  playback: PlaybackControls;
  beatmap?: OsuBeatmap | null;
  onExport: () => void;
  isPlayMode?: boolean;
  onTogglePlayMode?: () => void;
  sections?: readonly UiTimelineSection[];
  activeSectionId?: string | null;
  onSelectSection?: (sectionId: string) => void;
  onSplitSection?: () => void;
  onDeleteSection?: (sectionId: string) => void;
  onUpdateBoundary?: (leftSectionIndex: number, newCutTimeMs: number) => void;
}

const DENSITY_BINS = 120; // 120 barras de resolución a lo largo de la canción

/**
 * Barra inferior de reproducción con mini-gráfico de densidad de notas (Timeline Density).
 */
export function PlaybackFooter({
  playback,
  beatmap,
  onExport,
  isPlayMode = false,
  onTogglePlayMode,
  sections = [],
  activeSectionId = null,
  onSelectSection,
  onSplitSection,
  onDeleteSection,
  onUpdateBoundary,
}: PlaybackFooterProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Calcular histograma de densidad de notas a lo largo de la duración
  const densityHistogram = useMemo(() => {
    if (!beatmap || beatmap.hitObjects.length === 0 || playback.durationMs <= 0) {
      return new Array<number>(DENSITY_BINS).fill(0);
    }

    const bins = new Array<number>(DENSITY_BINS).fill(0);
    const duration = playback.durationMs;

    for (const obj of beatmap.hitObjects) {
      const clampedTime = Math.max(0, Math.min(duration, obj.timeMs));
      const binIndex = Math.min(
        DENSITY_BINS - 1,
        Math.floor((clampedTime / duration) * DENSITY_BINS),
      );
      bins[binIndex] = (bins[binIndex] ?? 0) + 1;
    }

    return bins;
  }, [beatmap, playback.durationMs]);

  // Calcular intervalos de Kiai Time desde [TimingPoints]
  const kiaiIntervals = useMemo(() => {
    if (!beatmap || !beatmap.timingPoints || beatmap.timingPoints.length === 0) {
      return [] as Array<{ startMs: number; endMs: number }>;
    }

    // Ordenar puntos de timing temporalmente
    const sorted = [...beatmap.timingPoints].sort((a, b) => a.offsetMs - b.offsetMs);
    const intervals: Array<{ startMs: number; endMs: number }> = [];
    let currentKiaiStart: number | null = null;
    const duration = playback.durationMs;

    for (const tp of sorted) {
      const isKiai = (tp.effects & 1) === 1;

      if (isKiai && currentKiaiStart === null) {
        currentKiaiStart = Math.max(0, tp.offsetMs);
      } else if (!isKiai && currentKiaiStart !== null) {
        const end = Math.max(currentKiaiStart, tp.offsetMs);
        intervals.push({ startMs: currentKiaiStart, endMs: end });
        currentKiaiStart = null;
      }
    }

    // Si el último punto quedó con Kiai activo, extender hasta el final de la canción
    if (currentKiaiStart !== null) {
      intervals.push({
        startMs: currentKiaiStart,
        endMs: Math.max(currentKiaiStart, duration),
      });
    }

    return intervals;
  }, [beatmap, playback.durationMs]);

  // Dibujar el histograma de densidad, kiai tracks y la posición de reproducción
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const maxDensity = Math.max(...densityHistogram, 1);
    const barWidth = width / DENSITY_BINS;

    // 1. Dibujar barras de densidad
    for (let i = 0; i < DENSITY_BINS; i++) {
      const count = densityHistogram[i] ?? 0;
      const barHeight = Math.max(2, (count / maxDensity) * (height - 8));
      const x = i * barWidth;
      const y = height - barHeight - 2;

      // Gradiente suave según la intensidad de notas
      const intensity = count / maxDensity;
      if (intensity > 0.6) {
        ctx.fillStyle = "rgba(250, 170, 212, 0.85)"; // #faaad4 (intensidad alta)
      } else if (intensity > 0.25) {
        ctx.fillStyle = "rgba(247, 236, 0, 0.75)"; // #f7ec00 (intensidad media)
      } else if (count > 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      }

      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    }

    // 2. Dibujar Kiai Track (Franja #905921 semitransparente de 6px en el borde inferior)
    if (playback.durationMs > 0 && kiaiIntervals.length > 0) {
      const duration = playback.durationMs;
      const kiaiHeight = 6;
      const kiaiY = -4;

      for (const interval of kiaiIntervals) {
        const startX = Math.max(0, (interval.startMs / duration) * width);
        const endX = Math.min(width, (interval.endMs / duration) * width);
        const trackWidth = Math.max(2, endX - startX);

        ctx.save();
        ctx.fillStyle = "rgba(144, 89, 33, 0.75)"; // #905921 semi-transparente
        ctx.fillRect(startX, kiaiY, trackWidth, kiaiHeight);
        ctx.restore();
      }
    }

    // 3. Progreso actual (aguja)
    if (playback.durationMs > 0) {
      const progress = Math.min(1, Math.max(0, playback.timerTimeMs / playback.durationMs));
      const needleX = progress * width;

      // Detectar si el momento actual está en Kiai para darle acento a la aguja
      const isInKiai = kiaiIntervals.some(
        (k) => playback.timerTimeMs >= k.startMs && playback.timerTimeMs <= k.endMs,
      );

      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = isInKiai ? "#905921" : "#f7ec00";
      ctx.shadowBlur = isInKiai ? 8 : 5;
      ctx.fillRect(needleX - 1, 0, 2, height);
      ctx.restore();
    }
  }, [densityHistogram, kiaiIntervals, playback.timerTimeMs, playback.durationMs]);

  function handleCycleSpeed(): void {
    const currentIndex = SPEED_OPTIONS.indexOf(playback.speed);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    const nextSpeed = SPEED_OPTIONS[nextIndex] ?? 1;
    playback.setSpeed(nextSpeed);
  }

  function handleTimelineClick(event: MouseEvent<HTMLDivElement>): void {
    if (playback.durationMs <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    playback.seekTo(ratio * playback.durationMs);
  }

  function handleSeek(event: ChangeEvent<HTMLInputElement>): void {
    playback.seekTo(Number(event.target.value));
  }

  return (
    <footer className="playback-footer-wrapper">
      {beatmap && onSelectSection && onSplitSection && onDeleteSection && (
        <TimelineSectionTrack
          sections={sections}
          activeSectionId={activeSectionId}
          durationMs={playback.durationMs > 0 ? playback.durationMs : Math.max(beatmap.hitObjects.slice(-1)[0]?.timeMs ?? 1000, 1000)}
          currentTimeMs={playback.timerTimeMs}
          onSelectSection={onSelectSection}
          onSplitAtCurrentTime={onSplitSection}
          onDeleteSection={onDeleteSection}
          onSeek={(timeMs) => playback.seekTo(timeMs)}
          onUpdateBoundary={onUpdateBoundary}
        />
      )}

      <div className="playback-footer">
        <button
          type="button"
          className="preview-button preview-button--icon"
          onClick={playback.togglePlay}
          title={playback.isPlaying ? "Pausar" : "Reproducir"}
        >
          {playback.isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>

        <span className="preview-timer mono">
          {formatTimeMs(playback.timerTimeMs)} / {formatTimeMs(playback.durationMs)}
        </span>

        {/* Contenedor interactivo del Timeline con Density Spectrum */}
        <div
          className="timeline-density-wrapper"
          onClick={handleTimelineClick}
        >
          <canvas ref={canvasRef} className="timeline-density-canvas" width={600} height={26} />
          <input
            className="preview-slider timeline-density-slider"
            type="range"
            min={0}
            max={Math.max(playback.durationMs, 1)}
            step={1}
            value={Math.min(playback.timerTimeMs, playback.durationMs)}
            onChange={handleSeek}
            onPointerUp={(e) => (e.target as HTMLElement).blur()}
            aria-label="Posición de reproducción"
          />
        </div>

        <button
          type="button"
          className="preview-button preview-speed-btn mono"
          onClick={handleCycleSpeed}
          title="Cambiar velocidad de reproducción (clic para ciclar)"
        >
          {playback.speed}×
        </button>

        {onTogglePlayMode && (
          <button
            type="button"
            className={`preview-button preview-button--play-mode${isPlayMode ? " is-active" : ""}`}
            onClick={onTogglePlayMode}
            title={isPlayMode ? "Cambiar a Modo Preview (Autoplay)" : "Testear mapa (jugable)"}
          >
            {isPlayMode ? <Gamepad2 size={16} /> : <Eye size={16} />}
            <span>{isPlayMode ? "Modo Play" : "Test"}</span>
          </button>
        )}

        <button type="button" className="primary-button primary-button--icon" onClick={onExport} title="Exportar beatmap 7k (.osu)">
          <Download size={16} />
          <span>Exportar</span>
        </button>
      </div>
    </footer>
  );
}
