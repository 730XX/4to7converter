import type { LaneMapState } from "./lane-map-state";
import { toLaneMap } from "./lane-map-state";
import type { LaneMapSection } from "../../../src/core/convert/section-lane-map";

/**
 * Representa una sección de la línea de tiempo en el frontend (UI state).
 */
export interface UiTimelineSection {
  id: string;
  name: string;
  startMs: number;
  endMs: number;
  laneMapState: LaneMapState;
  presetId?: string | null;
  presetName?: string | null;
  color?: string;
}

/** Colores vibrantes y armónicos para distinguir visualmente cada sección en la timeline */
export const SECTION_COLORS = [
  "#38bdf8", // Sky blue
  "#a855f7", // Purple
  "#ec4899", // Pink
  "#f97316", // Orange
  "#22c55e", // Green
  "#eab308", // Yellow
  "#06b6d4", // Cyan
  "#6366f1", // Indigo
];

/**
 * Convierte un arreglo de UiTimelineSection a LaneMapSection (core).
 */
export function toCoreSections(sections: readonly UiTimelineSection[]): LaneMapSection[] {
  return sections.map((sec) => ({
    id: sec.id,
    name: sec.name,
    startMs: sec.startMs,
    endMs: sec.endMs,
    laneMap: toLaneMap(sec.laneMapState),
    presetId: sec.presetId,
  }));
}

/**
 * Crea una sección inicial que abarca la totalidad de la canción.
 */
export function createInitialSection(
  durationMs: number,
  initialLaneMapState: LaneMapState,
): UiTimelineSection[] {
  return [
    {
      id: "sec-1",
      name: "Sección 1",
      startMs: 0,
      endMs: Math.max(durationMs, 1000),
      laneMapState: initialLaneMapState,
      color: SECTION_COLORS[0],
    },
  ];
}

/**
 * Divide la sección activa en el milisegundo `cutTimeMs`, creando una nueva sección.
 */
export function splitSectionAt(
  sections: readonly UiTimelineSection[],
  cutTimeMs: number,
  durationMs: number,
): { newSections: UiTimelineSection[]; createdSectionId: string | null } {
  if (cutTimeMs <= 0 || cutTimeMs >= durationMs) {
    return { newSections: [...sections], createdSectionId: null };
  }

  // Si no hay secciones, crear desde 0 hasta cutTimeMs y cutTimeMs a durationMs
  if (sections.length === 0) {
    const id1 = `sec-${Date.now()}-1`;
    const id2 = `sec-${Date.now()}-2`;
    return {
      newSections: [
        {
          id: id1,
          name: "Sección 1",
          startMs: 0,
          endMs: cutTimeMs,
          laneMapState: [[0, 1], [2, 3], [4], [5, 6]],
          color: SECTION_COLORS[0],
        },
        {
          id: id2,
          name: "Sección 2",
          startMs: cutTimeMs,
          endMs: durationMs,
          laneMapState: [[0, 1], [2, 3], [4], [5, 6]],
          color: SECTION_COLORS[1],
        },
      ],
      createdSectionId: id2,
    };
  }

  // Buscar qué sección contiene el punto de corte
  const targetIndex = sections.findIndex(
    (sec) => cutTimeMs > sec.startMs + 50 && cutTimeMs < sec.endMs - 50,
  );

  if (targetIndex === -1) {
    return { newSections: [...sections], createdSectionId: null };
  }

  const targetSection = sections[targetIndex]!;
  const newId = `sec-${Date.now()}`;
  const nextColor = SECTION_COLORS[(sections.length) % SECTION_COLORS.length];

  const leftSection: UiTimelineSection = {
    ...targetSection,
    endMs: cutTimeMs,
  };

  const rightSection: UiTimelineSection = {
    id: newId,
    name: `Sección ${sections.length + 1}`,
    startMs: cutTimeMs,
    endMs: targetSection.endMs,
    laneMapState: targetSection.laneMapState,
    presetId: targetSection.presetId,
    presetName: targetSection.presetName,
    color: nextColor,
  };

  const nextSections = [
    ...sections.slice(0, targetIndex),
    leftSection,
    rightSection,
    ...sections.slice(targetIndex + 1),
  ];

  return { newSections: nextSections, createdSectionId: newId };
}

/**
 * Elimina una sección y la fusiona con la sección adyacente.
 */
export function deleteSection(
  sections: readonly UiTimelineSection[],
  sectionIdToDelete: string,
): UiTimelineSection[] {
  if (sections.length <= 1) {
    return [...sections];
  }

  const index = sections.findIndex((s) => s.id === sectionIdToDelete);
  if (index === -1) return [...sections];

  const toDelete = sections[index]!;

  if (index > 0) {
    // Fusionar hacia la izquierda
    const prev = sections[index - 1]!;
    const updatedPrev: UiTimelineSection = {
      ...prev,
      endMs: toDelete.endMs,
    };
    return [
      ...sections.slice(0, index - 1),
      updatedPrev,
      ...sections.slice(index + 1),
    ];
  } else {
    // Es la primera: fusionar con la siguiente
    const next = sections[1]!;
    const updatedNext: UiTimelineSection = {
      ...next,
      startMs: toDelete.startMs,
    };
    return [updatedNext, ...sections.slice(2)];
  }
}
/**
 * Actualiza el punto de corte (límite común) entre dos secciones adyacentes.
 */
export function updateSectionBoundary(
  sections: readonly UiTimelineSection[],
  leftSectionIndex: number,
  newCutTimeMs: number,
): UiTimelineSection[] {
  if (leftSectionIndex < 0 || leftSectionIndex >= sections.length - 1) {
    return [...sections];
  }

  const left = sections[leftSectionIndex]!;
  const right = sections[leftSectionIndex + 1]!;

  // Limitar para que cada sección tenga al menos 100 ms de duración
  const minTime = left.startMs + 100;
  const maxTime = right.endMs - 100;
  const clampedCutTime = Math.max(minTime, Math.min(maxTime, newCutTimeMs));

  const updatedLeft: UiTimelineSection = {
    ...left,
    endMs: clampedCutTime,
  };

  const updatedRight: UiTimelineSection = {
    ...right,
    startMs: clampedCutTime,
  };

  return [
    ...sections.slice(0, leftSectionIndex),
    updatedLeft,
    updatedRight,
    ...sections.slice(leftSectionIndex + 2),
  ];
}
/**
 * Clave única y determinista para identificar un mapa y dificultad específica.
 */
export function getMapStorageKey(
  sourcePath: string | null,
  fileName: string | null,
  artist?: string,
  title?: string,
  version?: string,
): string {
  if (sourcePath) {
    return `4to7_sections_${sourcePath.replace(/\\/g, "/")}`;
  }
  if (artist && title && version) {
    return `4to7_sections_${artist}_${title}_${version}`;
  }
  return `4to7_sections_${fileName ?? "unknown"}`;
}

/**
 * Guarda las secciones de tiempo asociadas a un mapa y dificultad en LocalStorage.
 */
export function saveMapSections(key: string, sections: readonly UiTimelineSection[]): void {
  try {
    if (sections.length === 0) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(sections));
  } catch (err) {
    console.error("Error al guardar secciones del mapa:", err);
  }
}

/**
 * Carga las secciones de tiempo previamente guardadas para este mapa y dificultad.
 */
export function loadMapSections(key: string): UiTimelineSection[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as UiTimelineSection[];
    }
    return null;
  } catch (err) {
    console.error("Error al cargar secciones del mapa:", err);
    return null;
  }
}
