import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOsuFile } from "../src/core/osu/parser.js";
import { OsuParseError, OsuParseErrorCode } from "../src/core/osu/types.js";

/** Carga el fixture 4k canónico usado en los tests del parser. */
function loadFixture(): string {
  return readFileSync(new URL("./fixtures/basic-4k.osu", import.meta.url), "utf8");
}

describe("parseOsuFile", () => {
  it("parses the format version, key count and audio filename", () => {
    const beatmap = parseOsuFile(loadFixture());

    expect(beatmap.formatVersion).toBe(14);
    expect(beatmap.keyCount).toBe(4);
    expect(beatmap.audioFilename).toBe("test.mp3");
  });

  it("parses every hit object with its column, time and type", () => {
    const beatmap = parseOsuFile(loadFixture());

    expect(beatmap.hitObjects).toHaveLength(9);
    expect(beatmap.hitObjects[0]).toMatchObject({ column: 0, timeMs: 1000, type: 1 });
    expect(beatmap.hitObjects.slice(1, 4)).toEqual([
      expect.objectContaining({ column: 1, timeMs: 2000, type: 1 }),
      expect.objectContaining({ column: 2, timeMs: 2000, type: 1 }),
      expect.objectContaining({ column: 3, timeMs: 2000, type: 1 }),
    ]);
  });

  it("parses a four-note chord with one note per column", () => {
    const beatmap = parseOsuFile(loadFixture());

    const chord = beatmap.hitObjects.slice(5, 9);
    expect(chord.map((hitObject) => hitObject.column)).toEqual([0, 1, 2, 3]);
    expect(chord.every((hitObject) => hitObject.timeMs === 4000)).toBe(true);
  });

  it("parses the hold note end time", () => {
    const beatmap = parseOsuFile(loadFixture());

    const holdNote = beatmap.hitObjects[4];
    expect(holdNote).toMatchObject({ column: 1, type: 128, endTimeMs: 3500 });
  });

  it("preserves custom hit samples on circles and holds", () => {
    const contentWithSamples = [
      "osu file format v14",
      "[General]",
      "Mode: 3",
      "[Difficulty]",
      "CircleSize: 4",
      "[HitObjects]",
      "64,192,1000,1,0,1:2:0:0:kick.wav",
      "192,192,2000,128,0,2500:3:4:5:80:tail.wav",
    ].join("\n");

    const beatmap = parseOsuFile(contentWithSamples);

    expect(beatmap.hitObjects[0]).toMatchObject({ type: 1, hitSample: "1:2:0:0:kick.wav" });
    expect(beatmap.hitObjects[1]).toMatchObject({
      type: 128,
      endTimeMs: 2500,
      hitSample: "3:4:5:80:tail.wav",
    });
  });

  it("accepts hit object types with the new-combo flag", () => {
    const contentWithFlags = [
      "osu file format v14",
      "[General]",
      "Mode: 3",
      "[Difficulty]",
      "CircleSize: 4",
      "[HitObjects]",
      "64,192,1000,5,0,0:0:0:0:",
      "192,192,2000,133,0,2500:0:0:0:0:",
    ].join("\n");

    const beatmap = parseOsuFile(contentWithFlags);

    expect(beatmap.hitObjects[0]).toMatchObject({ column: 0, timeMs: 1000, type: 1 });
    expect(beatmap.hitObjects[1]).toMatchObject({
      column: 1,
      timeMs: 2000,
      type: 128,
      endTimeMs: 2500,
    });
  });

  it("rejects slider and spinner hit object types", () => {
    const contentWithSlider = [
      "osu file format v14",
      "[General]",
      "Mode: 3",
      "[Difficulty]",
      "CircleSize: 4",
      "[HitObjects]",
      "64,192,1000,2,0,0:0:0:0:",
    ].join("\n");

    expect(() => parseOsuFile(contentWithSlider)).toThrowError(
      expect.objectContaining({ code: OsuParseErrorCode.InvalidHitObject }),
    );
  });

  it("parses timing points preserving inheritance", () => {
    const beatmap = parseOsuFile(loadFixture());

    expect(beatmap.timingPoints).toHaveLength(2);
    expect(beatmap.timingPoints[0]).toMatchObject({
      offsetMs: 0,
      beatLength: 500,
      uninherited: true,
    });
    expect(beatmap.timingPoints[1]).toMatchObject({
      offsetMs: 5000,
      beatLength: -50,
      uninherited: false,
    });
  });

  it("rejects blank content with a stable error code", () => {
    expect(() => parseOsuFile("  \n  ")).toThrowError(
      expect.objectContaining({ code: OsuParseErrorCode.EmptyContent }),
    );
  });

  it("rejects non-mania beatmaps with a stable error code", () => {
    const nonManiaContent = [
      "osu file format v14",
      "[General]",
      "Mode: 2",
      "[Difficulty]",
      "CircleSize: 4",
      "[HitObjects]",
      "256,192,1000,5,0,0:0:0:0:",
    ].join("\n");

    expect(() => parseOsuFile(nonManiaContent)).toThrowError(
      expect.objectContaining({ code: OsuParseErrorCode.UnsupportedMode }),
    );
  });

  it("exposes a human-readable message for parse failures", () => {
    expect.assertions(1);
    try {
      parseOsuFile("not an osu file");
    } catch (error) {
      expect(error).toBeInstanceOf(OsuParseError);
    }
  });
});
