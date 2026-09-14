import { describe, expect, it } from "vitest";
import {
  canCoalesceLaneHistory,
  createLaneHistoryState,
  LANE_HISTORY_COALESCE_MS,
  LANE_HISTORY_LIMIT,
  pushLaneHistory,
  redoLaneHistory,
  undoLaneHistory,
  type LaneDoc,
} from "./use-lane-doc-history";

/** Construye un documento de carriles mínimo identificable por un marcador. */
function doc(marker: number): LaneDoc {
  return {
    laneMapState: [[marker]],
    sections: [],
    activeSectionId: `section-${marker}`,
    editedBeatmap: null,
  };
}

describe("lane history (pure)", () => {
  it("starts empty", () => {
    const state = createLaneHistoryState();
    expect(state.past).toEqual([]);
    expect(state.future).toEqual([]);
  });

  it("pushes the previous document and clears the future", () => {
    const initial = { past: [], future: [doc(99)] };
    const next = pushLaneHistory(initial, doc(1));
    expect(next.past).toEqual([doc(1)]);
    expect(next.future).toEqual([]);
  });

  it("caps the history at the configured limit", () => {
    let state = createLaneHistoryState();
    for (let i = 0; i < LANE_HISTORY_LIMIT + 10; i += 1) {
      state = pushLaneHistory(state, doc(i));
    }
    expect(state.past).toHaveLength(LANE_HISTORY_LIMIT);
    // El más viejo se descarta: el primero conservado es doc(10).
    expect(state.past[0]).toEqual(doc(10));
  });

  it("does not stack when coalescing but still clears the future", () => {
    const initial = { past: [doc(1)], future: [doc(2)] };
    const next = pushLaneHistory(initial, doc(3), { coalesce: true });
    expect(next.past).toEqual([doc(1)]);
    expect(next.future).toEqual([]);
  });

  it("undoes to the previous document and stores the current one in the future", () => {
    const history = { past: [doc(1), doc(2)], future: [] };
    const result = undoLaneHistory(history, doc(3));
    expect(result).not.toBeNull();
    expect(result?.doc).toEqual(doc(2));
    expect(result?.history.past).toEqual([doc(1)]);
    expect(result?.history.future).toEqual([doc(3)]);
  });

  it("returns null when there is nothing to undo", () => {
    expect(undoLaneHistory(createLaneHistoryState(), doc(1))).toBeNull();
  });

  it("redoes to the next document and stores the current one in the past", () => {
    const history = { past: [doc(1)], future: [doc(3), doc(4)] };
    const result = redoLaneHistory(history, doc(2));
    expect(result).not.toBeNull();
    expect(result?.doc).toEqual(doc(3));
    expect(result?.history.past).toEqual([doc(1), doc(2)]);
    expect(result?.history.future).toEqual([doc(4)]);
  });

  it("returns null when there is nothing to redo", () => {
    expect(redoLaneHistory(createLaneHistoryState(), doc(1))).toBeNull();
  });

  it("coalesces only the same key within the time window", () => {
    const now = 10_000;
    const last = { key: "laneMap", at: now - 100 };
    expect(canCoalesceLaneHistory(last, "laneMap", now)).toBe(true);
    expect(canCoalesceLaneHistory(last, "boundary", now)).toBe(false);
    expect(canCoalesceLaneHistory(last, null, now)).toBe(false);
    expect(canCoalesceLaneHistory(null, "laneMap", now)).toBe(false);
    expect(
      canCoalesceLaneHistory(
        { key: "laneMap", at: now - LANE_HISTORY_COALESCE_MS - 1 },
        "laneMap",
        now,
      ),
    ).toBe(false);
  });
});
