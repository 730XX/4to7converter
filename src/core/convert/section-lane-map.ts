import type { LaneMap } from "./lane-map.js";

/**
 * Representa una sección temporal dentro del beatmap con un mapeo de carriles específico.
 */
export interface LaneMapSection {
  id: string;
  name: string; // ej: "Sección 1", "Verso 1", "Drop", etc.
  startMs: number;
  endMs: number;
  laneMap: LaneMap;
  presetId?: string | null;
}

/**
 * Busca el LaneMap correspondiente a un tiempo dado en milisegundos.
 * Si el tiempo no cae dentro de ninguna sección, retorna el fallbackLaneMap principal para todo el mapa.
 */
export function findLaneMapForTime(
  timeMs: number,
  sections: readonly LaneMapSection[],
  fallbackLaneMap: LaneMap,
): LaneMap {
  for (const section of sections) {
    if (timeMs >= section.startMs && timeMs < section.endMs) {
      return section.laneMap;
    }
  }
  return fallbackLaneMap;
}
