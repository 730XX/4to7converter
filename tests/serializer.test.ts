import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOsuFile } from "../src/core/osu/parser.js";
import { serializeOsuFile } from "../src/core/osu/serializer.js";
import type { OsuBeatmap } from "../src/core/osu/types.js";

/** Carga el fixture 4k canónico usado en los tests del serializer. */
function loadFixture(): string {
  return readFileSync(new URL("./fixtures/basic-4k.osu", import.meta.url), "utf8");
}

/**
 * Extrae los campos estructurales que deben sobrevivir a un round trip.
 * Se incluyen los campos de timing points que el convertidor nunca cambia;
 * la metadata de presentación queda excluida a propósito.
 */
function extractStructuralData(beatmap: OsuBeatmap) {
  return {
    formatVersion: beatmap.formatVersion,
    keyCount: beatmap.keyCount,
    audioFilename: beatmap.audioFilename,
    timingPoints: beatmap.timingPoints.map((timingPoint) => ({
      offsetMs: timingPoint.offsetMs,
      beatLength: timingPoint.beatLength,
      uninherited: timingPoint.uninherited,
      volume: timingPoint.volume,
    })),
    hitObjects: beatmap.hitObjects.map((hitObject) => ({
      column: hitObject.column,
      timeMs: hitObject.timeMs,
      type: hitObject.type,
      endTimeMs: hitObject.endTimeMs,
      hitSound: hitObject.hitSound,
      hitSample: hitObject.hitSample,
    })),
  };
}

describe("serializeOsuFile", () => {
  it("round-trips the structural data of a parsed beatmap", () => {
    const parsedOnce = parseOsuFile(loadFixture());
    const serialized = serializeOsuFile(parsedOnce);
    const parsedTwice = parseOsuFile(serialized);

    expect(extractStructuralData(parsedTwice)).toEqual(extractStructuralData(parsedOnce));
  });

  it("produces deterministic output for the same input", () => {
    const beatmap = parseOsuFile(loadFixture());

    expect(serializeOsuFile(beatmap)).toBe(serializeOsuFile(beatmap));
  });

  it("keeps the file loadable as a mania beatmap with the same key count", () => {
    const beatmap = parseOsuFile(loadFixture());
    const reparsed = parseOsuFile(serializeOsuFile(beatmap));

    expect(reparsed.keyCount).toBe(4);
    expect(reparsed.hitObjects).toHaveLength(9);
  });
});
