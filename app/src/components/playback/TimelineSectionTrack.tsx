import React, { useRef, useState } from "react";
import { Scissors, Trash2 } from "lucide-react";
import type { UiTimelineSection } from "../../lib/timeline-sections";
import { formatTimeMs } from "../../preview/preview-math";

interface TimelineSectionTrackProps {
  sections: readonly UiTimelineSection[];
  activeSectionId: string | null;
  durationMs: number;
  currentTimeMs?: number;
  onSelectSection: (sectionId: string) => void;
  onSplitAtCurrentTime: () => void;
  onDeleteSection: (sectionId: string) => void;
  onSeek: (timeMs: number) => void;
  onUpdateBoundary?: (leftSectionIndex: number, newCutTimeMs: number) => void;
}

/**
 * Pista horizontal interactiva de secciones temporales con soporte para arrastrar divisores.
 */
export function TimelineSectionTrack({
  sections,
  activeSectionId,
  durationMs,
  onSelectSection,
  onSplitAtCurrentTime,
  onDeleteSection,
  onSeek,
  onUpdateBoundary,
}: TimelineSectionTrackProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [draggingHandleIndex, setDraggingHandleIndex] = useState<number | null>(null);

  if (durationMs <= 0) {
    return null;
  }

  const effectiveSections =
    sections.length > 0
      ? sections
      : [
          {
            id: "sec-default",
            name: "Sección 1",
            startMs: 0,
            endMs: durationMs,
            laneMapState: [[0, 1], [2, 3], [4], [5, 6]],
            color: "#38bdf8",
          },
        ];

  // Manejo de arrastre de divisor (Mouse Drag)
  const handlePointerDownHandle = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingHandleIndex(index);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingHandleIndex === null || !trackRef.current || !onUpdateBoundary) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetMs = Math.round(ratio * durationMs);
    onUpdateBoundary(draggingHandleIndex, targetMs);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingHandleIndex !== null) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignorar si el puntero ya no está capturado
      }
      setDraggingHandleIndex(null);
    }
  };

  return (
    <div className="timeline-sections-container">
      <div className="timeline-sections-header">
        <div className="timeline-sections-title-group">
          <span className="timeline-sections-label">SECCIONES DE TIEMPO</span>
          <span className="timeline-sections-count mono">
            {effectiveSections.length} {effectiveSections.length === 1 ? "sección" : "secciones"}
          </span>
        </div>
        <div className="timeline-sections-actions">
          <button
            type="button"
            className="timeline-split-btn"
            onClick={onSplitAtCurrentTime}
            title="Dividir sección en el tiempo actual (Ctrl + B)"
          >
            <Scissors size={12} />
            <span>Dividir aquí</span>
            <kbd className="mono">Ctrl+B</kbd>
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className={`timeline-sections-track${draggingHandleIndex !== null ? " is-resizing" : ""}`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {effectiveSections.map((sec) => {
          const isSelected = activeSectionId === sec.id;
          const leftPercent = (Math.max(0, sec.startMs) / durationMs) * 100;
          const widthPercent =
            (Math.max(1, sec.endMs - sec.startMs) / durationMs) * 100;
          const color = sec.color ?? "#38bdf8";

          return (
            <div
              key={sec.id}
              className={`timeline-section-block${isSelected ? " is-selected" : ""}`}
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
                borderColor: isSelected ? color : "transparent",
                backgroundColor: isSelected ? `${color}28` : `${color}14`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectSection(sec.id);
                onSeek(sec.startMs);
              }}
              title={`${sec.name} (${formatTimeMs(sec.startMs)} - ${formatTimeMs(sec.endMs)})`}
            >
              <div className="timeline-section-bar-top" style={{ backgroundColor: color }} />
              <div className="timeline-section-content">
                <span className="timeline-section-name" style={{ color: isSelected ? "#fff" : color }}>
                  {sec.name}
                </span>
                <span className="timeline-section-timerange mono">
                  {formatTimeMs(sec.startMs)}
                </span>
              </div>

              {effectiveSections.length > 1 && (
                <button
                  type="button"
                  className="timeline-section-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSection(sec.id);
                  }}
                  title={`Eliminar ${sec.name} y fusionar`}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          );
        })}

        {/* Divisores interactivos entre secciones contiguas para arrastrar y ajustar milisegundos */}
        {effectiveSections.length > 1 &&
          effectiveSections.slice(0, -1).map((sec, idx) => {
            const cutPercent = (sec.endMs / durationMs) * 100;
            const isDragging = draggingHandleIndex === idx;

            return (
              <div
                key={`handle-${sec.id}`}
                className={`timeline-section-handle${isDragging ? " is-dragging" : ""}`}
                style={{ left: `${cutPercent}%` }}
                onPointerDown={(e) => handlePointerDownHandle(e, idx)}
                title={`Arrastrar para ajustar corte en ${formatTimeMs(sec.endMs)}`}
              >
                <div className="timeline-section-handle-line" />
                <div className="timeline-section-handle-knob" />
              </div>
            );
          })}
      </div>
    </div>
  );
}
