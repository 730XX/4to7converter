import { toAssetUrl, type SkinManiaConfig } from "../lib/native";

export interface LoadedSkinTextures {
  keyImages: (HTMLImageElement | null)[];
  keyImagesD: (HTMLImageElement | null)[];
  noteImages: (HTMLImageElement | null)[];
  noteImagesH: (HTMLImageElement | null)[];
  noteImagesL: (HTMLImageElement | null)[];
  noteImagesT: (HTMLImageElement | null)[];
  hit0: HTMLImageElement | null;
  hit50: HTMLImageElement | null;
  hit100: HTMLImageElement | null;
  hit200: HTMLImageElement | null;
  hit300: HTMLImageElement | null;
  hit300g: HTMLImageElement | null;
  stageHint: HTMLImageElement | null;
  lightingN: HTMLImageElement | null;
  lightingL: HTMLImageElement | null;
}

const imageCache = new Map<string, HTMLImageElement>();

/**
 * Carga una imagen de forma asíncrona y la cachea en memoria.
 */
export function loadSkinImage(filePath: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!filePath) {
    return Promise.resolve(null);
  }

  const assetUrl = toAssetUrl(filePath);
  if (imageCache.has(assetUrl)) {
    const cached = imageCache.get(assetUrl)!;
    if (cached.complete && cached.naturalWidth > 0) {
      return Promise.resolve(cached);
    }
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageCache.set(assetUrl, img);
      resolve(img);
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = assetUrl;
  });
}

/**
 * Pre-carga y resuelve todas las texturas HTMLImageElement de un SkinManiaConfig.
 */
export async function loadAllSkinTextures(config: SkinManiaConfig | null): Promise<LoadedSkinTextures | null> {
  if (!config) return null;

  const [
    keyImages,
    keyImagesD,
    noteImages,
    noteImagesH,
    noteImagesL,
    noteImagesT,
    hit0,
    hit50,
    hit100,
    hit200,
    hit300,
    hit300g,
    stageHint,
    lightingN,
    lightingL,
  ] = await Promise.all([
    Promise.all(config.key_images.map((p) => loadSkinImage(p))),
    Promise.all(config.key_images_d.map((p) => loadSkinImage(p))),
    Promise.all(config.note_images.map((p) => loadSkinImage(p))),
    Promise.all(config.note_images_h.map((p) => loadSkinImage(p))),
    Promise.all(config.note_images_l.map((p) => loadSkinImage(p))),
    Promise.all(config.note_images_t.map((p) => loadSkinImage(p))),
    loadSkinImage(config.hit_0),
    loadSkinImage(config.hit_50),
    loadSkinImage(config.hit_100),
    loadSkinImage(config.hit_200),
    loadSkinImage(config.hit_300),
    loadSkinImage(config.hit_300g),
    loadSkinImage(config.stage_hint),
    loadSkinImage(config.lighting_n),
    loadSkinImage(config.lighting_l),
  ]);

  return {
    keyImages,
    keyImagesD,
    noteImages,
    noteImagesH,
    noteImagesL,
    noteImagesT,
    hit0,
    hit50,
    hit100,
    hit200,
    hit300,
    hit300g,
    stageHint,
    lightingN,
    lightingL,
  };
}
