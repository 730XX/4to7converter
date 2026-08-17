import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convertBeatmap } from "../src/core/convert/engine.js";
import { createLaneMap } from "../src/core/convert/lane-map.js";
import { ConversionIssueCode, validateConvertedBeatmap } from "../src/core/convert/validate.js";
import { parseOsuFile } from "../src/core/osu/parser.js";
import type { HitObject, OsuBeatmap } from "../src/core/osu/types.js";

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

describe("validateConvertedBeatmap", () => {
  it("reports a duplicate note as an error", () => {
    const issues = validateConvertedBeatmap(
      buildBeatmap([buildCircle(0, 1000), buildCircle(0, 1000)]),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: ConversionIssueCode.DuplicateNote,
      severity: "error",
    });
  });

  it("reports a hold overlap as a warning", () => {
    const issues = validateConvertedBeatmap(
      buildBeatmap([buildHold(0, 1000, 3000), buildCircle(0, 2000)]),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: ConversionIssueCode.HoldOverlap,
      severity: "warning",
    });
  });

  it("does not report a note at the exact hold end time", () => {
    const issues = validateConvertedBeatmap(
      buildBeatmap([buildHold(0, 1000, 3000), buildCircle(0, 3000)]),
    );

    expect(issues).toEqual([]);
  });

  it("reports overlapping holds in the same column", () => {
    const issues = validateConvertedBeatmap(
      buildBeatmap([buildHold(0, 1000, 3000), buildHold(0, 2000, 4000)]),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: ConversionIssueCode.HoldOverlap });
  });

  it("does not report a note in a different column", () => {
    const issues = validateConvertedBeatmap(
      buildBeatmap([buildHold(0, 1000, 3000), buildCircle(1, 2000)]),
    );

    expect(issues).toEqual([]);
  });

  it("reports an out of range column as an error", () => {
    const issues = validateConvertedBeatmap(buildBeatmap([buildCircle(7, 1000)]));

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: ConversionIssueCode.ColumnOutOfRange,
      severity: "error",
    });
  });

  it("detects a duplicate produced by a conflicting lane map end to end", () => {
    const converted = convertBeatmap(buildBeatmap([buildCircle(0, 1000), buildCircle(1, 1000)]), {
      laneMap: createLaneMap([[0], [0]], 7),
      targetKeyCount: 7,
    });

    const issues = validateConvertedBeatmap(converted);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: ConversionIssueCode.DuplicateNote });
  });

  it("reports no issues for a clean full conversion", () => {
    const content = readFileSync(new URL("./fixtures/basic-4k.osu", import.meta.url), "utf8");
    const converted = convertBeatmap(parseOsuFile(content), {
      laneMap: createLaneMap([[0, 1], [2, 3], [4], [5, 6]], 7),
      targetKeyCount: 7,
    });

    expect(validateConvertedBeatmap(converted)).toEqual([]);
  });
});
