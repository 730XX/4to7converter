import { describe, expect, it } from "vitest";
import { convertBeatmap } from "../../../src/core/convert/engine";
import type { HitObject, OsuBeatmap } from "../../../src/core/osu/types";
import {
  createDefaultLaneMapState,
  getTargetColumnCounts,
  hasTargetColumn,
  toLaneMap,
  toggleTargetColumn,
  type LaneMapState,
} from "./lane-map-state";

/** Construye un beatmap 4k mínimo con los hit objects dados. */
function buildBeatmap(hitObjects: HitObject[]): OsuBeatmap {
  return {
    formatVersion: 14,
    keyCount: 4,
    audioFilename: "test.mp3",
    timingPoints: [],
    hitObjects,
  };
}

/** Construye un hit circle con la columna y el tiempo dados. */
function buildCircle(column: number, timeMs: number): HitObject {
  return { column, timeMs, type: 1, endTimeMs: null, hitSound: 0, hitSample: "0:0:0:0:" };
}

describe("createDefaultLaneMapState", () => {
  it("returns the default 4k to 7k lane mapping", () => {
    expect(createDefaultLaneMapState()).toEqual([[0, 1], [2, 3], [4], [5, 6]]);
  });
});

describe("toggleTargetColumn", () => {
  it("adds a target column when it is absent", () => {
    const next = toggleTargetColumn(createDefaultLaneMapState(), 2, 5);
    expect(next).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
      [6],
    ]);
  });

  it("removes a target column when it is present", () => {
    const next = toggleTargetColumn(createDefaultLaneMapState(), 0, 1);
    expect(next).toEqual([[0], [2, 3], [4], [5, 6]]);
  });

  it("does not remove the last target column of a source column", () => {
    const state: LaneMapState = [[0], [2, 3], [4], [5, 6]];
    const next = toggleTargetColumn(state, 0, 0);
    expect(next).toBe(state);
    expect(next[0]).toEqual([0]);
  });

  it("returns a new state and keeps the other source columns untouched", () => {
    const next = toggleTargetColumn(createDefaultLaneMapState(), 1, 2);
    expect(next).not.toBe(createDefaultLaneMapState());
    expect(next[0]).toEqual([0, 1]);
    expect(next[2]).toEqual([4]);
    expect(next[3]).toEqual([5, 6]);
  });
});

describe("hasTargetColumn", () => {
  const state = createDefaultLaneMapState();

  it("returns true when the target column is present", () => {
    expect(hasTargetColumn(state, 0, 0)).toBe(true);
    expect(hasTargetColumn(state, 0, 1)).toBe(true);
    expect(hasTargetColumn(state, 3, 6)).toBe(true);
  });

  it("returns false when the target column is absent", () => {
    expect(hasTargetColumn(state, 0, 2)).toBe(false);
    expect(hasTargetColumn(state, 2, 0)).toBe(false);
    expect(hasTargetColumn(state, 2, 3)).toBe(false);
  });
});

describe("getTargetColumnCounts", () => {
  it("reports exactly one source per target column for the default state", () => {
    expect(getTargetColumnCounts(createDefaultLaneMapState(), 7)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it("reports collisions when two sources share a target column", () => {
    const colliding: LaneMapState = [[0], [0], [1], [1]];
    expect(getTargetColumnCounts(colliding, 7)).toEqual([2, 2, 0, 0, 0, 0, 0]);
  });
});

describe("toLaneMap", () => {
  it("returns a lane map that convertBeatmap can consume", () => {
    const beatmap = buildBeatmap([
      buildCircle(0, 1000),
      buildCircle(1, 1000),
      buildCircle(2, 1000),
      buildCircle(3, 1000),
    ]);
    const converted = convertBeatmap(beatmap, {
      laneMap: toLaneMap(createDefaultLaneMapState()),
      targetKeyCount: 7,
    });

    expect(converted.keyCount).toBe(7);
    expect(converted.hitObjects).toHaveLength(7);
    expect(converted.hitObjects.every((hitObject) => hitObject.column >= 0)).toBe(true);
  });

  it("throws when the state leaves a source column without targets", () => {
    const invalid: LaneMapState = [[], [0], [1], [2]];
    expect(() =>
      convertBeatmap(buildBeatmap([buildCircle(0, 1000)]), {
        laneMap: toLaneMap(invalid),
        targetKeyCount: 7,
      }),
    ).toThrow();
  });
});
