import { serializeOsuFile } from "../../../src/core/osu/serializer";
import type { OsuBeatmap } from "../../../src/core/osu/types";

/**
 * Serializa un beatmap ya convertido y dispara la descarga del archivo .osu en
 * el navegador. El archivo se nombra `{baseName}.osu`.
 *
 * @param beatmap - El beatmap convertido a descargar.
 * @param baseName - Nombre base del archivo descargado, sin extensión.
 */
export function downloadConvertedBeatmap(beatmap: OsuBeatmap, baseName: string): void {
  const content = serializeOsuFile(beatmap);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${baseName}.osu`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
