import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { convertBeatmap } from "../core/convert/engine.js";
import { CliError, CliErrorCode } from "./errors.js";
import type { LaneMap } from "../core/convert/lane-map.js";
import type { ConversionIssue } from "../core/convert/validate.js";
import { validateConvertedBeatmap } from "../core/convert/validate.js";
import { parseOsuFile } from "../core/osu/parser.js";
import { serializeOsuFile } from "../core/osu/serializer.js";

/** Lane map por defecto 4k→7k: cubre las 7 columnas destino dividiendo 1 y 3. */
const DEFAULT_4K_TO_7K_LANE_MAP: readonly (readonly number[])[] = [[0, 1], [2, 3], [4], [5, 6]];

/** Opciones de una conversión por línea de comandos. */
export interface ConvertFileOptions {
  /** Ruta del archivo .osu de entrada (4k). */
  inputPath: string;
  /** Ruta del archivo de salida; si no se provee, se deriva de la entrada. */
  outputPath?: string;
  /** Lane map a aplicar; si no se provee, se usa el default 4k→7k. */
  laneMap?: LaneMap;
  /** Cantidad de teclas destino; por defecto 7. */
  targetKeyCount?: number;
}

/** Resultado resumido de una conversión por línea de comandos. */
export interface ConvertFileResult {
  inputPath: string;
  outputPath: string;
  sourceKeyCount: number;
  targetKeyCount: number;
  sourceNoteCount: number;
  targetNoteCount: number;
  issues: ConversionIssue[];
}

/**
 * Convierte un archivo .osu 4k a la cantidad de teclas destino y escribe el
 * resultado en disco. Lee, convierte, valida y serializa de forma asíncrona.
 *
 * @param options - Ruta de entrada, salida opcional, lane map y teclas destino.
 * @returns Un resumen con conteos y problemas de validación.
 * @throws {CliError} Con código estable cuando un archivo no puede leerse o
 * escribirse. También propaga {@link OsuParseError} y {@link ConversionError}.
 */
export async function convertFile(options: ConvertFileOptions): Promise<ConvertFileResult> {
  const targetKeyCount = options.targetKeyCount ?? 7;
  const laneMap = options.laneMap ?? createDefaultLaneMap(targetKeyCount);

  const content = await readInputFile(options.inputPath);
  const beatmap = parseOsuFile(content);

  const convertedBeatmap = convertBeatmap(beatmap, { laneMap, targetKeyCount });
  const issues = validateConvertedBeatmap(convertedBeatmap);
  const serialized = serializeOsuFile(convertedBeatmap);

  const outputPath = options.outputPath ?? defaultOutputPath(options.inputPath, targetKeyCount);
  await writeOutputFile(outputPath, serialized);

  return {
    inputPath: options.inputPath,
    outputPath,
    sourceKeyCount: beatmap.keyCount,
    targetKeyCount,
    sourceNoteCount: beatmap.hitObjects.length,
    targetNoteCount: convertedBeatmap.hitObjects.length,
    issues,
  };
}

/**
 * Interpreta el JSON del lane map en formato arreglo de arreglos, p. ej.
 * `[[0,1],[2,3],[4],[5,6]]`.
 *
 * @param rawJson - El JSON crudo provisto por la línea de comandos.
 * @returns El lane map con su forma estructural básica validada.
 * @throws {CliError} Con código {@link CliErrorCode.InvalidLaneMap} cuando el
 * JSON no es un arreglo de arreglos de enteros.
 */
export function parseLaneMapJson(rawJson: string): LaneMap {
  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(rawJson);
  } catch {
    throw new CliError(CliErrorCode.InvalidLaneMap, "El lane map no es JSON válido.");
  }

  if (!Array.isArray(parsedValue) || parsedValue.length === 0) {
    throw new CliError(
      CliErrorCode.InvalidLaneMap,
      "El lane map debe ser un arreglo JSON de arreglos no vacío, p. ej. [[0,1],[2,3],[4],[5,6]].",
    );
  }

  const sourceColumnToTargetColumns = parsedValue.map((sourceEntry, sourceColumn) => {
    if (!Array.isArray(sourceEntry) || sourceEntry.length === 0) {
      throw new CliError(
        CliErrorCode.InvalidLaneMap,
        `La columna fuente ${sourceColumn} debe ser un arreglo no vacío de columnas destino.`,
      );
    }
    return sourceEntry.map((targetColumn) => {
      if (!Number.isInteger(targetColumn) || targetColumn < 0) {
        throw new CliError(
          CliErrorCode.InvalidLaneMap,
          `La columna fuente ${sourceColumn} contiene una columna destino inválida: "${String(targetColumn)}".`,
        );
      }
      return targetColumn;
    });
  });

  return { sourceColumnToTargetColumns };
}

/** Lee el archivo de entrada, traduciendo errores de disco a un CliError estable. */
async function readInputFile(inputPath: string): Promise<string> {
  try {
    return await readFile(inputPath, "utf8");
  } catch {
    throw new CliError(
      CliErrorCode.FileReadError,
      `No se puede leer el archivo de entrada "${inputPath}".`,
    );
  }
}

/** Escribe el archivo de salida, traduciendo errores de disco a un CliError estable. */
async function writeOutputFile(outputPath: string, content: string): Promise<void> {
  try {
    await writeFile(outputPath, content, "utf8");
  } catch {
    throw new CliError(
      CliErrorCode.FileWriteError,
      `No se puede escribir el archivo de salida "${outputPath}".`,
    );
  }
}

/** Deriva la ruta de salida: mismo directorio, sufijo "-<k>k" y extensión .osu. */
function defaultOutputPath(inputPath: string, targetKeyCount: number): string {
  const inputDirectory = dirname(inputPath);
  const inputBaseName = basename(inputPath, extname(inputPath));
  return join(inputDirectory, `${inputBaseName}-${targetKeyCount}k.osu`);
}

/** Devuelve el lane map 4k→7k por defecto, exigiendo un lane map para otros destinos. */
function createDefaultLaneMap(targetKeyCount: number): LaneMap {
  if (targetKeyCount !== 7) {
    throw new CliError(
      CliErrorCode.InvalidKeys,
      `Se requiere un lane map cuando la cantidad de teclas destino no es 7 (se recibió ${targetKeyCount}).`,
    );
  }
  return { sourceColumnToTargetColumns: DEFAULT_4K_TO_7K_LANE_MAP };
}
