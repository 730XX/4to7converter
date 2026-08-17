import type { LaneMap } from "../../../src/core/convert/lane-map";

/**
 * Estado del mapeo de carriles en la interfaz: para cada columna fuente, la
 * lista de columnas destino. Tiene exactamente la misma forma que
 * {@link LaneMap.sourceColumnToTargetColumns} del motor de conversión.
 */
export type LaneMapState = readonly (readonly number[])[];

/**
 * Crea el estado de mapeo por defecto de la conversión 4k a 7k: el carril 1 se
 * proyecta a los carriles 1-2, el carril 2 a los 3-4, el carril 3 al 5 y el
 * carril 4 a los 6-7. Los índices están basados en cero.
 *
 * @returns El estado de mapeo por defecto.
 */
export function createDefaultLaneMapState(): LaneMapState {
  return [[0, 1], [2, 3], [4], [5, 6]];
}

/**
 * Genera un mapeo aleatorio válido garantizando:
 * 1. Cada carril fuente (1..sourceKeyCount) tiene al menos un destino (cero vacíos).
 * 2. Cada carril de destino (1..targetKeyCount) queda asignado exactamente a un carril fuente (distribución completa).
 */
export function generateRandomLaneMapState(
  sourceKeyCount: number = 4,
  targetKeyCount: number = 7,
): LaneMapState {
  const targetPool: number[] = Array.from({ length: targetKeyCount }, (_, i) => i);
  // Barajar usando Fisher-Yates
  for (let i = targetPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tempI = targetPool[i];
    const tempJ = targetPool[j];
    if (tempI !== undefined && tempJ !== undefined) {
      targetPool[i] = tempJ;
      targetPool[j] = tempI;
    }
  }

  const result: number[][] = Array.from({ length: sourceKeyCount }, () => []);

  // Paso 1: Asegurar que cada carril fuente tenga al menos 1 destino
  for (let s = 0; s < sourceKeyCount; s++) {
    const target = targetPool.pop();
    const row = result[s];
    if (target !== undefined && row !== undefined) {
      row.push(target);
    }
  }

  // Paso 2: Distribuir los destinos restantes aleatoriamente entre los carriles fuente
  while (targetPool.length > 0) {
    const target = targetPool.pop();
    if (target !== undefined) {
      const randomSource = Math.floor(Math.random() * sourceKeyCount);
      const row = result[randomSource];
      if (row !== undefined) {
        row.push(target);
      }
    }
  }

  // Ordenar columnas destino en cada fila para claridad visual
  return result.map((cols) => cols.sort((a, b) => a - b));
}

/**
 * Alterna la presencia de una columna destino dentro de una columna fuente y
 * devuelve un nuevo estado inmutable. Si el cambio dejaría la columna fuente
 * sin ninguna columna destino, la operación se ignora y se devuelve el mismo
 * estado (no-op).
 *
 * @param state - El estado de mapeo actual.
 * @param sourceColumn - Índice de la columna fuente a modificar.
 * @param targetColumn - Índice de la columna destino a alternar.
 * @returns El nuevo estado de mapeo, o el mismo cuando el cambio es inválido.
 */
export function toggleTargetColumn(
  state: LaneMapState,
  sourceColumn: number,
  targetColumn: number,
): LaneMapState {
  const sourceTargets = state[sourceColumn] ?? [];
  if (sourceTargets.includes(targetColumn)) {
    if (sourceTargets.length === 1) {
      return state;
    }
    const nextTargets = sourceTargets.filter((column) => column !== targetColumn);
    return state.map((targets, index) => (index === sourceColumn ? nextTargets : targets));
  }

  // Si otra fila ya tiene esta columna destino y es su única columna, no podemos robarla
  for (let index = 0; index < state.length; index++) {
    if (index !== sourceColumn) {
      const targets = state[index] ?? [];
      if (targets.includes(targetColumn) && targets.length === 1) {
        return state;
      }
    }
  }

  // Agregamos a la fila actual y removemos de cualquier otra fila que la tenga
  return state.map((targets, index) => {
    if (index === sourceColumn) {
      return [...targets, targetColumn].sort((a, b) => a - b);
    }
    return targets.filter((col) => col !== targetColumn);
  });
}

/**
 * Verifica si una columna fuente se proyecta a una columna destino dada.
 *
 * @param state - El estado de mapeo actual.
 * @param sourceColumn - Índice de la columna fuente.
 * @param targetColumn - Índice de la columna destino.
 * @returns true cuando la columna destino está presente en la columna fuente.
 */
export function hasTargetColumn(
  state: LaneMapState,
  sourceColumn: number,
  targetColumn: number,
): boolean {
  const sourceTargets = state[sourceColumn];
  return sourceTargets !== undefined && sourceTargets.includes(targetColumn);
}

/**
 * Cuenta, por cada columna destino, cuántas columnas fuente se proyectan a ella.
 * Una cuenta mayor o igual a dos indica una colisión de carriles.
 *
 * @param state - El estado de mapeo actual.
 * @param targetKeyCount - Cantidad de columnas destino del beatmap.
 * @returns Un arreglo con la cantidad de fuentes por cada columna destino.
 */
export function getTargetColumnCounts(state: LaneMapState, targetKeyCount: number): number[] {
  const counts = new Array<number>(targetKeyCount).fill(0);
  for (const sourceTargets of state) {
    for (const targetColumn of sourceTargets) {
      if (targetColumn >= 0 && targetColumn < targetKeyCount) {
        counts[targetColumn] = (counts[targetColumn] ?? 0) + 1;
      }
    }
  }
  return counts;
}

/**
 * Adapta el estado de la interfaz al tipo {@link LaneMap} del motor, para
 * poder pasárselo a {@link convertBeatmap}.
 *
 * @param state - El estado de mapeo de la interfaz.
 * @returns El lane map equivalente para el motor de conversión.
 */
export function toLaneMap(state: LaneMapState): LaneMap {
  return { sourceColumnToTargetColumns: state };
}
