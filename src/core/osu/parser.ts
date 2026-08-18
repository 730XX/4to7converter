import {
  HIT_TYPE_CIRCLE,
  HIT_TYPE_HOLD,
  MANIA_PLAYFIELD_WIDTH,
  OsuParseError,
  OsuParseErrorCode,
  type HitObject,
  type HitObjectType,
  type OsuBeatmap,
  type TimingPoint,
} from "./types.js";

/**
 * Parsea un archivo de beatmap de osu!mania a una representación tipada {@link OsuBeatmap}.
 *
 * @param content - Contenido de texto crudo del archivo .osu.
 * @returns La representación tipada del beatmap.
 * @throws {OsuParseError} Con un código numérico estable cuando el contenido
 * no es un beatmap de osu!mania válido.
 */
export function parseOsuFile(content: string): OsuBeatmap {
  if (!content || content.trim().length === 0) {
    throw new OsuParseError(
      OsuParseErrorCode.EmptyContent,
      "El archivo está vacío. Carga un beatmap .osu válido.",
    );
  }

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const formatVersion = parseFormatVersion(lines[0] ?? "");
  const sections = splitIntoSections(lines.slice(1));
  const general = getSectionLines(sections, "General");
  const difficulty = getSectionLines(sections, "Difficulty");

  const mode = parseIntSectionValue(general, "Mode", 0);
  if (mode !== 3) {
    throw new OsuParseError(
      OsuParseErrorCode.UnsupportedMode,
      `Este no es un beatmap de osu!mania (Mode ${mode}). Solo se admite el Mode 3.`,
    );
  }

  const keyCount = parseKeyCount(difficulty);
  const events = getSectionLines(sections, "Events");
  const metadata = getSectionLines(sections, "Metadata");
  const timingPoints = parseTimingPoints(getSectionLines(sections, "TimingPoints"));
  const hitObjects = parseHitObjects(getSectionLines(sections, "HitObjects"), keyCount);
  const backgroundFilename = parseBackgroundFilename(events);

  return {
    formatVersion,
    keyCount,
    audioFilename: parseSectionValue(general, "AudioFilename") ?? "audio.mp3",
    backgroundFilename,
    timingPoints,
    hitObjects,

    // Metadata
    title: parseSectionValue(metadata, "Title") ?? undefined,
    titleUnicode: parseSectionValue(metadata, "TitleUnicode") ?? undefined,
    artist: parseSectionValue(metadata, "Artist") ?? undefined,
    artistUnicode: parseSectionValue(metadata, "ArtistUnicode") ?? undefined,
    creator: parseSectionValue(metadata, "Creator") ?? undefined,
    version: parseSectionValue(metadata, "Version") ?? undefined,
    source: parseSectionValue(metadata, "Source") ?? undefined,
    tags: parseSectionValue(metadata, "Tags") ?? undefined,
    beatmapId: parseIntSectionValue(metadata, "BeatmapID", 0),
    beatmapSetId: parseIntSectionValue(metadata, "BeatmapSetID", -1),

    // Difficulty
    hpDrainRate: parseFloatSectionValue(difficulty, "HPDrainRate", 7),
    overallDifficulty: parseFloatSectionValue(difficulty, "OverallDifficulty", 7),
    approachRate: parseFloatSectionValue(difficulty, "ApproachRate", 5),
    sliderMultiplier: parseFloatSectionValue(difficulty, "SliderMultiplier", 1.4),
    sliderTickRate: parseFloatSectionValue(difficulty, "SliderTickRate", 1),

    // General
    audioLeadIn: parseIntSectionValue(general, "AudioLeadIn", 0),
    previewTime: parseIntSectionValue(general, "PreviewTime", -1),
    countdown: parseIntSectionValue(general, "Countdown", 0),
    sampleSet: parseSectionValue(general, "SampleSet") ?? "Normal",
    stackLeniency: parseFloatSectionValue(general, "StackLeniency", 0.7),
    mode: 3,
    letterboxInBreaks: parseIntSectionValue(general, "LetterboxInBreaks", 0),
    specialStyle: parseIntSectionValue(general, "SpecialStyle", 0),
    widescreenStoryboard: parseIntSectionValue(general, "WidescreenStoryboard", 0),
  };
}

/** Parsea la versión de formato desde la primera línea obligatoria del archivo. */
function parseFormatVersion(firstLine: string): number {
  const match = /^osu file format v(\d+)/.exec(firstLine.trim());
  if (match === null) {
    throw new OsuParseError(
      OsuParseErrorCode.InvalidFormatVersion,
      "El archivo no comienza con un encabezado 'osu file format vN' válido.",
    );
  }
  return Number.parseInt(match[1]!, 10);
}

/**
 * Divide el cuerpo del archivo en secciones con nombre, p. ej. [TimingPoints].
 * Los comentarios y las líneas en blanco se conservan y cada consumidor de
 * sección los filtra.
 */
function splitIntoSections(bodyLines: string[]): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let currentSection: string[] = [];

  for (const line of bodyLines) {
    const sectionMatch = /^\[(\w+)\]$/.exec(line.trim());
    if (sectionMatch !== null) {
      const sectionName = sectionMatch[1]!;
      if (!sections.has(sectionName)) {
        sections.set(sectionName, []);
      }
      currentSection = sections.get(sectionName)!;
      continue;
    }
    currentSection.push(line);
  }

  return sections;
}

/** Devuelve las líneas de la sección, o un arreglo vacío cuando la sección está ausente. */
function getSectionLines(sections: Map<string, string[]>, name: string): string[] {
  return sections.get(name) ?? [];
}

/** Encuentra el valor de un par "Clave: Valor" en una sección, o null cuando está ausente. */
function parseSectionValue(sectionLines: string[], key: string): string | null {
  for (const line of sectionLines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0 || trimmedLine.startsWith("//")) {
      continue;
    }
    const separatorIndex = trimmedLine.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }
    const candidateKey = trimmedLine.slice(0, separatorIndex).trim();
    if (candidateKey === key) {
      return trimmedLine.slice(separatorIndex + 1).trim();
    }
  }
  return null;
}

/** Parsea un valor numérico de sección, usando el valor por defecto dado como respaldo. */
function parseIntSectionValue(sectionLines: string[], key: string, fallback: number): number {
  const rawValue = parseSectionValue(sectionLines, key);
  if (rawValue === null) {
    return fallback;
  }
  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isNaN(parsedValue) ? fallback : parsedValue;
}

/** Parsea un valor de punto flotante de sección, usando el valor por defecto como respaldo. */
function parseFloatSectionValue(sectionLines: string[], key: string, fallback: number): number {
  const rawValue = parseSectionValue(sectionLines, key);
  if (rawValue === null) {
    return fallback;
  }
  const parsedValue = Number.parseFloat(rawValue);
  return Number.isNaN(parsedValue) ? fallback : parsedValue;
}

/**
 * Parsea el nombre del archivo de imagen de fondo de la sección [Events].
 * Busca una línea de tipo 0,0,"bg.png",x,y o 0,0,bg.png,x,y.
 */
function parseBackgroundFilename(eventsLines: string[]): string | undefined {
  for (const line of eventsLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) {
      continue;
    }
    // Formato: 0,0,"filename",xOffset,yOffset o 0,0,filename
    const match = /^(?:0|Video),\s*\d+,\s*"?([^",\r\n]+)"?/i.exec(trimmed);
    if (match !== null && match[1]) {
      const filename = match[1].trim();
      if (/\.(jpe?g|png|webp|bmp)$/i.test(filename)) {
        return filename;
      }
    }
  }
  return undefined;
}

/**
 * Parsea el número de columnas desde la sección [Difficulty].
 * En osu!mania, CircleSize es el número de teclas.
 */
function parseKeyCount(difficultyLines: string[]): number {
  const rawKeyCount = parseIntSectionValue(difficultyLines, "CircleSize", Number.NaN);
  if (!Number.isInteger(rawKeyCount) || rawKeyCount < 1) {
    throw new OsuParseError(
      OsuParseErrorCode.MissingKeyCount,
      "El beatmap no tiene un CircleSize (cantidad de teclas) válido.",
    );
  }
  return rawKeyCount;
}

/** Mapea una coordenada x del playfield a su índice de columna basado en cero. */
function columnFromX(x: number, keyCount: number): number {
  const column = Math.floor((x * keyCount) / MANIA_PLAYFIELD_WIDTH);
  return Math.min(Math.max(column, 0), keyCount - 1);
}

/** Parsea cada línea de timing point a un {@link TimingPoint} tipado. */
function parseTimingPoints(timingPointLines: string[]): TimingPoint[] {
  const timingPoints: TimingPoint[] = [];
  for (const line of timingPointLines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0 || trimmedLine.startsWith("//")) {
      continue;
    }
    timingPoints.push(parseTimingPointLine(trimmedLine));
  }
  return timingPoints;
}

/** Parsea una sola línea de timing point separada por comas. */
function parseTimingPointLine(line: string): TimingPoint {
  const fields = line.split(",");
  const offsetMs = Number.parseFloat(fields[0] ?? "");
  const beatLength = Number.parseFloat(fields[1] ?? "");

  if (Number.isNaN(offsetMs) || Number.isNaN(beatLength) || !Number.isFinite(beatLength)) {
    throw new OsuParseError(
      OsuParseErrorCode.InvalidTimingPoint,
      `Punto de timing inválido: "${line}".`,
    );
  }

  return {
    offsetMs,
    beatLength,
    meter: parseFieldAsInt(fields[2], 4),
    sampleSet: parseFieldAsInt(fields[3], 0),
    sampleIndex: parseFieldAsInt(fields[4], 0),
    volume: parseFieldAsInt(fields[5], 100),
    uninherited: fields[6] === undefined ? true : fields[6] === "1",
    effects: parseFieldAsInt(fields[7], 0),
  };
}

/** Parsea cada línea de hit object a un {@link HitObject} tipado. */
function parseHitObjects(hitObjectLines: string[], keyCount: number): HitObject[] {
  const hitObjects: HitObject[] = [];
  for (const line of hitObjectLines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0 || trimmedLine.startsWith("//")) {
      continue;
    }
    hitObjects.push(parseHitObjectLine(trimmedLine, keyCount));
  }
  return hitObjects;
}

/** Parsea una sola línea de hit object separada por comas. */
function parseHitObjectLine(line: string, keyCount: number): HitObject {
  const fields = line.split(",");
  const x = Number.parseFloat(fields[0] ?? "");
  const timeMs = Number.parseFloat(fields[2] ?? "");
  const rawType = parseIntOrThrow(fields[3] ?? "", line);

  if (Number.isNaN(x) || Number.isNaN(timeMs)) {
    throw new OsuParseError(OsuParseErrorCode.InvalidHitObject, `Hit object inválido: "${line}".`);
  }

  const type = resolveHitObjectType(rawType, line);
  const endTimeMs = type === HIT_TYPE_HOLD ? parseHoldEndTime(fields[5], line) : null;

  return {
    column: columnFromX(x, keyCount),
    timeMs,
    type,
    endTimeMs,
    hitSound: parseIntOrThrow(fields[4] ?? "0", line),
    hitSample: parseHitSample(fields[5], fields[6], type === HIT_TYPE_HOLD),
  };
}

/**
 * Resuelve el tipo de un hit object de mania a partir de sus bits de flag.
 * Los flags de "new combo" (4) y de salto de color (16) pueden acompañar al
 * círculo (1) o al hold (128) y se ignoran. Los sliders (2) y los spinners (8)
 * no existen en osu!mania y se rechazan.
 *
 * @param rawType - El valor de tipo crudo del archivo .osu.
 * @param line - La línea original, para referenciarla en el mensaje de error.
 * @returns El tipo normalizado: círculo (1) u hold (128).
 * @throws {OsuParseError} Con código {@link OsuParseErrorCode.InvalidHitObject}
 * cuando el tipo no corresponde a un hit object válido de mania.
 */
function resolveHitObjectType(rawType: number, line: string): HitObjectType {
  const hasSliderBit = (rawType & 2) !== 0;
  const hasSpinnerBit = (rawType & 8) !== 0;
  if (hasSliderBit || hasSpinnerBit) {
    throw new OsuParseError(
      OsuParseErrorCode.InvalidHitObject,
      `Tipo de hit object no soportado (${rawType}): "${line}". Los sliders y spinners no existen en osu!mania.`,
    );
  }
  if ((rawType & HIT_TYPE_HOLD) !== 0) {
    return HIT_TYPE_HOLD;
  }
  if ((rawType & HIT_TYPE_CIRCLE) !== 0) {
    return HIT_TYPE_CIRCLE;
  }
  throw new OsuParseError(
    OsuParseErrorCode.InvalidHitObject,
    `Tipo de hit object no soportado (${rawType}): "${line}". Solo los círculos y holds son válidos en osu!mania.`,
  );
}

/** Parsea el tiempo de fin de una hold note desde su payload "endTime:hitSample". */
function parseHoldEndTime(payload: string | undefined, line: string): number {
  const endTimeMs = Number.parseFloat(payload?.split(":")[0] ?? "");
  if (Number.isNaN(endTimeMs)) {
    throw new OsuParseError(
      OsuParseErrorCode.InvalidHitObject,
      `Hold note sin un tiempo de fin válido: "${line}".`,
    );
  }
  return endTimeMs;
}

/**
 * Extrae el hitSample de una línea de hit object, soportando las dos variantes
 * del formato: la forma de mania de 6 campos (círculos con el sample en el
 * campo de objectParams, holds con "endTime:hitSample") y la forma general de
 * 7 campos con un campo explícito separado. Devuelve el valor por defecto
 * cuando no hay un sample válido.
 *
 * @param objectParamsField - El campo de object params (o sample, en mania).
 * @param explicitSampleField - El campo de hitSample explícito, si existe.
 * @param isHold - true para hold notes, cuyo sample vive tras el "endTime:".
 * @returns El hitSample preservado, o "0:0:0:0:" cuando no existe.
 */
function parseHitSample(
  objectParamsField: string | undefined,
  explicitSampleField: string | undefined,
  isHold: boolean,
): string {
  const fallback = "0:0:0:0:";
  if (explicitSampleField !== undefined && explicitSampleField.trim().length > 0) {
    return explicitSampleField;
  }
  if (objectParamsField === undefined || objectParamsField.trim().length === 0) {
    return fallback;
  }
  if (!isHold) {
    return objectParamsField;
  }
  const separatorIndex = objectParamsField.indexOf(":");
  return separatorIndex < 0 ? fallback : objectParamsField.slice(separatorIndex + 1);
}

/** Parsea un campo numérico opcional, usando el valor por defecto dado como respaldo. */
function parseFieldAsInt(rawField: string | undefined, fallback: number): number {
  if (rawField === undefined || rawField.trim().length === 0) {
    return fallback;
  }
  const parsedValue = Number.parseInt(rawField, 10);
  return Number.isNaN(parsedValue) ? fallback : parsedValue;
}

/** Parsea un campo entero o lanza un {@link OsuParseError} referenciando la línea. */
function parseIntOrThrow(rawField: string, line: string): number {
  const parsedValue = Number.parseInt(rawField, 10);
  if (Number.isNaN(parsedValue)) {
    throw new OsuParseError(
      OsuParseErrorCode.InvalidHitObject,
      `Campo numérico inválido en el hit object: "${line}".`,
    );
  }
  return parsedValue;
}
