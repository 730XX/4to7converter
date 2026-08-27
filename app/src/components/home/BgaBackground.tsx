import { useEffect, useMemo, useRef, useState } from "react";

// Importar todos los frames .bmp recursivamente de todas las subcarpetas de angelic-layer
const allFrameModules = import.meta.glob<{ default: string }>(
  "../../assets/angelic-layer/**/*.bmp",
  { eager: true }
);

/**
 * Agrupa los frames por subcarpeta/escena (ej. "la", "lb", "lc", "ph")
 * y los ordena secuencialmente dentro de cada escena.
 */
function buildScenes(): { id: string; frames: string[] }[] {
  const sceneMap: Record<string, { path: string; url: string }[]> = {};

  for (const [filePath, mod] of Object.entries(allFrameModules)) {
    // Normalizar separador de ruta para extraer la carpeta de escena
    const normalized = filePath.replace(/\\/g, "/");
    const parts = normalized.split("/");
    // Extraer nombre de la carpeta (la, lb, lc, ph...)
    const sceneName = parts[parts.length - 2] ?? "default";

    if (!sceneMap[sceneName]) {
      sceneMap[sceneName] = [];
    }
    sceneMap[sceneName].push({ path: normalized, url: mod.default });
  }

  return Object.entries(sceneMap).map(([sceneId, items]) => {
    const sortedFrames = items
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((item) => item.url);
    return { id: sceneId, frames: sortedFrames };
  });
}

// 12 FPS para el loop de frames BMS
const BGA_INTERVAL_MS = 1000 / 12;

// Duración aleatoria por escena: mínimo 30s, hasta 55s
function getRandomSceneDurationMs(): number {
  return 30000 + Math.floor(Math.random() * 25000);
}

export function BgaBackground() {
  const scenes = useMemo(() => buildScenes(), []);
  // Elegir una escena inicial aleatoria al montar
  const [currentSceneIndex, setCurrentSceneIndex] = useState(() =>
    scenes.length > 0 ? Math.floor(Math.random() * scenes.length) : 0
  );
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const switchTimerRef = useRef<number | null>(null);

  // Precargar todas las imágenes de todas las escenas en memoria
  useEffect(() => {
    for (const scene of scenes) {
      for (const frameUrl of scene.frames) {
        const img = new Image();
        img.src = frameUrl;
      }
    }
  }, [scenes]);

  // Loop de reproducción de frames de la escena activa
  useEffect(() => {
    const activeFrames = scenes[currentSceneIndex]?.frames;
    if (!activeFrames || activeFrames.length === 0) return;

    setCurrentFrameIndex(0);

    const frameInterval = window.setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % activeFrames.length);
    }, BGA_INTERVAL_MS);

    return () => {
      window.clearInterval(frameInterval);
    };
  }, [currentSceneIndex, scenes]);

  // Temporizador para cambiar aleatoriamente de escena (mínimo 20 segundos)
  useEffect(() => {
    if (scenes.length <= 1) return;

    function scheduleNextScene() {
      const durationMs = getRandomSceneDurationMs();
      switchTimerRef.current = window.setTimeout(() => {
        // Efecto de fade suave antes de cambiar
        setIsFading(true);
        window.setTimeout(() => {
          setCurrentSceneIndex((prev) => {
            // Seleccionar otra escena al azar distinta de la actual
            let nextIndex = prev;
            while (nextIndex === prev && scenes.length > 1) {
              nextIndex = Math.floor(Math.random() * scenes.length);
            }
            return nextIndex;
          });
          setIsFading(false);
        }, 300);
      }, durationMs);
    }

    scheduleNextScene();

    return () => {
      if (switchTimerRef.current !== null) {
        window.clearTimeout(switchTimerRef.current);
      }
    };
  }, [currentSceneIndex, scenes]);

  if (scenes.length === 0) return null;

  const currentScene = scenes[currentSceneIndex];
  const currentSrc = currentScene?.frames[currentFrameIndex];
  if (!currentSrc) return null;

  return (
    <div
      className={`home-bga-container ${isFading ? "is-scene-fading" : ""}`}
      aria-hidden="true"
    >
      {/* 1. Capa ambiental a pantalla completa con blur */}
      <img
        src={currentSrc}
        alt=""
        className="home-bga-ambient-img"
        loading="eager"
        decoding="sync"
      />

      {/* 2. Capa central retro-BMS nítida (pixel-perfect) */}
      <div className="home-bga-screen-frame">
        <img
          src={currentSrc}
          alt=""
          className="home-bga-sharp-img"
          loading="eager"
          decoding="sync"
        />
        <div className="home-bga-scanlines" />
        <div className="home-bga-vignette" />
      </div>

      {/* 3. Overlay oscuro para asegurar contraste impecable de la UI */}
      <div className="home-bga-dim-overlay" />
    </div>
  );
}
