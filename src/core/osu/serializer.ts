import {
  MANIA_PLAYFIELD_WIDTH,
  type HitObject,
  type OsuBeatmap,
  type TimingPoint,
} from "./types.js";

/**
 * Serializa un {@link OsuBeatmap} tipado de vuelta al formato de texto .osu.
 *
 * El resultado es un archivo osu!mania canónico y mínimo: las secciones que el
 * convertidor nunca toca (metadata, storyboard) se escriben con valores por
 * defecto seguros. Los datos de timing se conservan exactamente; solo las
 * columnas de hit objects y la cantidad de teclas pueden diferir de la fuente
 * después de la conversión.
 *
 * @param beatmap - El beatmap tipado a serializar.
 * @returns El contenido del archivo .osu como cadena.
 */
export function serializeOsuFile(beatmap: OsuBeatmap): string {
  const lines: string[] = [];
  lines.push(`osu file format v${beatmap.formatVersion}`);
  pushBlank(lines);
  pushGeneralSection(lines, beatmap);
  pushBlank(lines);
  pushEditorSection(lines);
  pushBlank(lines);
  pushMetadataSection(lines, beatmap);
  pushBlank(lines);
  pushDifficultySection(lines, beatmap);
  pushBlank(lines);
  pushEventsSection(lines, beatmap.backgroundFilename);
  pushBlank(lines);
  pushTimingPointsSection(lines, beatmap.timingPoints);
  pushBlank(lines);
  pushHitObjectsSection(lines, beatmap.hitObjects, beatmap.keyCount);
  return lines.join("\n");
}

/** Agrega una línea en blanco a la salida. */
function pushBlank(lines: string[]): void {
  lines.push("");
}

/** Escribe la sección [General] con el archivo de audio y el modo mania. */
function pushGeneralSection(lines: string[], beatmap: OsuBeatmap): void {
  lines.push("[General]");
  lines.push(`AudioFilename: ${beatmap.audioFilename}`);
  lines.push(`AudioLeadIn: ${beatmap.audioLeadIn ?? 0}`);
  lines.push(`PreviewTime: ${beatmap.previewTime ?? -1}`);
  lines.push(`Countdown: ${beatmap.countdown ?? 0}`);
  lines.push(`SampleSet: ${beatmap.sampleSet ?? "Normal"}`);
  lines.push(`StackLeniency: ${beatmap.stackLeniency ?? 0.7}`);
  lines.push("Mode: 3");
  lines.push(`LetterboxInBreaks: ${beatmap.letterboxInBreaks ?? 0}`);
  if (beatmap.specialStyle !== undefined) {
    lines.push(`SpecialStyle: ${beatmap.specialStyle}`);
  }
  lines.push(`WidescreenStoryboard: ${beatmap.widescreenStoryboard ?? 0}`);
}

/** Escribe la sección [Editor] con valores por defecto seguros. */
function pushEditorSection(lines: string[]): void {
  lines.push("[Editor]");
  lines.push("DistanceSpacing: 1");
  lines.push("BeatDivisor: 4");
  lines.push("GridSize: 4");
  lines.push("TimelineZoom: 1");
}

/** Escribe la sección [Metadata] preservando los datos del beatmap. */
function pushMetadataSection(lines: string[], beatmap: OsuBeatmap): void {
  lines.push("[Metadata]");
  lines.push(`Title:${beatmap.title ?? "Converted 7k"}`);
  if (beatmap.titleUnicode) {
    lines.push(`TitleUnicode:${beatmap.titleUnicode}`);
  }
  lines.push(`Artist:${beatmap.artist ?? "Unknown"}`);
  if (beatmap.artistUnicode) {
    lines.push(`ArtistUnicode:${beatmap.artistUnicode}`);
  }
  lines.push(`Creator:${beatmap.creator ?? "Unknown"}`);
  lines.push(`Version:${beatmap.version ?? "7k"}`);
  lines.push(`Source:${beatmap.source ?? ""}`);
  lines.push(`Tags:${beatmap.tags ?? ""}`);
  lines.push(`BeatmapID:${beatmap.beatmapId ?? 0}`);
  lines.push(`BeatmapSetID:${beatmap.beatmapSetId ?? -1}`);
}

/** Escribe la sección [Difficulty], usando CircleSize como cantidad de teclas. */
function pushDifficultySection(lines: string[], beatmap: OsuBeatmap): void {
  lines.push("[Difficulty]");
  lines.push(`HPDrainRate:${beatmap.hpDrainRate ?? 7}`);
  lines.push(`CircleSize:${beatmap.keyCount}`);
  lines.push(`OverallDifficulty:${beatmap.overallDifficulty ?? 7}`);
  lines.push(`ApproachRate:${beatmap.approachRate ?? 5}`);
  lines.push(`SliderMultiplier:${beatmap.sliderMultiplier ?? 1.4}`);
  lines.push(`SliderTickRate:${beatmap.sliderTickRate ?? 1}`);
}

/** Escribe la sección [Events] preservando el background si existía. */
function pushEventsSection(lines: string[], backgroundFilename?: string): void {
  lines.push("[Events]");
  lines.push("//Background and Video events");
  if (backgroundFilename) {
    lines.push(`0,0,"${backgroundFilename}",0,0`);
  }
  lines.push("//Break Periods");
}

/** Escribe cada timing point textualmente desde sus campos parseados. */
function pushTimingPointsSection(lines: string[], timingPoints: TimingPoint[]): void {
  lines.push("[TimingPoints]");
  for (const timingPoint of timingPoints) {
    lines.push(formatTimingPointLine(timingPoint));
  }
}

/** Formatea un timing point como una línea separada por comas. */
function formatTimingPointLine(timingPoint: TimingPoint): string {
  const fields = [
    formatNumber(timingPoint.offsetMs),
    formatNumber(timingPoint.beatLength),
    String(timingPoint.meter),
    String(timingPoint.sampleSet),
    String(timingPoint.sampleIndex),
    String(timingPoint.volume),
    timingPoint.uninherited ? "1" : "0",
    String(timingPoint.effects),
  ];
  return fields.join(",");
}

/** Escribe cada hit object como una línea con formato mania. */
function pushHitObjectsSection(lines: string[], hitObjects: HitObject[], keyCount: number): void {
  lines.push("[HitObjects]");
  for (const hitObject of hitObjects) {
    lines.push(formatHitObjectLine(hitObject, keyCount));
  }
}

/** Formatea un hit object como una línea mania separada por comas. */
function formatHitObjectLine(hitObject: HitObject, keyCount: number): string {
  const x = columnCenterX(hitObject.column, keyCount);
  const baseFields = [
    formatNumber(x),
    "192",
    formatNumber(hitObject.timeMs),
    String(hitObject.type),
  ];
  if (hitObject.type === 128) {
    const endTimeMs = hitObject.endTimeMs ?? hitObject.timeMs;
    return [
      ...baseFields,
      String(hitObject.hitSound),
      `${formatNumber(endTimeMs)}:${hitObject.hitSample}`,
    ].join(",");
  }
  return [...baseFields, String(hitObject.hitSound), hitObject.hitSample].join(",");
}

/** Devuelve la coordenada x en el centro de una columna del playfield. */
function columnCenterX(column: number, keyCount: number): number {
  const columnWidth = MANIA_PLAYFIELD_WIDTH / keyCount;
  return column * columnWidth + columnWidth / 2;
}

/** Formatea un número sin ".0" final cuando es entero. */
function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toString();
}
