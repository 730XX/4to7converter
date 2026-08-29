/**
 * Manejo y persistencia de métricas de sesión de conversión en localStorage.
 */

const STORAGE_KEY = "osu_4to7_session_metrics";

export interface SessionMetrics {
  totalConverted: number;
  totalNotesRemapped: number;
  totalTimeSavedMinutes: number;
  lastConvertedTitle: string | null;
  lastConvertedAt: number | null;
}

const DEFAULT_METRICS: SessionMetrics = {
  totalConverted: 0,
  totalNotesRemapped: 0,
  totalTimeSavedMinutes: 0,
  lastConvertedTitle: null,
  lastConvertedAt: null,
};

export function loadSessionMetrics(): SessionMetrics {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_METRICS;
    const parsed = JSON.parse(raw) as Partial<SessionMetrics>;
    return {
      ...DEFAULT_METRICS,
      ...parsed,
    };
  } catch {
    return DEFAULT_METRICS;
  }
}

export function recordConversionMetric(
  title: string,
  noteCount: number,
  estimatedSaveMinutes: number = 5,
): SessionMetrics {
  const current = loadSessionMetrics();
  const updated: SessionMetrics = {
    totalConverted: current.totalConverted + 1,
    totalNotesRemapped: current.totalNotesRemapped + Math.max(0, noteCount),
    totalTimeSavedMinutes: current.totalTimeSavedMinutes + estimatedSaveMinutes,
    lastConvertedTitle: title,
    lastConvertedAt: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("No se pudo guardar métricas de sesión:", err);
  }

  return updated;
}
