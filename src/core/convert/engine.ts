import type { HitObject, OsuBeatmap } from "../osu/types.js";
import { HIT_TYPE_CIRCLE } from "../osu/types.js";
import { ConversionError, ConversionErrorCode } from "./errors.js";
import { assertValidLaneMap, type LaneMap } from "./lane-map.js";

/** Opciones para convertir un beatmap de osu!mania a otra cantidad de teclas. */
export interface ConvertBeatmapOptions {
  /** Lane map que proyecta cada columna fuente a una o más columnas destino. */
  laneMap: LaneMap;
  /** Cantidad de teclas del beatmap destino. */
  targetKeyCount: number;
  /** Convierte todas las notas largas (Hold Notes / LN) a notas simples (Rice). */
  zeroLn?: boolean;
}

/**
 * Convierte un beatmap de osu!mania proyectando cada nota a través del lane map.
 * Si zeroLn está activo, convierte todas las Hold Notes en Rice notes.
 *
 * @param beatmap - El beatmap de origen a convertir.
 * @param options - Opciones de conversión con el lane map, teclas destino y zeroLn.
 * @returns Un nuevo beatmap con la cantidad de teclas destino y las notas proyectadas.
 * @throws {ConversionError} Con un código numérico estable cuando el lane map es inválido.
 */
export function convertBeatmap(beatmap: OsuBeatmap, options: ConvertBeatmapOptions): OsuBeatmap {
  const { laneMap, targetKeyCount, zeroLn } = options;
  assertValidLaneMap(laneMap.sourceColumnToTargetColumns, targetKeyCount);
  assertLaneMapCoversSourceColumns(beatmap, laneMap);

  const hitObjects = beatmap.hitObjects
    .flatMap((hitObject) => projectHitObject(hitObject, laneMap, zeroLn))
    .sort(compareHitObjects);

  return {
    ...beatmap,
    keyCount: targetKeyCount,
    hitObjects,
  };
}

/**
 * Verifica que el lane map cubra todas las columnas que usa el beatmap fuente
 * antes de proyectar.
 */
function assertLaneMapCoversSourceColumns(beatmap: OsuBeatmap, laneMap: LaneMap): void {
  const coveredSourceColumns = laneMap.sourceColumnToTargetColumns.length;
  let maxUsedColumn = -1;
  for (const hitObject of beatmap.hitObjects) {
    maxUsedColumn = Math.max(maxUsedColumn, hitObject.column);
  }
  if (maxUsedColumn >= coveredSourceColumns) {
    throw new ConversionError(
      ConversionErrorCode.SourceKeyCountMismatch,
      `El beatmap tiene notas en la columna ${maxUsedColumn} pero el lane map solo cubre las columnas 0..${
        coveredSourceColumns - 1
      }. Carga un mapa 4k o proporciona un lane map que lo cubra.`,
    );
  }
}

/**
 * Proyecta un hit object fuente a sus copias por columna destino.
 */
function projectHitObject(hitObject: HitObject, laneMap: LaneMap, zeroLn?: boolean): HitObject[] {
  const targetColumns = laneMap.sourceColumnToTargetColumns[hitObject.column];
  if (targetColumns === undefined || targetColumns.length === 0) {
    throw new ConversionError(
      ConversionErrorCode.EmptyLaneMapping,
      `La columna fuente ${hitObject.column} no tiene columnas destino.`,
    );
  }

  const isZeroLn = Boolean(zeroLn);
  const type = isZeroLn ? HIT_TYPE_CIRCLE : hitObject.type;
  const endTimeMs = isZeroLn ? null : hitObject.endTimeMs;

  return targetColumns.map((column) => ({
    column,
    timeMs: hitObject.timeMs,
    type,
    endTimeMs,
    hitSound: hitObject.hitSound,
    hitSample: hitObject.hitSample,
  }));
}

/**
 * Compara dos hit objects para ordenarlos por tiempo, luego columna y luego tipo.
 */
export function compareHitObjects(first: HitObject, second: HitObject): number {
  if (first.timeMs !== second.timeMs) {
    return first.timeMs - second.timeMs;
  }
  if (first.column !== second.column) {
    return first.column - second.column;
  }
  return first.type - second.type;
}
