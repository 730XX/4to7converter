import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convertBeatmap } from "../src/core/convert/engine.js";
import { createLaneMap } from "../src/core/convert/lane-map.js";
import { parseOsuFile } from "../src/core/osu/parser.js";
import type { HitObject, OsuBeatmap, TimingPoint } from "../src/core/osu/types.js";

/** Construye un hit circle con la columna y el tiempo dados. */
function buildCircle(column: number, timeMs: number): HitObject {
  return { column, timeMs, type: 1, endTimeMs: null, hitSound: 0, hitSample: "0:0:0:0:" };
}

/** Construye una hold note con la columna y el rango de tiempo dados. */
function buildHold(column: number, timeMs: number, endTimeMs: number): HitObject {
  return { column, timeMs, type: 128, endTimeMs, hitSound: 0, hitSample: "0:0:0:0:" };
}

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

describe("convertBeatmap", () => {
  it("projects a single note into every target column of its source column", () => {
    const converted = convertBeatmap(buildBeatmap([buildCircle(0, 1000)]), {
      laneMap: createLaneMap([[0, 1]], 7),
      targetKeyCount: 7,
    });

    expect(converted.hitObjects).toHaveLength(2);
    expect(converted.hitObjects.map((hitObject) => hitObject.column)).toEqual([0, 1]);
    expect(converted.hitObjects.every((hitObject) => hitObject.timeMs === 1000)).toBe(true);
    expect(converted.hitObjects.every((hitObject) => hitObject.type === 1)).toBe(true);
  });

  it("projects a four-note chord preserving simultaneity", () => {
    const chord = [0, 1, 2, 3].map((column) => buildCircle(column, 4000));
    const converted = convertBeatmap(buildBeatmap(chord), {
      laneMap: createLaneMap([[0, 1], [3], [4], [6]], 7),
      targetKeyCount: 7,
    });

    expect(converted.hitObjects).toHaveLength(5);
    expect(converted.hitObjects.every((hitObject) => hitObject.timeMs === 4000)).toBe(true);
    expect(converted.hitObjects.map((hitObject) => hitObject.column)).toEqual([0, 1, 3, 4, 6]);
  });

  it("projects a hold note preserving its end time", () => {
    const converted = convertBeatmap(buildBeatmap([buildHold(1, 3000, 3500)]), {
      laneMap: createLaneMap([[0], [2, 3]], 7),
      targetKeyCount: 7,
    });

    expect(converted.hitObjects).toHaveLength(2);
    expect(converted.hitObjects.map((hitObject) => hitObject.column)).toEqual([2, 3]);
    expect(converted.hitObjects.every((hitObject) => hitObject.endTimeMs === 3500)).toBe(true);
    expect(converted.hitObjects.every((hitObject) => hitObject.type === 128)).toBe(true);
  });

  it("sets the target key count on the result", () => {
    const converted = convertBeatmap(buildBeatmap([buildCircle(0, 1000)]), {
      laneMap: createLaneMap([[0, 1]], 7),
      targetKeyCount: 7,
    });

    expect(converted.keyCount).toBe(7);
  });

  it("keeps timing points and audio filename untouched", () => {
    const timingPoint: TimingPoint = {
      offsetMs: 0,
      beatLength: 500,
      meter: 4,
      sampleSet: 0,
      sampleIndex: 0,
      volume: 100,
      uninherited: true,
      effects: 0,
    };
    const beatmap = buildBeatmap([buildCircle(0, 1000)]);
    beatmap.timingPoints = [timingPoint];

    const converted = convertBeatmap(beatmap, {
      laneMap: createLaneMap([[0, 1]], 7),
      targetKeyCount: 7,
    });

    expect(converted.timingPoints).toEqual([timingPoint]);
    expect(converted.audioFilename).toBe("test.mp3");
    expect(converted.formatVersion).toBe(14);
  });

  it("sorts the result by time and column", () => {
    const beatmap = buildBeatmap([
      buildCircle(2, 2000),
      buildCircle(0, 1000),
      buildCircle(1, 2000),
    ]);
    const converted = convertBeatmap(beatmap, {
      laneMap: createLaneMap([[0], [1], [2]], 7),
      targetKeyCount: 7,
    });

    expect(converted.hitObjects.map((hitObject) => [hitObject.column, hitObject.timeMs])).toEqual([
      [0, 1000],
      [1, 2000],
      [2, 2000],
    ]);
  });

  it("throws SourceKeyCountMismatch when a source column has no lane map entry", () => {
    expect(() =>
      convertBeatmap(buildBeatmap([buildCircle(3, 1000)]), {
        laneMap: createLaneMap([[0], [1], [2]], 7),
        targetKeyCount: 7,
      }),
    ).toThrowError(expect.objectContaining({ code: 2004 }));
  });

  it("throws ConversionError with code 2002 when a target column is out of range", () => {
    expect(() =>
      convertBeatmap(buildBeatmap([buildCircle(0, 1000)]), {
        laneMap: createLaneMap([[7]], 7),
        targetKeyCount: 7,
      }),
    ).toThrowError(expect.objectContaining({ code: 2002 }));
  });

  it("throws ConversionError with code 2003 when a source column repeats a target", () => {
    expect(() =>
      convertBeatmap(buildBeatmap([buildCircle(0, 1000)]), {
        laneMap: createLaneMap([[0, 0]], 7),
        targetKeyCount: 7,
      }),
    ).toThrowError(expect.objectContaining({ code: 2003 }));
  });

  it("integrates with the parser fixture end to end", () => {
    const content = readFileSync(new URL("./fixtures/basic-4k.osu", import.meta.url), "utf8");
    const converted = convertBeatmap(parseOsuFile(content), {
      laneMap: createLaneMap([[0, 1], [2, 3], [4], [5, 6]], 7),
      targetKeyCount: 7,
    });

    expect(converted.hitObjects).toHaveLength(16);
    expect(converted.keyCount).toBe(7);

    const chord = converted.hitObjects.filter((hitObject) => hitObject.timeMs === 4000);
    expect(chord.map((hitObject) => hitObject.column)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("throws SourceKeyCountMismatch when the lane map does not cover the source key count", () => {
    const sevenKeyBeatmap: OsuBeatmap = {
      formatVersion: 14,
      keyCount: 7,
      audioFilename: "test.mp3",
      timingPoints: [],
      hitObjects: [buildCircle(6, 1000)],
    };

    expect(() =>
      convertBeatmap(sevenKeyBeatmap, {
        laneMap: createLaneMap([[0, 1], [2, 3], [4], [5, 6]], 7),
        targetKeyCount: 7,
      }),
    ).toThrowError(expect.objectContaining({ code: 2004 }));
  });
});
