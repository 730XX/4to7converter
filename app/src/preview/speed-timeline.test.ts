import { describe, expect, it } from "vitest";
import type { TimingPoint } from "../../../src/core/osu/types";
import { buildSpeedTimeline } from "./speed-timeline";

function timing(offsetMs: number, beatLength: number, uninherited: boolean): TimingPoint {
  return { offsetMs, beatLength, meter: 4, sampleSet: 1, sampleIndex: 0, volume: 0, uninherited, effects: 0 };
}

describe("SpeedTimeline", () => {
  it("uses the first valid BPM as the visual reference", () => {
    const timeline = buildSpeedTimeline([
      timing(1000, 500, true),
      timing(2000, 400, true),
    ]);
    expect(timeline.referenceBpm).toBe(120);
    expect(timeline.speedAt(1500)).toBe(1);
    expect(timeline.speedAt(2500)).toBe(1.25);
  });

  it("handles BPM acceleration and deceleration", () => {
    const timeline = buildSpeedTimeline([timing(0, 500, true), timing(1000, 1000, true)]);
    expect(timeline.speedAt(500)).toBe(1);
    expect(timeline.speedAt(1500)).toBe(0.5);
  });

  it("applies inherited negative beat lengths as SV", () => {
    const timeline = buildSpeedTimeline([timing(0, 500, true), timing(1000, -50, false)]);
    expect(timeline.stateAt(1500).svMultiplier).toBe(2);
    expect(timeline.speedAt(1500)).toBe(2);
  });

  it("combines BPM and SV factors", () => {
    const timeline = buildSpeedTimeline([
      timing(0, 500, true),
      timing(1000, 250, true),
      timing(1500, -50, false),
    ]);
    expect(timeline.speedAt(2000)).toBe(4);
  });

  it("integrates piecewise distance across changes", () => {
    const timeline = buildSpeedTimeline([
      timing(0, 500, true),
      timing(1000, 250, true),
      timing(1500, -50, false),
    ]);
    expect(timeline.distanceBetween(0, 2000)).toBe(4000);
    expect(timeline.distanceBetween(2000, 0)).toBe(-4000);
  });

  it("represents zero BPM as a stop and ignores malformed values", () => {
    const timeline = buildSpeedTimeline([
      timing(0, 500, true),
      timing(1000, 0, true),
      timing(1100, Number.NaN, true),
      timing(1200, 500, false),
      timing(1300, -100, true),
    ]);
    expect(timeline.speedAt(1050)).toBe(0);
    expect(timeline.speedAt(1500)).toBe(0);
    expect(timeline.stateAt(1050).mode).toBe("stop");
    expect(timeline.stateAt(1350).mode).toBe("stop");
    expect(timeline.eventsBetween().filter((event) => event.kind === "invalid")).toHaveLength(2);
  });

  it("integrates zero distance during a stop", () => {
    const timeline = buildSpeedTimeline([
      timing(0, 500, true),
      timing(1000, 0, true),
      timing(2000, 250, true),
    ]);
    expect(timeline.distanceBetween(500, 2500)).toBe(1500);
  });

  it("keeps long-note distance correct when its tail crosses a change", () => {
    const timeline = buildSpeedTimeline([timing(0, 500, true), timing(1000, 250, true)]);
    expect(timeline.distanceBetween(500, 1500)).toBe(1500);
  });

  it("keeps duplicate timing events ordered and uniquely identifiable", () => {
    const timeline = buildSpeedTimeline([
      timing(1000, 500, true),
      timing(1000, -50, false),
      timing(1000, 250, true),
    ]);
    expect(timeline.events.map((event) => event.ordinal)).toEqual([0, 1, 2]);
    expect(timeline.events.map((event) => `${event.kind}-${event.timeMs}-${event.ordinal}`)).toEqual([
      "bpm-1000-0",
      "sv-1000-1",
      "bpm-1000-2",
    ]);
    expect(timeline.stateAt(1000).bpm).toBe(240);
  });

  it("answers large timing-point queries without rescanning all events", () => {
    const timingPoints = Array.from({ length: 20_000 }, (_, index) =>
      timing(index * 10, index % 2 === 0 ? 500 : 250, true),
    );
    const timeline = buildSpeedTimeline(timingPoints);

    expect(timeline.speedAt(199_995)).toBe(2);
    expect(timeline.distanceBetween(0, 200_000)).toBe(300_000);
    expect(timeline.distanceBetween(200_000, 0)).toBe(-300_000);
  });
});
