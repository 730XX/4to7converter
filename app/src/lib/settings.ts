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
  keybinds7k: string[]; // 7 teclas para el modo play (ej: ["KeyS", "KeyD", "KeyF", "Space", "KeyJ", "KeyK", "KeyL"])
  playOffsetMs: number; // Offset de calibración independiente para el modo play en ms (-150 a 150)
  comboPositionPercent: number; // Altura vertical del combo en porcentaje de la pantalla (30 a 85, default: 55)
  playShowLaneSeparators: boolean; // Mostrar u ocultar las barras divisorias de carriles solo en Modo Play
  noteHeight: number; // Altura en píxeles de las notas (10 a 36, default: 16)
}

export const DEFAULT_KEYBINDS_7K: string[] = [
  "KeyS",
  "KeyD",
  "KeyF",
  "Space",
  "KeyJ",
  "KeyK",
  "KeyL",
];

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
  keybinds7k: DEFAULT_KEYBINDS_7K,
  playOffsetMs: 0,
  comboPositionPercent: 55,
  playShowLaneSeparators: true,
  noteHeight: 16,
};

/**
 * Formatea un KeyboardEvent.code a una representación corta y legible para la UI.
 */
export function formatKeyCode(code: string): string {
  if (!code) return "?";
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `NUM ${code.slice(6)}`;
  if (code === "Space") return "SPACE";
  if (code.startsWith("Arrow")) return code.slice(5).toUpperCase();
  if (code === "Semicolon") return ";";
  if (code === "Quote") return "'";
  if (code === "Comma") return ",";
  if (code === "Period") return ".";
  if (code === "Slash") return "/";
  if (code === "Backslash") return "\\";
  if (code === "BracketLeft") return "[";
  if (code === "BracketRight") return "]";
  if (code === "Minus") return "-";
  if (code === "Equal") return "=";
  return code.toUpperCase();
}

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
      // Garantizar que las nuevas propiedades nunca queden undefined
      playShowLaneSeparators:
        typeof parsed.playShowLaneSeparators === "boolean"
          ? parsed.playShowLaneSeparators
          : DEFAULT_SETTINGS.playShowLaneSeparators,
      noteHeight:
        typeof parsed.noteHeight === "number" && !isNaN(parsed.noteHeight)
          ? parsed.noteHeight
          : DEFAULT_SETTINGS.noteHeight,
      comboPositionPercent:
        typeof parsed.comboPositionPercent === "number" && !isNaN(parsed.comboPositionPercent)
          ? parsed.comboPositionPercent
          : DEFAULT_SETTINGS.comboPositionPercent,
      playOffsetMs:
        typeof parsed.playOffsetMs === "number" && !isNaN(parsed.playOffsetMs)
          ? parsed.playOffsetMs
          : DEFAULT_SETTINGS.playOffsetMs,
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
