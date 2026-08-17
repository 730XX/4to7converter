/**
 * Tipos de dominio para archivos de beatmap de osu!mania.
 *
 * Solo se modelan los datos necesarios para el parseo, la conversión y la
 * serialización. Las secciones que el convertidor nunca toca (storyboard,
 * layout del editor) no se representan a propósito.
 */

/** Tamaño horizontal del playfield en osu!mania: cada columna abarca 512 unidades. */
export const MANIA_PLAYFIELD_WIDTH = 512;

/** Flag de hit object para una nota normal (hit circle). */
export const HIT_TYPE_CIRCLE = 1;

/** Flag de hit object para una nota larga (hold note). */
export const HIT_TYPE_HOLD = 128;

/** Los dos tipos de hit object que existen en osu!mania. */
export type HitObjectType = typeof HIT_TYPE_CIRCLE | typeof HIT_TYPE_HOLD;

/** Una entrada individual de la sección [TimingPoints]. */
export interface TimingPoint {
  /** Desplazamiento en milisegundos desde el inicio de la canción. */
  offsetMs: number;
  /**
   * Milisegundos por beat para puntos BPM (positivo), o el divisor de velocidad
   * para puntos SV (negativo: multiplicador = 100 / -beatLength).
   */
  beatLength: number;
  /** Compás del tiempo musical, normalmente 4. */
  meter: number;
  sampleSet: number;
  sampleIndex: number;
  volume: number;
  /** true para puntos BPM (no heredados), false para puntos SV (heredados). */
  uninherited: boolean;
  effects: number;
}

/** Una nota individual de la sección [HitObjects]. */
export interface HitObject {
  /** Índice de columna basado en cero dentro del playfield de mania. */
  column: number;
  /** Tiempo de impacto en milisegundos. */
  timeMs: number;
  type: HitObjectType;
  /** Tiempo de fin en milisegundos; solo presente en hold notes. */
  endTimeMs: number | null;
  hitSound: number;
  /** Cadena de hit sample cruda, preservada textual para la serialización. */
  hitSample: string;
}

/** Representación parseada de un archivo de beatmap de osu!mania. */
export interface OsuBeatmap {
  /** Versión de formato de la primera línea, p. ej. 14. */
  formatVersion: number;
  /** Número de columnas (CircleSize), p. ej. 4 para 4k. */
  keyCount: number;
  audioFilename: string;
  backgroundFilename?: string;
  timingPoints: TimingPoint[];
  hitObjects: HitObject[];

  // Metadata
  title?: string;
  titleUnicode?: string;
  artist?: string;
  artistUnicode?: string;
  creator?: string;
  version?: string;
  source?: string;
  tags?: string;
  beatmapId?: number;
  beatmapSetId?: number;

  // Difficulty
  hpDrainRate?: number;
  overallDifficulty?: number;
  approachRate?: number;
  sliderMultiplier?: number;
  sliderTickRate?: number;

  // General
  audioLeadIn?: number;
  previewTime?: number;
  countdown?: number;
  sampleSet?: string;
  stackLeniency?: number;
  mode?: number;
  letterboxInBreaks?: number;
  specialStyle?: number;
  widescreenStoryboard?: number;
}

/** Códigos numéricos estables para fallos de parseo, mostrados al usuario en la UI. */
export const OsuParseErrorCode = {
  EmptyContent: 1001,
  InvalidFormatVersion: 1002,
  UnsupportedMode: 1003,
  MissingKeyCount: 1004,
  InvalidTimingPoint: 1005,
  InvalidHitObject: 1006,
} as const;

/**
 * Error lanzado cuando un archivo de beatmap no puede parsearse.
 * Transporta un código numérico estable y un mensaje legible.
 */
export class OsuParseError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = "OsuParseError";
    this.code = code;
  }
}
