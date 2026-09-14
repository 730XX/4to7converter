import { useCallback, useRef, useState } from "react";
import type { OsuBeatmap } from "../../../src/core/osu/types";
import type { LaneMapState } from "./lane-map-state";
import type { UiTimelineSection } from "./timeline-sections";

/**
 * Documento versionable del editor de carriles: el mapeo activo, las secciones
 * temporales y la sección seleccionada se tratan como una sola unidad de historial.
 */
export interface LaneDoc {
  laneMapState: LaneMapState;
  sections: UiTimelineSection[];
  activeSectionId: string | null;
  /**
   * Beatmap 7K derivado con ediciones manuales del usuario (arrastrar notas).
   * Cuando es `null` se usa la conversión derivada; cualquier cambio de mapeo lo
   * descarta y vuelve a la base generada.
   */
  editedBeatmap: OsuBeatmap | null;
}

/** Estado del historial: snapshots anteriores y posteriores al documento actual. */
export interface LaneHistoryState {
  past: LaneDoc[];
  future: LaneDoc[];
}

/** Máximo de pasos de historial conservados. */
export const LANE_HISTORY_LIMIT = 50;

/** Ventana de tiempo (ms) para agrupar ediciones rápidas en un solo paso. */
export const LANE_HISTORY_COALESCE_MS = 400;

/** Crea un historial vacío. */
export function createLaneHistoryState(): LaneHistoryState {
  return { past: [], future: [] };
}

/**
 * Registra el documento previo como nuevo paso de historial.
 * Cuando `coalesce` es true, no apila (la edición rápida pertenece al mismo paso)
 * y solo invalida el futuro.
 */
export function pushLaneHistory(
  state: LaneHistoryState,
  previousDoc: LaneDoc,
  options?: { coalesce?: boolean },
): LaneHistoryState {
  if (options?.coalesce) {
    return { past: state.past, future: [] };
  }
  const past = [...state.past, previousDoc];
  if (past.length > LANE_HISTORY_LIMIT) {
    past.shift();
  }
  return { past, future: [] };
}

/** Deshace un paso. Devuelve el historial y el documento a restaurar, o null si no hay. */
export function undoLaneHistory(
  state: LaneHistoryState,
  currentDoc: LaneDoc,
): { history: LaneHistoryState; doc: LaneDoc } | null {
  if (state.past.length === 0) {
    return null;
  }
  const previous = state.past[state.past.length - 1]!;
  return {
    history: { past: state.past.slice(0, -1), future: [currentDoc, ...state.future] },
    doc: previous,
  };
}

/** Rehace un paso. Devuelve el historial y el documento a restaurar, o null si no hay. */
export function redoLaneHistory(
  state: LaneHistoryState,
  currentDoc: LaneDoc,
): { history: LaneHistoryState; doc: LaneDoc } | null {
  if (state.future.length === 0) {
    return null;
  }
  const next = state.future[0]!;
  return {
    history: { past: [...state.past, currentDoc], future: state.future.slice(1) },
    doc: next,
  };
}

/**
 * Determina si un commit debe agruparse con el anterior: mismo tipo de edición
 * (`key`) dentro de la ventana de coalescing.
 */
export function canCoalesceLaneHistory(
  last: { key: string; at: number } | null,
  key: string | null,
  now: number,
): boolean {
  if (key === null || last === null || last.key !== key) {
    return false;
  }
  return now - last.at < LANE_HISTORY_COALESCE_MS;
}

/**
 * Hook de historial (undo/redo) para el documento del editor de carriles.
 *
 * - `commit(patch, { coalesceKey })`: edición real → apila un paso.
 * - `replace(patch)`: navegación (ej. seleccionar sección) → no apila.
 * - `reset(next)`: carga/cierre de mapa → limpia el historial.
 */
export function useLaneDocHistory(initial: LaneDoc) {
  const [doc, setDoc] = useState<LaneDoc>(initial);
  const [history, setHistory] = useState<LaneHistoryState>(createLaneHistoryState);

  const docRef = useRef(doc);
  docRef.current = doc;
  const historyRef = useRef(history);
  historyRef.current = history;
  const lastCommitRef = useRef<{ key: string; at: number } | null>(null);

  const commit = useCallback((patch: Partial<LaneDoc>, options?: { coalesceKey?: string }) => {
    const now = Date.now();
    const key = options?.coalesceKey ?? null;
    const coalesce = canCoalesceLaneHistory(lastCommitRef.current, key, now);
    const previousDoc = docRef.current;
    lastCommitRef.current = key !== null ? { key, at: now } : null;
    setHistory((prev) => pushLaneHistory(prev, previousDoc, { coalesce }));
    setDoc((prev) => ({ ...prev, ...patch }));
  }, []);

  const replace = useCallback((patch: Partial<LaneDoc>) => {
    setDoc((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback((next: LaneDoc) => {
    lastCommitRef.current = null;
    setHistory(createLaneHistoryState());
    setDoc(next);
  }, []);

  const undo = useCallback(() => {
    const result = undoLaneHistory(historyRef.current, docRef.current);
    if (!result) return;
    lastCommitRef.current = null;
    setHistory(result.history);
    setDoc(result.doc);
  }, []);

  const redo = useCallback(() => {
    const result = redoLaneHistory(historyRef.current, docRef.current);
    if (!result) return;
    lastCommitRef.current = null;
    setHistory(result.history);
    setDoc(result.doc);
  }, []);

  return {
    doc,
    commit,
    replace,
    reset,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
