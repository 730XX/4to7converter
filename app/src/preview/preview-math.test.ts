import { describe, expect, it } from "vitest";
import type { HitObject } from "../../../src/core/osu/types";
import {
  formatTimeMs,
  getColumnCenterX,
  getHoldEndY,
  getNoteY,
  getVisibleHitObjects,
  isNoteVisible,
  type PlayfieldMetrics,
} from "./preview-math";

/** Construye un hit circle con la columna y el tiempo dados. */
function buildCircle(column: number, timeMs: number): HitObject {
  return { column, timeMs, type: 1, endTimeMs: null, hitSound: 0, hitSample: "0:0:0:0:" };
}

/** Construye una hold note con la columna, el inicio y el fin dados. */
function buildHold(column: number, timeMs: number, endTimeMs: number): HitObject {
  return { column, timeMs, type: 128, endTimeMs, hitSound: 0, hitSample: "0:0:0:0:" };
}

/** Métricas con velocidad de desplazamiento 0.24 px/ms. */
const METRICS: PlayfieldMetrics = {
  width: 700,
  height: 340,
  hitLineY: 300,
  topPadding: 60,
  approachMs: 1000,
};

describe("getNoteY", () => {
  it("places a future note above the hit line", () => {
    expect(getNoteY(2000, 1000, 300, 0.2)).toBe(100);
  });

  it("places a past note below the hit line", () => {
    expect(getNoteY(0, 1000, 300, 0.2)).toBe(500);
  });

  it("places a note exactly at its impact time on the hit line", () => {
    expect(getNoteY(1000, 1000, 300, 0.2)).toBe(300);
  });
});

describe("getHoldEndY", () => {
  it("places a past hold tail below the hit line", () => {
    expect(getHoldEndY(0, 1000, 300, 0.2)).toBe(500);
  });
});

describe("isNoteVisible", () => {
  it("returns true when the note is inside the bounds", () => {
    expect(isNoteVisible(100, null, 0, 340)).toBe(true);
    expect(isNoteVisible(0, null, 0, 340)).toBe(true);
    expect(isNoteVisible(340, null, 0, 340)).toBe(true);
  });

  it("returns false when the note is outside the bounds", () => {
    expect(isNoteVisible(-50, null, 0, 340)).toBe(false);
    expect(isNoteVisible(350, null, 0, 340)).toBe(false);
  });

  it("returns true for a hold when only its tail is inside the bounds", () => {
    expect(isNoteVisible(-50, 100, 0, 340)).toBe(true);
  });

  it("returns false for a hold when neither end is inside the bounds", () => {
    expect(isNoteVisible(-50, -60, 0, 340)).toBe(false);
  });
});

describe("getVisibleHitObjects", () => {
  it("filters by the approach window, the hit line and the playfield bounds", () => {
    const hitObjects = [
      buildCircle(0, 10500),
      buildCircle(1, 12000),
      buildCircle(2, 9500),
      buildHold(3, 10100, 11500),
      buildHold(4, 9500, 9800),
    ];
    const visible = getVisibleHitObjects(hitObjects, 10000, METRICS);

    expect(visible).toEqual([hitObjects[0], hitObjects[3], hitObjects[4]]);
  });
});

describe("getColumnCenterX", () => {
  it("spaces 7 columns evenly within the playfield width", () => {
    const centers = Array.from({ length: 7 }, (_, column) => getColumnCenterX(column, 7, 700));
    expect(centers).toEqual([50, 150, 250, 350, 450, 550, 650]);
  });
});

describe("formatTimeMs", () => {
  it("formats times as m:ss", () => {
    expect(formatTimeMs(0)).toBe("0:00");
    expect(formatTimeMs(59999)).toBe("0:59");
    expect(formatTimeMs(60000)).toBe("1:00");
    expect(formatTimeMs(83456)).toBe("1:23");
  });

  it("treats negative times as zero", () => {
    expect(formatTimeMs(-5)).toBe("0:00");
  });
});
