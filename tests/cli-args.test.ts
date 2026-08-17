import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";
import { CliError, CliErrorCode } from "../src/cli/errors.js";

describe("parseArgs", () => {
  it("parses the input path with default options", () => {
    const args = parseArgs(["map.osu"]);

    expect(args.inputPath).toBe("map.osu");
    expect(args.outputPath).toBeNull();
    expect(args.laneMapJson).toBeNull();
    expect(args.targetKeyCount).toBe(7);
    expect(args.showHelp).toBe(false);
  });

  it("parses output, lane map and keys options", () => {
    const args = parseArgs(["map.osu", "-o", "out.osu", "-m", "[[0,1],[2]]", "-k", "9"]);

    expect(args.outputPath).toBe("out.osu");
    expect(args.laneMapJson).toBe("[[0,1],[2]]");
    expect(args.targetKeyCount).toBe(9);
  });

  it("supports the long flag forms", () => {
    const args = parseArgs([
      "map.osu",
      "--output",
      "out.osu",
      "--lane-map",
      "[[0]]",
      "--keys",
      "7",
    ]);

    expect(args.outputPath).toBe("out.osu");
    expect(args.laneMapJson).toBe("[[0]]");
    expect(args.targetKeyCount).toBe(7);
  });

  it("sets showHelp for the help flag", () => {
    const args = parseArgs(["--help"]);

    expect(args.showHelp).toBe(true);
  });

  it("throws a usage error when the input file is missing", () => {
    expect(() => parseArgs([])).toThrowError(
      expect.objectContaining({ code: CliErrorCode.UsageError }),
    );
  });

  it("throws a usage error for unknown options", () => {
    expect(() => parseArgs(["map.osu", "--bogus"])).toThrowError(
      expect.objectContaining({ code: CliErrorCode.UsageError }),
    );
  });

  it("throws a usage error when an option value is missing", () => {
    expect(() => parseArgs(["map.osu", "--output"])).toThrowError(
      expect.objectContaining({ code: CliErrorCode.UsageError }),
    );
  });

  it("throws a usage error for an invalid key count", () => {
    expect(() => parseArgs(["map.osu", "-k", "abc"])).toThrowError(
      expect.objectContaining({ code: CliErrorCode.UsageError }),
    );
  });

  it("rejects an extra positional argument", () => {
    expect(() => parseArgs(["map.osu", "extra.osu"])).toThrowError(
      expect.objectContaining({ code: CliErrorCode.UsageError }),
    );
  });

  it("exposes typed instances of CliError", () => {
    expect.assertions(1);
    try {
      parseArgs([]);
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
    }
  });
});
