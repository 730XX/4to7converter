/**
 * Preferencias globales del usuario persistidas en localStorage.
 */
export interface UserSettings {
  volume: number; // 0 - 100
  hitsoundVolume: number; // 0 - 100
  scrollSpeed: number; // 10 - 40 (1.0x - 4.0x)
  scrollDirection: "down" | "up";
  previewMode: "7k" | "4k" | "split";
  backdropDim: number; // 0 - 100
  playfieldWidth: "compact" | "normal" | "wide";
  hitGlow: boolean;
  hitsounds: boolean;
  diffSuffix: string; // Texto/sufijo agregado a la dificultad (ej: "(7K)")
}

export const DEFAULT_SETTINGS: UserSettings = {
  volume: 80,
  hitsoundVolume: 80,
  scrollSpeed: 25,
  scrollDirection: "down",
  previewMode: "7k",
  backdropDim: 60,
  playfieldWidth: "normal",
  hitGlow: true,
  hitsounds: true,
  diffSuffix: "(7K)",
};

const STORAGE_KEY = "osu_4to7_settings_v1";

/**
 * Carga las preferencias guardadas del usuario o devuelve los valores por defecto.
 */
export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Guarda las preferencias del usuario en localStorage.
 */
export function saveSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Silencioso si storage está deshabilitado
  }
}

/**
 * Convierte el valor de scrollSpeed (10 - 40) a tiempo de aproximación en ms (approachMs).
 * A mayor scroll speed, menos tiempo tardan las notas en caer.
 * 25 (2.5x) equivale al estándar de ~700ms.
 */
export function scrollSpeedToApproachMs(scrollSpeed: number): number {
  // speed 10 (1.0x) -> 1750ms (muy lento)
  // speed 25 (2.5x) -> 700ms (estándar mania)
  // speed 40 (4.0x) -> 437ms (muy rápido)
  return Math.round(17500 / Math.max(scrollSpeed, 5));
}
