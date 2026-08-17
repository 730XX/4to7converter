import { ConversionError, ConversionErrorCode } from "./errors.js";

/**
 * Mapeo de columnas para convertir un beatmap de osu!mania a otra cantidad
 * de teclas: cada columna fuente puede proyectarse a una o más columnas destino.
 */
export interface LaneMap {
  /**
   * Columnas destino por columna fuente. El índice i guarda las columnas
   * destino de la columna fuente i; el orden de cada arreglo interno se
   * conserva en la proyección de las notas.
   */
  sourceColumnToTargetColumns: readonly (readonly number[])[];
}

/**
 * Crea un {@link LaneMap} validándolo contra la cantidad de teclas destino.
 *
 * @param sourceColumnToTargetColumns - Columnas destino por columna fuente.
 * @param targetKeyCount - Cantidad de teclas del beatmap destino.
 * @returns El lane map validado.
 * @throws {ConversionError} Con un código numérico estable cuando el mapeo es inválido.
 */
export function createLaneMap(
  sourceColumnToTargetColumns: readonly (readonly number[])[],
  targetKeyCount: number,
): LaneMap {
  assertValidLaneMap(sourceColumnToTargetColumns, targetKeyCount);
  return { sourceColumnToTargetColumns };
}

/**
 * Valida un lane map contra la cantidad de teclas destino. Lanza
 * {@link ConversionError} cuando una columna fuente no tiene columnas destino,
 * cuando una columna destino no es entera o queda fuera de rango, o cuando una
 * columna destino se repite dentro de la misma columna fuente.
 *
 * @param sourceColumnToTargetColumns - Columnas destino por columna fuente.
 * @param targetKeyCount - Cantidad de teclas del beatmap destino.
 * @throws {ConversionError} Con un código numérico estable cuando el mapeo es inválido.
 */
export function assertValidLaneMap(
  sourceColumnToTargetColumns: readonly (readonly number[])[],
  targetKeyCount: number,
): void {
  for (const [sourceColumn, targetColumns] of sourceColumnToTargetColumns.entries()) {
    assertTargetColumnsPresent(targetColumns, sourceColumn);
    assertTargetColumnsInRange(targetColumns, sourceColumn, targetKeyCount);
    assertTargetColumnsUnique(targetColumns, sourceColumn);
  }
}

/** Verifica que la columna fuente tenga al menos una columna destino. */
function assertTargetColumnsPresent(targetColumns: readonly number[], sourceColumn: number): void {
  if (targetColumns.length === 0) {
    throw new ConversionError(
      ConversionErrorCode.EmptyLaneMapping,
      `Source column ${sourceColumn} maps to no target column.`,
    );
  }
}

/** Verifica que cada columna destino sea entera y esté dentro de 0..targetKeyCount-1. */
function assertTargetColumnsInRange(
  targetColumns: readonly number[],
  sourceColumn: number,
  targetKeyCount: number,
): void {
  for (const targetColumn of targetColumns) {
    if (!Number.isInteger(targetColumn) || targetColumn < 0 || targetColumn >= targetKeyCount) {
      throw new ConversionError(
        ConversionErrorCode.TargetColumnOutOfRange,
        `Source column ${sourceColumn} maps to target column ${targetColumn}, which is outside the valid range 0..${
          targetKeyCount - 1
        }.`,
      );
    }
  }
}

/** Verifica que ninguna columna destino se repita dentro de la misma columna fuente. */
function assertTargetColumnsUnique(targetColumns: readonly number[], sourceColumn: number): void {
  const seenColumns = new Set<number>();
  for (const targetColumn of targetColumns) {
    if (seenColumns.has(targetColumn)) {
      throw new ConversionError(
        ConversionErrorCode.DuplicateTargetColumn,
        `Source column ${sourceColumn} maps to target column ${targetColumn} more than once.`,
      );
    }
    seenColumns.add(targetColumn);
  }
}
