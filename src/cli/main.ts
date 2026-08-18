import { parseArgs } from "./args.js";
import { convertFile, parseLaneMapJson } from "./convert-file.js";
import { CliError } from "./errors.js";
import { ConversionError } from "../core/convert/errors.js";
import { OsuParseError } from "../core/osu/types.js";

/** Punto de entrada de la CLI: convierte un .osu 4k a 7k desde la terminal. */
async function run(): Promise<void> {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof CliError) {
      printError(error);
    }
    printUsage();
    process.exitCode = 2;
    return;
  }

  if (options.showHelp) {
    printUsage();
    return;
  }

  let laneMap;
  if (options.laneMapJson !== null) {
    try {
      laneMap = parseLaneMapJson(options.laneMapJson);
    } catch (error) {
      if (error instanceof CliError) {
        printError(error);
      }
      process.exitCode = 2;
      return;
    }
  }

  try {
    const result = await convertFile({
      inputPath: options.inputPath,
      outputPath: options.outputPath ?? undefined,
      laneMap: laneMap ?? undefined,
      targetKeyCount: options.targetKeyCount,
    });

    printSummary(result);
    const errorCount = result.issues.filter((issue) => issue.severity === "error").length;
    process.exitCode = errorCount > 0 ? 1 : 0;
  } catch (error) {
    if (
      error instanceof CliError ||
      error instanceof OsuParseError ||
      error instanceof ConversionError
    ) {
      printError(error);
    } else {
      console.error(`Error inesperado: ${String(error)}`);
    }
    process.exitCode = 1;
  }
}

/** Imprime un resumen legible del resultado de la conversión. */
function printSummary(result: Awaited<ReturnType<typeof convertFile>>): void {
  console.log(`Beatmap fuente: ${result.sourceKeyCount}k, ${result.sourceNoteCount} notas`);
  console.log(`Convertido:     ${result.targetKeyCount}k, ${result.targetNoteCount} notas`);

  if (result.issues.length === 0) {
    console.log("Problemas:      ninguno");
  } else {
    const errorCount = result.issues.filter((issue) => issue.severity === "error").length;
    const warningCount = result.issues.length - errorCount;
    console.log(
      `Problemas:      ${result.issues.length} (${errorCount} errores, ${warningCount} advertencias)`,
    );
    for (const issue of result.issues) {
      const severityLabel = issue.severity === "error" ? "error" : "advertencia";
      console.log(`  ${severityLabel} ${issue.code}: ${issue.message}`);
    }
  }

  console.log(`Guardado en:    ${result.outputPath}`);
}

/** Imprime un error con su código numérico estable. */
function printError(error: CliError | OsuParseError | ConversionError): void {
  console.error(`Error ${error.code}: ${error.message}`);
}

/** Imprime el uso de la CLI. */
function printUsage(): void {
  console.log(`
Convierte un beatmap de osu!mania 4k a otra cantidad de teclas.

Uso: npm run convert -- <input.osu> [opciones]

Opciones:
  -o, --output <archivo>   Archivo .osu de salida (por defecto: <nombre>-7k.osu)
  -m, --lane-map <json>    Lane map como arreglo JSON de arreglos, p. ej. [[0,1],[2,3],[4],[5,6]]
  -k, --keys <n>           Cantidad de teclas destino (por defecto: 7; requiere --lane-map si no es 7)
  -h, --help               Muestra esta ayuda
`);
}

await run();
