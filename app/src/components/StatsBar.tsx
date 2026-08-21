import { useEffect, useMemo, useRef } from "react";
import { Activity, Sparkles } from "lucide-react";
import type { OsuBeatmap } from "../../../src/core/osu/types";
import type { PlaybackControls } from "../lib/use-playback";
import {
  getTimingSections,
  getKiaiIntervals,
  evaluateDynamicRhythm,
} from "../preview/beat-grid";

interface StatsBarProps {
  source: OsuBeatmap;
  converted: OsuBeatmap;
  targetColumnCounts?: number[];
  issueCounts: { errors: number; warnings: number };
  playback?: PlaybackControls;
}

/**
 * Barra de estadísticas y Cápsula Metrónomo auto-ajustable con expansión fluida en Kiai Mode.
 */
export function StatsBar({ source, converted, issueCounts, playback }: StatsBarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bpmTextRef = useRef<HTMLSpanElement | null>(null);
  const kiaiTagRef = useRef<HTMLDivElement | null>(null);
  const beatBoxesRef = useRef<(HTMLDivElement | null)[]>([]);

  const timingPoints = source?.timingPoints ?? [];
  const timingSections = useMemo(() => getTimingSections(timingPoints), [timingPoints]);
  const kiaiIntervals = useMemo(
    () => getKiaiIntervals(timingPoints, playback?.durationMs ?? 3600000),
    [timingPoints, playback?.durationMs],
  );

  useEffect(() => {
    if (!playback) return;
    let animId: number;
    let lastSectionOffset = -1; // para detectar cambio de BPM

    function renderMetronome(): void {
      const curTime = playback!.currentTimeMsRef.current;
      const { currentBpm, beatIndex4, beatPulse, isInKiai, activeSectionOffsetMs } = evaluateDynamicRhythm(
        timingSections,
        kiaiIntervals,
        curTime,
      );

      if (containerRef.current && currentBpm > 0) {
        containerRef.current.style.display = "inline-flex";

        if (isInKiai) {
          containerRef.current.classList.add("is-kiai");
        } else {
          containerRef.current.classList.remove("is-kiai");
        }

        if (bpmTextRef.current) {
          bpmTextRef.current.textContent = `${currentBpm} BPM`;
        }

        if (kiaiTagRef.current) {
          if (isInKiai) {
            kiaiTagRef.current.classList.add("is-visible");
          } else {
            kiaiTagRef.current.classList.remove("is-visible");
          }
        }

        // Detectar cambio de sección de BPM → resetear todas las luces
        const bpmChanged = activeSectionOffsetMs !== lastSectionOffset;
        if (bpmChanged) {
          lastSectionOffset = activeSectionOffsetMs;
          // Apagar todos los cuadritos inmediatamente
          for (let i = 0; i < 4; i++) {
            const box = beatBoxesRef.current[i];
            if (box) {
              box.className = "rhythm-box";
              box.style.opacity = "0";
            }
          }
        }

        // Los 4 cuadritos siempre ciclan en 1/4 (beatIndex4 = 0,1,2,3) sin importar el meter
        for (let i = 0; i < 4; i++) {
          const box = beatBoxesRef.current[i];
          if (!box) continue;

          const isActive = i === beatIndex4 && playback!.isPlaying;
          if (isActive) {
            box.className = `rhythm-box is-active${i === 0 ? " is-downbeat" : ""}${isInKiai ? " is-kiai" : ""}`;
            box.style.opacity = String(beatPulse);
          } else {
            box.className = "rhythm-box";
            box.style.opacity = "0";
          }
        }
      } else if (containerRef.current) {
        containerRef.current.style.display = "none";
      }

      animId = requestAnimationFrame(renderMetronome);
    }

    animId = requestAnimationFrame(renderMetronome);
    return () => cancelAnimationFrame(animId);
  }, [timingSections, kiaiIntervals, playback]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", width: "100%" }}>
      {/* 4 Cards de estadísticas */}
      <section className="stats-bar" style={{ alignItems: "center", textAlign: "center", width: "100%" }}>
        <div className="stat-card">
          <span className="stat-label">Notas fuente</span>
          <span className="stat-value mono">{source.hitObjects.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Notas destino</span>
          <span className="stat-value mono">{converted.hitObjects.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Errores</span>
          <span className={`stat-value mono${issueCounts.errors > 0 ? " is-error" : ""}`}>
            {issueCounts.errors}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Advertencias</span>
          <span className={`stat-value mono${issueCounts.warnings > 0 ? " is-warning" : ""}`}>
            {issueCounts.warnings}
          </span>
        </div>
      </section>

      {/* Cápsula de Metrónomo Auto-ajustable (Fit Content) */}
      <div
        ref={containerRef}
        className="rhythm-capsule mono"
        style={{ display: "none" }}
      >
        {/* BPM */}
        <div className="rhythm-capsule-bpm">
          <Activity size={14} className="rhythm-capsule-icon" />
          <span ref={bpmTextRef} className="rhythm-bpm-value">0 BPM</span>
        </div>

        {/* 4 Cuadritos de Beat */}
        <div className="rhythm-boxes-grid">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              ref={(el) => {
                beatBoxesRef.current[idx] = el;
              }}
              className="rhythm-box"
              title={`Beat ${idx + 1}`}
            />
          ))}
        </div>

        {/* Tag Kiai Expandible suavemente */}
        <div ref={kiaiTagRef} className="rhythm-kiai-slot">
          <div className="rhythm-kiai-badge">
            <Sparkles size={11} />
            <span>KIAI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
