import type { LaneMapState } from "./lane-map-state";

/**
 * Configuración de mapeo guardada por el usuario: un estado de carriles con
 * nombre e identificador estable, persistida en localStorage.
 */
export interface LanePreset {
  id: string;
  name: string;
  laneMapState: LaneMapState;
}

/** Contrato mínimo de almacenamiento, inyectable para poder testear sin DOM. */
export interface PresetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Clave de almacenamiento de los presets de mapeo. */
export const PRESETS_STORAGE_KEY = "osu_4to7_lane_presets_v1";

/**
 * Presets predeterminados para conversión 4K a 7K con diferentes patrones
 * y skillsets (balanceados, entrenamiento de brackets/rolls y tryhard).
 */
export const DEFAULT_LANE_PRESETS: readonly LanePreset[] = [
  {
    id: "default-proportional",
    name: "trills",
    laneMapState: [[0, 1], [2, 3], [4], [5, 6]],
  },
  {
    id: "default-mirror",
    name: "mirror",
    laneMapState: [[0, 6], [1, 5], [2, 4], [3]],
  },
  {
    id: "default-stairs-rolls",
    name: "staircase",
    laneMapState: [[0, 4], [1, 5], [2, 6], [3]],
  },
  {
    id: "default-brackets",
    name: "Brackets Master",
    laneMapState: [[0, 2], [1], [3, 5], [4, 6]],
  },
  {
    id: "default-the-blender",
    name: "The Blender",
    laneMapState: [[0, 6], [1, 4], [2, 5], [3]],
  },
];

/**
 * Carga los presets disponibles. Si el almacenamiento está vacío, carga los
 * predeterminados. Si ya existen presets guardados, combina los predeterminados
 * faltantes con los del usuario para que siempre estén accesibles.
 *
 * @param storage - Almacenamiento opcional; por defecto usa localStorage del
 * navegador cuando está disponible (no-op en entornos sin DOM).
 * @returns La lista de presets válidos disponibles.
 */
export function loadPresets(storage?: PresetStorage | null): LanePreset[] {
  const stored = readStoredJson(resolveStorage(storage));
  if (stored === null) {
    return [...DEFAULT_LANE_PRESETS];
  }
  const userPresets = sanitizePresets(stored);
  const existingNames = new Set(userPresets.map((p) => p.name.trim().toLowerCase()));
  const missingDefaults = DEFAULT_LANE_PRESETS.filter(
    (def) => !existingNames.has(def.name.trim().toLowerCase()) && !userPresets.some((p) => p.id === def.id),
  );
  return [...missingDefaults, ...userPresets];
}

/**
 * Guarda el estado de mapeo actual como preset. Un nombre vacío devuelve la
 * misma lista sin escribir. Si ya existe un preset con el mismo nombre (sin
 * distinguir mayúsculas), se reemplaza su mapeo conservando el identificador.
 *
 * @param presets - La lista actual de presets.
 * @param name - Nombre del preset a guardar.
 * @param laneMapState - Estado de carriles a persistir.
 * @param storage - Almacenamiento opcional.
 * @returns La nueva lista de presets.
 */
export function savePreset(
  presets: readonly LanePreset[],
  name: string,
  laneMapState: LaneMapState,
  storage?: PresetStorage | null,
): LanePreset[] {
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return [...presets];
  }

  const existingIndex = presets.findIndex(
    (preset) => preset.name.trim().toLowerCase() === trimmedName.toLowerCase(),
  );

  let nextPresets: LanePreset[];
  if (existingIndex >= 0) {
    nextPresets = presets.map((preset, index) =>
      index === existingIndex ? { ...preset, laneMapState } : preset,
    );
  } else {
    nextPresets = [...presets, { id: createPresetId(), name: trimmedName, laneMapState }];
  }

  writeStoredJson(resolveStorage(storage), nextPresets);
  return nextPresets;
}

/**
 * Elimina el preset con el identificador dado. Si no existe, devuelve la misma
 * lista sin escribir en el almacenamiento.
 *
 * @param presets - La lista actual de presets.
 * @param id - Identificador del preset a eliminar.
 * @param storage - Almacenamiento opcional.
 * @returns La nueva lista de presets.
 */
export function deletePreset(
  presets: readonly LanePreset[],
  id: string,
  storage?: PresetStorage | null,
): LanePreset[] {
  const nextPresets = presets.filter((preset) => preset.id !== id);
  if (nextPresets.length === presets.length) {
    return nextPresets;
  }
  writeStoredJson(resolveStorage(storage), nextPresets);
  return nextPresets;
}

/**
 * Filtra una estructura desconocida quedándose solo con presets válidos:
 * identificador de texto no vacío, nombre de texto no vacío y un estado de
 * carriles con forma de arreglo de arreglos de enteros no negativos.
 *
 * @param raw - La estructura cruda leída del almacenamiento.
 * @returns La lista de presets válidos.
 */
export function sanitizePresets(raw: unknown): LanePreset[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const validPresets: LanePreset[] = [];
  for (const entry of raw) {
    const preset = sanitizePreset(entry);
    if (preset !== null) {
      validPresets.push(preset);
    }
  }
  return validPresets;
}

/** Valida una entrada individual y la convierte en un {@link LanePreset}. */
function sanitizePreset(entry: unknown): LanePreset | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const candidate = entry as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    return null;
  }
  if (typeof candidate.name !== "string" || candidate.name.trim().length === 0) {
    return null;
  }
  if (!isValidLaneMapState(candidate.laneMapState)) {
    return null;
  }
  return { id: candidate.id, name: candidate.name.trim(), laneMapState: candidate.laneMapState };
}

/** Verifica que un valor tenga la forma de un estado de carriles válido. */
function isValidLaneMapState(value: unknown): value is LaneMapState {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  return value.every(
    (sourceTargets) =>
      Array.isArray(sourceTargets) &&
      sourceTargets.every((targetColumn) => Number.isInteger(targetColumn) && targetColumn >= 0),
  );
}

/** Genera un identificador único para un preset nuevo. */
function createPresetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Resuelve el almacenamiento por defecto (localStorage) cuando existe. */
function resolveStorage(storage?: PresetStorage | null): PresetStorage | null {
  if (storage !== undefined && storage !== null) {
    return storage;
  }
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      return globalThis.localStorage as PresetStorage;
    }
  } catch {
    // Sin almacenamiento disponible: no-op
  }
  return null;
}

/** Lee y parsea el JSON guardado, devolviendo null ante cualquier fallo. */
function readStoredJson(storage: PresetStorage | null): unknown {
  if (storage === null) {
    return null;
  }
  try {
    const rawValue = storage.getItem(PRESETS_STORAGE_KEY);
    if (rawValue === null) {
      return null;
    }
    return JSON.parse(rawValue) as unknown;
  } catch {
    return null;
  }
}

/** Escribe la lista de presets en el almacenamiento, ignorando fallos. */
function writeStoredJson(storage: PresetStorage | null, presets: LanePreset[]): void {
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Almacenamiento lleno o bloqueado: se ignora silenciosamente
  }
}
