import { convertFileSrc, invoke } from "@tauri-apps/api/core";

/**
 * Indica si la app corre dentro del shell de Tauri (escritorio). En el
 * navegador no existe el runtime interno de Tauri.
 *
 * @returns true cuando la app se ejecuta como app de escritorio Tauri.
 */
export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

/** Resultado de cargar un beatmap junto con su ruta de audio e imagen de fondo resueltas. */
export interface BeatmapLoadResult {
  content: string;
  audioPath: string | null;
  backgroundPath: string | null;
}

/**
 * Carga un archivo .osu desde una ruta absoluta del disco. El comando nativo
 * devuelve el contenido del beatmap, la ruta absoluta del audio referenciado
 * por `AudioFilename` y la imagen de fondo en `[Events]`.
 *
 * @param path - Ruta absoluta del archivo .osu.
 * @returns El contenido del beatmap, ruta de audio y ruta de fondo.
 */
export async function loadBeatmapWithAudio(path: string): Promise<BeatmapLoadResult> {
  const result = await invoke<{
    content: string;
    audio_path: string | null;
    background_path: string | null;
  }>("load_beatmap", {
    path,
  });
  return {
    content: result.content,
    audioPath: result.audio_path,
    backgroundPath: result.background_path,
  };
}

/**
 * Guarda el archivo de beatmap en disco si estamos en entorno de escritorio Tauri.
 */
export async function saveBeatmap(path: string, content: string): Promise<void> {
  if (!isTauri()) {
    throw new Error("No estás en la aplicación de escritorio");
  }
  await invoke("save_beatmap", { path, content });
}

/**
 * Convierte una ruta absoluta de archivo del sistema operativo a una URL con el
 * protocolo `asset://` que Tauri puede cargar de forma segura en el WebView.
 *
 * Devuelve la misma ruta sin cambios si no está corriendo dentro de Tauri.
 *
 * @param filePath - Ruta absoluta del archivo local.
 * @returns La URL del asset para audio o imagen.
 */
export function toAssetUrl(filePath: string): string {
  return convertFileSrc(filePath);
}

import { appLogger } from "./logger";

export const toAudioUrl = toAssetUrl;

/** Datos del beatmap detectado desde el proceso de osu!. */
export interface OsuDetectedBeatmap {
  path: string;
  folder_name: string;
  file_name: string;
  title: string | null;
  artist: string | null;
  version: string | null;
}

export interface OsuDetectResponse {
  map: OsuDetectedBeatmap | null;
  logs: string[];
}

/**
 * Consulta a Rust para detectar el mapa actualmente seleccionado en osu!.
 * Registra automáticamente los logs de diagnóstico en la consola in-app.
 */
export async function detectOsuBeatmap(): Promise<OsuDetectedBeatmap | null> {
  if (!isTauri()) {
    appLogger.add("warn", "detectOsuBeatmap: No estamos en entorno Tauri Desktop", "Native");
    return null;
  }
  try {
    const res = await invoke<OsuDetectResponse>("detect_osu_map");
    if (res && res.logs && res.logs.length > 0) {
      appLogger.addRustLogs(res.logs);
    }
    return res ? res.map : null;
  } catch (error) {
    appLogger.add("error", `Fallo al invocar detect_osu_map: ${String(error)}`, "Native");
    return null;
  }
}

/** Información de cada dificultad descubierta en la carpeta del beatmap. */
export interface BeatmapDiffItem {
  path: string;
  file_name: string;
  version: string;
  mode: number;
  key_count: number;
}

/**
 * Obtiene la lista de todas las dificultades (.osu) pertenecientes al mismo mapset.
 */
export async function listBeatmapDifficulties(path: string): Promise<BeatmapDiffItem[]> {
  if (!isTauri()) {
    return [];
  }
  try {
    return await invoke<BeatmapDiffItem[]>("list_beatmap_difficulties", { path });
  } catch (error) {
    console.error("Error al listar dificultades:", error);
    return [];
  }
}

export interface BeatmapSearchItem {
  path: string;
  title: string;
  artist: string;
  creator: string;
  folder_name: string;
  diff_count: number;
  key_modes: string[];
  preview_version: string;
  background_path?: string | null;
}

/**
 * Busca beatmaps por nombre, artista o dificultad en la carpeta Songs de osu!.
 */
export async function searchBeatmaps(
  query: string,
  basePath?: string | null,
): Promise<BeatmapSearchItem[]> {
  if (!isTauri() || !query.trim()) {
    return [];
  }
  try {
    return await invoke<BeatmapSearchItem[]>("search_beatmaps", {
      query: query.trim(),
      basePath: basePath ?? null,
    });
  } catch (error) {
    console.error("Error al buscar beatmaps:", error);
    return [];
  }
}

/**
 * Invalida el caché del índice de búsqueda para forzar un rebuild en la próxima consulta.
 * Usar cuando se sabe que la carpeta Songs cambió (ej: descarga de nuevos mapas).
 */
export interface SkinMetadata {
  name: string;
  author?: string | null;
  folder_name: string;
  folder_path: string;
}

export interface SkinManiaConfig {
  keys: number;
  column_start?: number | null;
  column_width: number[];
  column_spacing: number[];
  hit_position?: number | null;
  light_position?: number | null;
  score_position?: number | null;
  combo_position?: number | null;
  judgement_line?: boolean | null;
  upside_down?: boolean | null;
  barline_height?: number | null;

  key_images: (string | null)[];
  key_images_d: (string | null)[];

  note_images: (string | null)[];
  note_images_h: (string | null)[];
  note_images_l: (string | null)[];
  note_images_t: (string | null)[];

  hit_0?: string | null;
  hit_50?: string | null;
  hit_100?: string | null;
  hit_200?: string | null;
  hit_300?: string | null;
  hit_300g?: string | null;

  stage_hint?: string | null;
  lighting_n?: string | null;
  lighting_l?: string | null;
}

/**
 * Lista todas las skins instaladas en la carpeta Skins de osu!.
 */
export async function listOsuSkins(customDir?: string | null): Promise<SkinMetadata[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<SkinMetadata[]>("list_osu_skins", {
      customDir: customDir ?? null,
    });
  } catch (error) {
    console.error("Error al listar skins de osu!:", error);
    return [];
  }
}

/**
 * Carga y resuelve la configuración de skin.ini para un número de teclas específico (7K o 4K).
 */
export async function loadOsuSkinConfig(
  skinFolderPath: string,
  keyCount: number = 7,
): Promise<SkinManiaConfig | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<SkinManiaConfig>("load_osu_skin_config", {
      skinFolderPath,
      keyCount,
    });
  } catch (error) {
    console.error("Error al cargar configuración de skin:", error);
    return null;
  }
}
