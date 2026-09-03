import type { TimingPoint } from "../../../src/core/osu/types";

export interface SpeedTimelineState {
  bpm: number;
  svMultiplier: number;
  mode: "bpm" | "sv" | "stop" | "invalid";
}

export type SpeedTimelineEventKind = "bpm" | "sv" | "stop" | "invalid";

export interface SpeedTimelineEvent {
  timeMs: number;
  kind: SpeedTimelineEventKind;
  value: number | null;
  state: SpeedTimelineState;
  ordinal: number;
}

export interface SpeedTimeline {
  speedAt(timeMs: number): number;
  distanceBetween(startMs: number, endMs: number): number;
  stateAt(timeMs: number): SpeedTimelineState;
  eventsBetween(startMs?: number, endMs?: number): SpeedTimelineEvent[];
  readonly events: readonly SpeedTimelineEvent[];
  readonly referenceBpm: number | null;
  readonly hasStops: boolean;
  /** Maximum visual speed factor across the entire timeline (for worst-case window calculations). */
  readonly maxSpeedFactor: number;
}

const DEFAULT_STATE: SpeedTimelineState = { bpm: 0, svMultiplier: 1, mode: "invalid" };

interface SpeedSegment {
  startMs: number;
  state: SpeedTimelineState;
  factor: number;
  distanceAtStart: number;
}

function upperBound<T>(items: readonly T[], value: number, getValue: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (getValue(items[middle]!) <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** First index where getValue(item) >= value. */
function lowerBound<T>(items: readonly T[], value: number, getValue: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (getValue(items[middle]!) < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function finiteTime(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * Construye la línea temporal visual de BPM y SV.
 * Los puntos inválidos se conservan como eventos informativos, pero no cambian
 * el estado anterior. Un punto heredado nunca se interpreta como BPM.
 */
export function buildSpeedTimeline(timingPoints: TimingPoint[]): SpeedTimeline {
  const sorted = (timingPoints ?? [])
    .filter((point) => finiteTime(point.offsetMs))
    .map((point, index) => ({ point, index }))
    .sort((a, b) => a.point.offsetMs - b.point.offsetMs || a.index - b.index);

  const firstBpmPoint = sorted.find(
    ({ point }) => point.uninherited && Number.isFinite(point.beatLength) && point.beatLength > 0,
  );
  const referenceBpm = firstBpmPoint ? 60000 / firstBpmPoint.point.beatLength : null;
  let state: SpeedTimelineState = {
    bpm: referenceBpm ?? 0,
    svMultiplier: 1,
    mode: referenceBpm ? "bpm" : "invalid",
  };
  const events: SpeedTimelineEvent[] = [];

  for (const { point } of sorted) {
    const isBpm = point.uninherited;
    const isSv = !point.uninherited;
    
    // En osu!mania los mappers usan beatLength <= 0 en puntos uninherited (rojos),
    // o BPMs inferiores a 2 (beatLength > 30000), para generar stops o congelamientos.
    const isExplicitStop = isBpm && Number.isFinite(point.beatLength) && point.beatLength <= 0;
    const isValidPositiveBpm = isBpm && Number.isFinite(point.beatLength) && point.beatLength > 0;
    const isValidSv = isSv && Number.isFinite(point.beatLength) && point.beatLength < 0;

    if (isExplicitStop) {
      state = { ...state, bpm: 0, mode: "stop" };
      events.push({ timeMs: point.offsetMs, kind: "stop", value: 0, state, ordinal: events.length });
    } else if (isValidPositiveBpm) {
      const calculatedBpm = 60000 / point.beatLength;
      if (calculatedBpm < 2) {
        // Truco de mappers: BPM casi 0 (ej: 0.1 o 1 BPM) para congelar la pantalla
        state = { ...state, bpm: calculatedBpm, mode: "stop" };
        events.push({ timeMs: point.offsetMs, kind: "stop", value: calculatedBpm, state, ordinal: events.length });
      } else {
        state = { ...state, bpm: calculatedBpm, mode: "bpm" };
        events.push({ timeMs: point.offsetMs, kind: "bpm", value: state.bpm, state, ordinal: events.length });
      }
    } else if (isValidSv) {
      state = { ...state, svMultiplier: 100 / Math.abs(point.beatLength) };
      state = { ...state, mode: "sv" };
      events.push({ timeMs: point.offsetMs, kind: "sv", value: state.svMultiplier, state, ordinal: events.length });
    } else {
      events.push({ timeMs: point.offsetMs, kind: "invalid", value: null, state, ordinal: events.length });
    }
  }

  const initialState: SpeedTimelineState = {
    bpm: referenceBpm ?? 0,
    svMultiplier: 1,
    mode: referenceBpm ? "bpm" : "invalid",
  };
  const eventTimes = [...new Set(events.map((event) => event.timeMs))];
  const segments: SpeedSegment[] = [];
  let distanceAtStart = 0;
  let previousTime = eventTimes[0] ?? 0;
  let previousState = initialState;

  for (let index = 0; index < eventTimes.length; index += 1) {
    const timeMs = eventTimes[index]!;
    if (index > 0) {
      distanceAtStart += (timeMs - previousTime) * visualFactor(previousState, referenceBpm);
    }
    const lastEventIndex = upperBound(events, timeMs, (event) => event.timeMs) - 1;
    previousState = lastEventIndex >= 0 ? events[lastEventIndex]!.state : initialState;
    segments.push({
      startMs: timeMs,
      state: previousState,
      factor: visualFactor(previousState, referenceBpm),
      distanceAtStart,
    });
    previousTime = timeMs;
  }

  const cumulativeDistanceAt = (timeMs: number): number => {
    if (!finiteTime(timeMs)) return 0;
    if (segments.length === 0 || timeMs < segments[0]!.startMs) {
      return (timeMs - (segments[0]?.startMs ?? 0)) * visualFactor(initialState, referenceBpm);
    }
    const index = Math.min(
      segments.length - 1,
      upperBound(segments, timeMs, (segment) => segment.startMs) - 1,
    );
    const segment = segments[index]!;
    return segment.distanceAtStart + (timeMs - segment.startMs) * segment.factor;
  };

  const stateAt = (timeMs: number): SpeedTimelineState => {
    if (!finiteTime(timeMs)) return { ...DEFAULT_STATE, ...initialState };
    if (segments.length === 0 || timeMs < segments[0]!.startMs) return initialState;
    return segments[Math.min(segments.length - 1, upperBound(segments, timeMs, (segment) => segment.startMs) - 1)]!.state;
  };

  const speedAt = (timeMs: number): number => {
    return visualFactor(stateAt(timeMs), referenceBpm);
  };

  const distanceBetween = (startMs: number, endMs: number): number => {
    if (!finiteTime(startMs) || !finiteTime(endMs) || startMs === endMs) return 0;
    return cumulativeDistanceAt(endMs) - cumulativeDistanceAt(startMs);
  };

  // Precompute max speed factor across all segments for worst-case window calculations
  let maxFactor = 1;
  for (const seg of segments) {
    if (seg.factor > maxFactor) maxFactor = seg.factor;
  }
  const computedHasStops = events.some((event) => event.kind === "stop");

  return {
    speedAt,
    distanceBetween,
    stateAt,
    eventsBetween: (startMs = -Infinity, endMs = Infinity) => {
      if (events.length === 0) return [];
      const from = lowerBound(events, startMs, (e) => e.timeMs);
      const to = upperBound(events, endMs, (e) => e.timeMs);
      return events.slice(from, to);
    },
    events,
    referenceBpm,
    hasStops: computedHasStops,
    maxSpeedFactor: maxFactor,
  };
}

function visualFactor(state: SpeedTimelineState, referenceBpm: number | null): number {
  if (state.mode === "stop") return 0;
  const bpmFactor = referenceBpm && state.bpm > 0 ? state.bpm / referenceBpm : 1;
  const factor = bpmFactor * state.svMultiplier;
  return Number.isFinite(factor) && factor >= 0 ? factor : 1;
}
