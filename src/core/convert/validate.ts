import type { HitObject, OsuBeatmap } from "../osu/types.js";
import { compareHitObjects } from "./engine.js";

/** Nivel de severidad de un {@link ConversionIssue}. */
export type IssueSeverity = "error" | "warning";

/** Problema detectado en un beatmap convertido, mostrado al usuario en la UI. */
export interface ConversionIssue {
  /** Nivel de severidad: error (nota inválida) o advertencia (nota conflictiva). */
  severity: IssueSeverity;
  /** Código numérico estable del problema. */
  code: number;
  /** Mensaje legible que describe el problema. */
  message: string;
  /** Tiempo del hit object involucrado, o null cuando no aplica. */
  timeMs: number | null;
  /** Columna del hit object involucrado, o null cuando no aplica. */
  column: number | null;
}

/** Códigos numéricos estables para problemas de validación, mostrados al usuario en la UI. */
export const ConversionIssueCode = {
  /** Dos o más notas comparten el mismo (timeMs, column). */
  DuplicateNote: 3001,
  /** Una nota empieza dentro de una hold note de la misma columna. */
  HoldOverlap: 3002,
  /** Una nota queda en una columna fuera del rango 0..keyCount-1. */
  ColumnOutOfRange: 3003,
} as const;

/**
 * Valida un beatmap convertido y devuelve los problemas encontrados.
 *
 * La validación se ejecuta sobre una copia ordenada por tiempo y columna.
 * Reporta errores para notas duplicadas o fuera de rango, y advertencias para
 * notas que empiezan dentro de una hold note de la misma columna.
 *
 * @param beatmap - El beatmap convertido a validar.
 * @returns Los problemas encontrados, ordenados por tiempo, columna y código.
 */
export function validateConvertedBeatmap(beatmap: OsuBeatmap): ConversionIssue[] {
  const issues: ConversionIssue[] = [];
  const activeHolds: HitObject[] = [];
  const seenNotes = new Set<string>();
  const sortedHitObjects = [...beatmap.hitObjects].sort(compareHitObjects);

  for (const hitObject of sortedHitObjects) {
    pruneExpiredHolds(activeHolds, hitObject.timeMs);
    collectColumnOutOfRange(issues, hitObject, beatmap.keyCount);
    collectDuplicates(issues, hitObject, seenNotes);
    collectHoldOverlaps(issues, hitObject, activeHolds);
    if (hitObject.endTimeMs !== null) {
      activeHolds.push(hitObject);
    }
  }

  return issues.sort(compareIssues);
}

/** Elimina de las hold notes activas las que terminaron antes o en el tiempo dado. */
function pruneExpiredHolds(activeHolds: HitObject[], timeMs: number): void {
  for (let index = activeHolds.length - 1; index >= 0; index -= 1) {
    const hold = activeHolds[index];
    if (hold !== undefined && hold.endTimeMs !== null && hold.endTimeMs <= timeMs) {
      activeHolds.splice(index, 1);
    }
  }
}

/** Reporta un error 3003 cuando la columna de la nota queda fuera del rango válido. */
function collectColumnOutOfRange(
  issues: ConversionIssue[],
  hitObject: HitObject,
  keyCount: number,
): void {
  if (!Number.isInteger(hitObject.column) || hitObject.column < 0 || hitObject.column >= keyCount) {
    issues.push({
      severity: "error",
      code: ConversionIssueCode.ColumnOutOfRange,
      message: `La nota en ${hitObject.timeMs} ms está en la columna ${hitObject.column}, fuera del rango válido 0..${keyCount - 1}.`,
      timeMs: hitObject.timeMs,
      column: hitObject.column,
    });
  }
}

/** Reporta un error 3001 cuando ya existe una nota con el mismo (timeMs, column). */
function collectDuplicates(
  issues: ConversionIssue[],
  hitObject: HitObject,
  seenNotes: Set<string>,
): void {
  const noteKey = `${hitObject.timeMs}:${hitObject.column}`;
  if (seenNotes.has(noteKey)) {
    issues.push({
      severity: "error",
      code: ConversionIssueCode.DuplicateNote,
      message: `Varias notas comparten el tiempo ${hitObject.timeMs} ms en la columna ${hitObject.column}.`,
      timeMs: hitObject.timeMs,
      column: hitObject.column,
    });
  }
  seenNotes.add(noteKey);
}

/** Reporta una advertencia 3002 cuando la nota empieza dentro de una hold note activa. */
function collectHoldOverlaps(
  issues: ConversionIssue[],
  hitObject: HitObject,
  activeHolds: HitObject[],
): void {
  for (const hold of activeHolds) {
    if (
      hold.endTimeMs === null ||
      hold.column !== hitObject.column ||
      hitObject.timeMs >= hold.endTimeMs
    ) {
      continue;
    }
    issues.push({
      severity: "warning",
      code: ConversionIssueCode.HoldOverlap,
      message: `La nota en ${hitObject.timeMs} ms se superpone con una hold note en la columna ${hold.column} que termina en ${hold.endTimeMs} ms.`,
      timeMs: hitObject.timeMs,
      column: hitObject.column,
    });
  }
}

/** Compara dos problemas para ordenarlos por tiempo, columna y código. */
function compareIssues(first: ConversionIssue, second: ConversionIssue): number {
  const timeOrder = (first.timeMs ?? -Infinity) - (second.timeMs ?? -Infinity);
  if (timeOrder !== 0) {
    return timeOrder;
  }
  const columnOrder = (first.column ?? -Infinity) - (second.column ?? -Infinity);
  if (columnOrder !== 0) {
    return columnOrder;
  }
  return first.code - second.code;
}
