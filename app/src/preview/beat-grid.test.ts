import { describe, expect, it } from "vitest";
import { getBeatLinesInRange, type TimingSectionInfo } from "./beat-grid";

/** Construye una sección de timing de BPM con el offset, beatLength y compás dados. */
function section(offsetMs: number, beatLength: number, meter = 4): TimingSectionInfo {
  return { offsetMs, beatLength, meter, bpm: Math.round(60000 / beatLength) };
}

describe("getBeatLinesInRange", () => {
  it("returns nothing without sections or with an empty range", () => {
    expect(getBeatLinesInRange([], 0, 1000, 1)).toEqual([]);
    expect(getBeatLinesInRange([section(0, 500)], 1000, 1000, 1)).toEqual([]);
  });

  it("marks every beat as level 1 with divisor 1", () => {
    const lines = getBeatLinesInRange([section(0, 500)], 0, 2000, 1);
    expect(lines.map((line) => line.timeMs)).toEqual([0, 500, 1000, 1500]);
    expect(lines.map((line) => line.level)).toEqual([1, 1, 1, 1]);
  });

  it("adds level-2 subdivisions with divisor 2", () => {
    const lines = getBeatLinesInRange([section(0, 500)], 0, 1000, 2);
    expect(lines.map((line) => line.timeMs)).toEqual([0, 250, 500, 750]);
    expect(lines.map((line) => line.level)).toEqual([1, 2, 1, 2]);
  });

  it("adds level-4 subdivisions with divisor 4", () => {
    const lines = getBeatLinesInRange([section(0, 500)], 0, 1000, 4);
    expect(lines.map((line) => line.level)).toEqual([1, 4, 2, 4, 1, 4, 2, 4]);
  });

  it("limits the lines to the requested time range", () => {
    const lines = getBeatLinesInRange([section(0, 500)], 600, 1400, 1);
    expect(lines.map((line) => line.timeMs)).toEqual([1000]);
  });

  it("respects section boundaries on a BPM change", () => {
    const lines = getBeatLinesInRange([section(0, 500), section(1000, 250)], 0, 1500, 1);
    expect(lines.map((line) => line.timeMs)).toEqual([0, 500, 1000, 1250]);
    expect(lines.map((line) => line.level)).toEqual([1, 1, 1, 1]);
  });
});
