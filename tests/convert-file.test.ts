import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { convertFile, parseLaneMapJson } from "../src/cli/convert-file.js";
import { CliErrorCode } from "../src/cli/errors.js";
import { parseOsuFile } from "../src/core/osu/parser.js";

/** Contenido del fixture 4k canónico usado en los tests de la CLI. */
const FIXTURE_CONTENT = readFileSync(new URL("./fixtures/basic-4k.osu", import.meta.url), "utf8");

/** Directorio temporal de la prueba actual, limpiado al terminar. */
let tempDirectory: string | null = null;

afterEach(async () => {
  if (tempDirectory !== null) {
    await rm(tempDirectory, { recursive: true, force: true });
    tempDirectory = null;
  }
});

/** Crea un directorio temporal limpio para la prueba actual. */
async function createTempDirectory(): Promise<string> {
  tempDirectory = await mkdtemp(join(tmpdir(), "osu-convert-"));
  return tempDirectory;
}

/** Escribe el fixture en el directorio temporal y devuelve su ruta. */
async function writeFixtureInTempDirectory(): Promise<string> {
  const directory = await createTempDirectory();
  const fixturePath = join(directory, "map-4k.osu");
  await writeFile(fixturePath, FIXTURE_CONTENT, "utf8");
  return fixturePath;
}

describe("convertFile", () => {
  it("converts a 4k fixture to 7k and writes a loadable output file", async () => {
    const fixturePath = await writeFixtureInTempDirectory();
    const outputPath = join(tempDirectory!, "map-7k.osu");

    const result = await convertFile({ inputPath: fixturePath, outputPath });

    expect(result.sourceKeyCount).toBe(4);
    expect(result.targetKeyCount).toBe(7);
    expect(result.sourceNoteCount).toBe(9);
    expect(result.targetNoteCount).toBe(16);
    expect(result.issues).toEqual([]);

    const outputContent = await readFile(outputPath, "utf8");
    const reparsed = parseOsuFile(outputContent);
    expect(reparsed.keyCount).toBe(7);
    expect(reparsed.hitObjects).toHaveLength(16);
  });

  it("derives the default output path next to the input file", async () => {
    const fixturePath = await writeFixtureInTempDirectory();

    const result = await convertFile({ inputPath: fixturePath });

    expect(result.outputPath).toBe(join(tempDirectory!, "map-4k-7k.osu"));
    await expect(readFile(result.outputPath, "utf8")).resolves.toBeTruthy();
  });

  it("reports duplicate-note errors from a conflicting lane map", async () => {
    const fixturePath = await writeFixtureInTempDirectory();
    const conflictingLaneMap = parseLaneMapJson("[[0],[0],[1],[1]]");

    const result = await convertFile({
      inputPath: fixturePath,
      laneMap: conflictingLaneMap,
      outputPath: join(tempDirectory!, "conflict-7k.osu"),
    });

    expect(result.issues.some((issue) => issue.severity === "error" && issue.code === 3001)).toBe(
      true,
    );
  });

  it("rejects a missing input file with a stable error code", async () => {
    const missingPath = join(await createTempDirectory(), "missing.osu");

    await expect(convertFile({ inputPath: missingPath })).rejects.toMatchObject({
      code: CliErrorCode.FileReadError,
    });
  });

  it("rejects an invalid lane map JSON with a stable error code", () => {
    expect(() => parseLaneMapJson("not json")).toThrowError(
      expect.objectContaining({ code: CliErrorCode.InvalidLaneMap }),
    );
    expect(() => parseLaneMapJson("{}")).toThrowError(
      expect.objectContaining({ code: CliErrorCode.InvalidLaneMap }),
    );
    expect(() => parseLaneMapJson("[[0],[]]")).toThrowError(
      expect.objectContaining({ code: CliErrorCode.InvalidLaneMap }),
    );
    expect(() => parseLaneMapJson('[[0],["x"]]')).toThrowError(
      expect.objectContaining({ code: CliErrorCode.InvalidLaneMap }),
    );
  });

  it("requires a lane map when the target key count is not 7", async () => {
    const fixturePath = await writeFixtureInTempDirectory();

    await expect(convertFile({ inputPath: fixturePath, targetKeyCount: 5 })).rejects.toMatchObject({
      code: CliErrorCode.InvalidKeys,
    });
  });
});
