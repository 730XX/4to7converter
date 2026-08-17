import type { HitObject, OsuBeatmap } from "../osu/types.js";
import { ConversionError, ConversionErrorCode } from "./errors.js";
import { assertValidLaneMap, type LaneMap } from "./lane-map.js";

/** Opciones para convertir un beatmap de osu!mania a otra cantidad de teclas. */
export interface ConvertBeatmapOptions {
  /** Lane map que proyecta cada columna fuente a una o más columnas destino. */
  laneMap: LaneMap;
  /** Cantidad de teclas del beatmap destino. */
  targetKeyCount: number;
}

/**
 * Convierte un beatmap de osu!mania proyectando cada nota a través del lane map.
 *
 * La división se aplica por nota: cada nota fuente genera una copia por
 * columna destino, incluidas las notas dentro de un acorde y las hold notes.
 * El resultado se ordena por tiempo, columna y tipo.
 *
 * @param beatmap - El beatmap de origen a convertir.
 * @param options - Opciones de conversión con el lane map y las teclas destino.
 * @returns Un nuevo beatmap con la cantidad de teclas destino y las notas proyectadas.
 * @throws {ConversionError} Con un código numérico estable cuando el lane map es inválido.
 */
export function convertBeatmap(beatmap: OsuBeatmap, options: ConvertBeatmapOptions): OsuBeatmap {
  assertValidLaneMap(options.laneMap.sourceColumnToTargetColumns, options.targetKeyCount);

  const hitObjects = beatmap.hitObjects
    .flatMap((hitObject) => projectHitObject(hitObject, options.laneMap))
    .sort(compareHitObjects);

  return {
    ...beatmap,
    keyCount: options.targetKeyCount,
    hitObjects,
  };
}

/**
 * Proyecta un hit object fuente a sus copias por columna destino.
 *
 * Cuando la columna fuente no tiene entrada en el lane map (o su lista está
 * vacía) lanza {@link ConversionError}. En caso contrario devuelve una copia
 * por columna destino preservando tiempo, tipo, tiempo de fin, hit sound y hit
 * sample; solo cambia la columna.
 *
 * @param hitObject - El hit object fuente a proyectar.
 * @param laneMap - El lane map que define las columnas destino.
 * @returns Una copia del hit object por cada columna destino.
 * @throws {ConversionError} Con código {@link ConversionErrorCode.EmptyLaneMapping}
 * cuando la columna fuente no tiene columnas destino.
 */
function projectHitObject(hitObject: HitObject, laneMap: LaneMap): HitObject[] {
  const targetColumns = laneMap.sourceColumnToTargetColumns[hitObject.column];
  if (targetColumns === undefined || targetColumns.length === 0) {
    throw new ConversionError(
      ConversionErrorCode.EmptyLaneMapping,
      `Source column ${hitObject.column} maps to no target column.`,
    );
  }

  return targetColumns.map((column) => ({
    column,
    timeMs: hitObject.timeMs,
    type: hitObject.type,
    endTimeMs: hitObject.endTimeMs,
    hitSound: hitObject.hitSound,
    hitSample: hitObject.hitSample,
  }));
}

/**
 * Compara dos hit objects para ordenarlos por tiempo, luego columna y luego tipo.
 *
 * @param first - El primer hit object a comparar.
 * @param second - El segundo hit object a comparar.
 * @returns Un número negativo, cero o positivo según el orden relativo.
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
