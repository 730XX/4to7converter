import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANE_PRESETS,
  deletePreset,
  loadPresets,
  PRESETS_STORAGE_KEY,
  savePreset,
  sanitizePresets,
  type PresetStorage,
} from "./lane-presets";
import type { LaneMapState } from "./lane-map-state";

/** Crea un almacenamiento en memoria con el contenido inicial dado. */
function createMemoryStorage(initial: string | null = null): PresetStorage {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, nextValue) => {
      value = nextValue;
    },
  };
}

/** Obtiene el JSON guardado desde un almacenamiento en memoria. */
function getStoredValue(storage: PresetStorage): unknown {
  const rawValue = storage.getItem(PRESETS_STORAGE_KEY);
  return rawValue === null ? null : (JSON.parse(rawValue) as unknown);
}

const SAMPLE_STATE: LaneMapState = [[0, 1], [2, 3], [4], [5, 6]];

describe("loadPresets", () => {
  it("returns default presets when nothing is stored", () => {
    const storage = createMemoryStorage(null);

    expect(loadPresets(storage)).toEqual(DEFAULT_LANE_PRESETS);
  });

  it("returns an empty list when the stored JSON is corrupt", () => {
    const storage = createMemoryStorage("not json{{{");

    expect(loadPresets(storage)).toEqual([]);
  });

  it("drops invalid entries and keeps valid ones alongside defaults", () => {
    const storage = createMemoryStorage(
      JSON.stringify([
        { id: "ok", name: "Válido", laneMapState: [[0], [1]] },
        { id: "bad", name: "Sin mapeo", laneMapState: "nope" },
        { id: "bad2", name: "", laneMapState: [[0]] },
        "texto suelto",
        null,
      ]),
    );

    const presets = loadPresets(storage);
    expect(presets).toHaveLength(DEFAULT_LANE_PRESETS.length + 1);
    expect(presets.some((p) => p.id === "ok" && p.name === "Válido")).toBe(true);
  });
});

describe("savePreset", () => {
  it("is a no-op for an empty name and does not write storage", () => {
    const storage = createMemoryStorage(null);

    const result = savePreset([], "   ", SAMPLE_STATE, storage);

    expect(result).toEqual([]);
    expect(storage.getItem(PRESETS_STORAGE_KEY)).toBeNull();
  });

  it("appends a new preset and writes storage", () => {
    const storage = createMemoryStorage(null);

    const result = savePreset([], "Mi mapeo", SAMPLE_STATE, storage);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Mi mapeo", laneMapState: SAMPLE_STATE });
    expect(storage.getItem(PRESETS_STORAGE_KEY)).not.toBeNull();
  });

  it("overwrites an existing preset by name (case-insensitive) keeping its id", () => {
    const storage = createMemoryStorage(null);
    const first = savePreset([], "Mi mapeo", SAMPLE_STATE, storage);
    const firstId = first[0]!.id;

    const second = savePreset(first, "MI MAPEO", [[0], [1], [2], [3]], storage);

    expect(second).toHaveLength(1);
    expect(second[0]!.id).toBe(firstId);
    expect(second[0]!.laneMapState).toEqual([[0], [1], [2], [3]]);
  });
});

describe("deletePreset", () => {
  it("removes the preset by id and writes storage", () => {
    const storage = createMemoryStorage(null);
    const saved = savePreset([], "Uno", SAMPLE_STATE, storage);
    const kept = savePreset(saved, "Dos", [[0]], storage);

    const result = deletePreset(kept, kept[0]!.id, storage);

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Dos");
    expect(getStoredValue(storage)).toHaveLength(1);
  });

  it("returns the same list when the id does not exist", () => {
    const storage = createMemoryStorage(null);
    const saved = savePreset([], "Uno", SAMPLE_STATE, storage);

    const result = deletePreset(saved, "no-existe", storage);

    expect(result).toHaveLength(saved.length);
  });
});

describe("round-trip", () => {
  it("preserves presets through save and load", () => {
    const storage = createMemoryStorage(null);
    const saved = savePreset([], "Mapeo 1", SAMPLE_STATE, storage);
    const withTwo = savePreset(saved, "Mapeo 2", [[0, 1, 2], [3], [4], [5, 6]], storage);

    const loaded = loadPresets(storage);

    expect(loaded).toEqual(withTwo);
  });
});

describe("sanitizePresets", () => {
  it("accepts only structurally valid presets", () => {
    const result = sanitizePresets([
      { id: "a", name: "A", laneMapState: [[0]] },
      { id: "b", name: "B", laneMapState: [] },
      { id: "c", name: "C", laneMapState: [[-1]] },
      { id: "d", name: "D", laneMapState: [["x"]] },
      { id: "e", name: "E", laneMapState: [[0, 1], [2]] },
    ]);

    expect(result.map((preset) => preset.id)).toEqual(["a", "e"]);
  });
});
