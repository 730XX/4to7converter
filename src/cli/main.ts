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
      console.error(`Unexpected error: ${String(error)}`);
    }
    process.exitCode = 1;
  }
}

/** Imprime un resumen legible del resultado de la conversión. */
function printSummary(result: Awaited<ReturnType<typeof convertFile>>): void {
  console.log(`Source beatmap: ${result.sourceKeyCount}k, ${result.sourceNoteCount} notes`);
  console.log(`Converted:      ${result.targetKeyCount}k, ${result.targetNoteCount} notes`);

  if (result.issues.length === 0) {
    console.log("Issues:         none");
  } else {
    const errorCount = result.issues.filter((issue) => issue.severity === "error").length;
    const warningCount = result.issues.length - errorCount;
    console.log(
      `Issues:         ${result.issues.length} (${errorCount} errors, ${warningCount} warnings)`,
    );
    for (const issue of result.issues) {
      console.log(`  ${issue.severity} ${issue.code}: ${issue.message}`);
    }
  }

  console.log(`Wrote:          ${result.outputPath}`);
}

/** Imprime un error con su código numérico estable. */
function printError(error: CliError | OsuParseError | ConversionError): void {
  console.error(`Error ${error.code}: ${error.message}`);
}

/** Imprime el uso de la CLI. */
function printUsage(): void {
  console.log(`
Convert an osu!mania 4k beatmap to another key count.

Usage: npm run convert -- <input.osu> [options]

Options:
  -o, --output <file>   Output .osu file (default: <input basename>-7k.osu)
  -m, --lane-map <json> Lane map as a JSON array of arrays, e.g. [[0,1],[2,3],[4],[5,6]]
  -k, --keys <n>        Target key count (default: 7; requires --lane-map when not 7)
  -h, --help            Show this help
`);
}

await run();
