import { CliError, CliErrorCode } from "./errors.js";

/** Opciones de la línea de comandos, ya parseadas y sin interpretar. */
export interface CliArgs {
  /** Ruta del archivo .osu de entrada (4k). */
  inputPath: string;
  /** Ruta del archivo .osu de salida, o null para usar el valor por defecto. */
  outputPath: string | null;
  /** JSON crudo del lane map, o null para usar el lane map por defecto. */
  laneMapJson: string | null;
  /** Cantidad de teclas del beatmap destino, por defecto 7. */
  targetKeyCount: number;
  /** true cuando el usuario pidió la ayuda. */
  showHelp: boolean;
}

/**
 * Parsea los argumentos de la línea de comandos.
 *
 * Formato esperado: <input.osu> [-o <salida>] [-m <json lane map>] [-k <teclas>] [-h]
 *
 * @param argv - Argumentos crudos, sin incluir node y el script.
 * @returns Las opciones parseadas.
 * @throws {CliError} Con código {@link CliErrorCode.UsageError} cuando un
 * argumento falta, es desconocido o su valor es inválido.
 */
export function parseArgs(argv: readonly string[]): CliArgs {
  let inputPath: string | null = null;
  let outputPath: string | null = null;
  let laneMapJson: string | null = null;
  let targetKeyCount = 7;
  let showHelp = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";

    if (argument === "--help" || argument === "-h") {
      showHelp = true;
      continue;
    }

    if (argument === "--output" || argument === "-o") {
      outputPath = readValueArgument(argv, index, argument);
      index += 1;
      continue;
    }

    if (argument === "--lane-map" || argument === "-m") {
      laneMapJson = readValueArgument(argv, index, argument);
      index += 1;
      continue;
    }

    if (argument === "--keys" || argument === "-k") {
      targetKeyCount = parseKeyCount(readValueArgument(argv, index, argument));
      index += 1;
      continue;
    }

    if (argument.startsWith("-")) {
      throw new CliError(
        CliErrorCode.UsageError,
        `Opción desconocida "${argument}". Ejecuta con --help para ver el uso.`,
      );
    }

    if (inputPath !== null) {
      throw new CliError(
        CliErrorCode.UsageError,
        `Argumento extra inesperado: "${argument}". Ejecuta con --help para ver el uso.`,
      );
    }
    inputPath = argument;
  }

  if (inputPath === null && !showHelp) {
    throw new CliError(
      CliErrorCode.UsageError,
      "Falta el archivo .osu de entrada. Ejecuta con --help para ver el uso.",
    );
  }

  return { inputPath: inputPath ?? "", outputPath, laneMapJson, targetKeyCount, showHelp };
}

/** Lee el valor de un argumento con opción, lanzando un error cuando falta. */
function readValueArgument(argv: readonly string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new CliError(CliErrorCode.UsageError, `La opción "${option}" requiere un valor.`);
  }
  return value;
}

/** Parsea la cantidad de teclas destino, validando que sea un entero positivo. */
function parseKeyCount(rawValue: string): number {
  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new CliError(
      CliErrorCode.UsageError,
      `Cantidad de teclas inválida: "${rawValue}". Usa un entero positivo, p. ej. 7.`,
    );
  }
  return parsedValue;
}
