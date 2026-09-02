import type { HitObject } from "../../../src/core/osu/types";
import type { SpeedTimeline } from "./speed-timeline";

/** Margen de visibilidad en píxeles por encima y por debajo del playfield. */
const VISIBILITY_MARGIN = 40;

/**
 * Métricas del playfield necesarias para proyectar notas en pantalla.
 */
export interface PlayfieldMetrics {
  width: number;
  height: number;
  hitLineY: number;
  topPadding: number;
  approachMs: number;
}

/**
 * Calcula la coordenada Y de una nota según su tiempo de impacto y el reloj
 * actual. Las notas futuras quedan por encima de la línea de golpe y las
 * pasadas, debajo.
 *
 * @param hitTimeMs - Tiempo de impacto de la nota en milisegundos.
 * @param currentTimeMs - Tiempo actual del reloj maestro en milisegundos.
 * @param hitLineY - Coordenada Y de la línea de golpe.
 * @param speedPxPerMs - Velocidad de desplazamiento en píxeles por milisegundo.
 * @returns La coordenada Y en la que debe dibujarse la nota.
 */
export function getNoteY(
  hitTimeMs: number,
  currentTimeMs: number,
  hitLineY: number,
  speedPxPerMs: number,
  scrollDirection: "down" | "up" = "down",
  speedTimeline?: SpeedTimeline,
): number {
  const diff = speedTimeline
    ? speedTimeline.distanceBetween(currentTimeMs, hitTimeMs) * speedPxPerMs
    : (hitTimeMs - currentTimeMs) * speedPxPerMs;
  return scrollDirection === "down" ? hitLineY - diff : hitLineY + diff;
}

export function getHoldEndY(
  endTimeMs: number,
  currentTimeMs: number,
  hitLineY: number,
  speedPxPerMs: number,
  scrollDirection: "down" | "up" = "down",
  speedTimeline?: SpeedTimeline,
): number {
  const diff = speedTimeline
    ? speedTimeline.distanceBetween(currentTimeMs, endTimeMs) * speedPxPerMs
    : (endTimeMs - currentTimeMs) * speedPxPerMs;
  return scrollDirection === "down" ? hitLineY - diff : hitLineY + diff;
}

/**
 * Verifica si una nota (o, en el caso de una hold note, cualquiera de sus
 * extremos) cae dentro de los límites verticales dados.
 *
 * @param noteY - Coordenada Y del golpe de la nota.
 * @param endY - Coordenada Y del final de la nota, o null para notas normales.
 * @param topBound - Límite superior de visibilidad.
 * @param bottomBound - Límite inferior de visibilidad.
 * @returns true cuando la cabeza o la cola de la nota está dentro de los límites.
 */
export function isNoteVisible(
  noteY: number,
  endY: number | null,
  topBound: number,
  bottomBound: number,
): boolean {
  if (endY === null) {
    return noteY >= topBound && noteY <= bottomBound;
  }
  const noteTop = Math.min(noteY, endY);
  const noteBottom = Math.max(noteY, endY);
  // Se solapa si el extremo inferior de la nota está por debajo del límite superior
  // Y el extremo superior de la nota está por encima del límite inferior
  return noteBottom >= topBound && noteTop <= bottomBound;
}

/**
 * Filtra los hit objects que deben dibujarse en un instante dado. La velocidad
 * de desplazamiento deriva de las métricas (línea de golpe, padding superior y
 * tiempo de aproximación) y se considera visible una nota cuya cabeza o cola
 * esté dentro del playfield con un margen de 40 píxeles en ambos extremos.
 *
 * @param hitObjects - Los hit objects del beatmap a evaluar.
 * @param currentTimeMs - Tiempo actual del reloj maestro en milisegundos.
 * @param metrics - Métricas del playfield.
 * @returns Los hit objects visibles en el instante actual.
 */
export function getVisibleHitObjects(
  hitObjects: HitObject[],
  currentTimeMs: number,
  metrics: PlayfieldMetrics,
  scrollDirection: "down" | "up" = "down",
  speedTimeline?: SpeedTimeline,
): HitObject[] {
  const speedPxPerMs =
    scrollDirection === "down"
      ? (metrics.hitLineY - metrics.topPadding) / metrics.approachMs
      : (metrics.height - metrics.topPadding - metrics.hitLineY) / metrics.approachMs;

  const topBound = -VISIBILITY_MARGIN;
  const bottomBound = metrics.height + VISIBILITY_MARGIN;
  const visible: HitObject[] = [];

  const startIndex = findFirstVisibleNoteIndex(hitObjects, currentTimeMs, metrics, scrollDirection, speedTimeline);

  for (let i = startIndex; i < hitObjects.length; i++) {
    const hitObject = hitObjects[i];
    if (!hitObject) continue;

    const noteY = getNoteY(
      hitObject.timeMs,
      currentTimeMs,
      metrics.hitLineY,
      speedPxPerMs,
      scrollDirection,
      speedTimeline,
    );
    const endY =
      hitObject.endTimeMs === null
        ? null
        : getHoldEndY(
            hitObject.endTimeMs,
            currentTimeMs,
            metrics.hitLineY,
            speedPxPerMs,
            scrollDirection,
            speedTimeline,
          );

    if (isNoteVisible(noteY, endY, topBound, bottomBound)) {
      visible.push(hitObject);
    }
  }

  return visible;
}

/**
 * Encuentra el índice del primer hit object que podría estar visible o activo.
 * Usa búsqueda binaria basada en el `timeMs` para optimizar el bucle de renderizado.
 */
export function findFirstVisibleNoteIndex(
  hitObjects: HitObject[],
  currentTimeMs: number,
  metrics: PlayfieldMetrics,
  _scrollDirection: "down" | "up" = "down",
  speedTimeline?: SpeedTimeline,
): number {
  if (hitObjects.length === 0) return 0;

  // Calculamos el tiempo máximo que una nota podría permanecer en pantalla después de su timeMs.
  // approachMs es el tiempo que tarda desde la cima hasta la línea de golpe.
  // Además, dejamos un margen extra de 2000ms para asegurar que las Long Notes o notas retrasadas no desaparezcan.
  const timeMargin = metrics.approachMs + 2000;
  // STOP puede dejar una nota visible indefinidamente. Las LNs también pueden
  // tener una cabeza muy antigua y una cola todavía visible, así que se conserva
  // el escaneo completo en esos casos para no perder geometría válida.
  if (speedTimeline) {
    if (speedTimeline.hasStops || hitObjects.some((note) => note.endTimeMs !== null)) return 0;

    const lowerDistance = -metrics.hitLineY - VISIBILITY_MARGIN;
    let left = 0;
    let right = hitObjects.length;
    while (left < right) {
      const middle = left + Math.floor((right - left) / 2);
      const note = hitObjects[middle]!;
      if (speedTimeline.distanceBetween(currentTimeMs, note.timeMs) >= lowerDistance) right = middle;
      else left = middle + 1;
    }
    return left;
  }
  const targetTime = currentTimeMs - timeMargin;

  let left = 0;
  let right = hitObjects.length - 1;
  let result = 0;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const note = hitObjects[mid];
    if (!note) break;

    // Para notas LNs muy largas, podríamos fallar si solo buscamos por timeMs.
    // Sin embargo, dado que el margen es amplio (2s), cubrimos la mayoría de casos.
    // En `renderer.ts` las LNs activas se dibujan mediante el set `holdingLnIndices`.
    if (note.timeMs >= targetTime) {
      result = mid; // Este podría ser nuestro candidato, buscamos más a la izquierda
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return result;
}

/**
 * Calcula la coordenada X del centro de una columna dentro del playfield,
 * repartiendo el ancho de forma uniforme entre las teclas.
 *
 * @param column - Índice de la columna basado en cero.
 * @param keyCount - Cantidad de columnas del beatmap.
 * @param playfieldWidth - Ancho del playfield en píxeles.
 * @returns La coordenada X del centro de la columna.
 */
export function getColumnCenterX(column: number, keyCount: number, playfieldWidth: number): number {
  const columnWidth = playfieldWidth / keyCount;
  return columnWidth * column + columnWidth / 2;
}

/**
 * Formatea un tiempo en milisegundos como "m:ss". Los tiempos negativos o no
 * finitos se tratan como cero.
 *
 * @param timeMs - El tiempo a formatear en milisegundos.
 * @returns El tiempo formateado, p. ej. "1:23".
 */
export function formatTimeMs(timeMs: number): string {
  const clamped = Math.max(0, Math.floor(timeMs));
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
