/**
 * Controlador de audio para la vista previa. Oculta el elemento
 * HTMLAudioElement subyacente y expone solo las operaciones que el playfield
 * necesita, con el tiempo expresado en milisegundos y sincronización a prueba de scrubbing rápido.
 */
export interface AudioPlayer {
  /** Carga una URL de audio y resuelve con la duración en milisegundos. */
  load(url: string): Promise<number>;
  /** Comienza o reanuda la reproducción desde la posición actual. */
  play(): Promise<void>;
  /** Pausa la reproducción manteniendo la posición actual. */
  pause(): void;
  /** Mueve la posición de reproducción a un tiempo en milisegundos. */
  seek(timeMs: number): void;
  /** Ajusta la velocidad de reproducción, donde 1 es la velocidad normal. */
  setPlaybackRate(rate: number): void;
  /** Ajusta el volumen del audio (0.0 a 1.0). */
  setVolume(volume: number): void;
  /** Devuelve la posición actual en milisegundos (reloj maestro). */
  getCurrentTimeMs(): number;
  /** Devuelve la duración total en milisegundos, o 0 si aún no se cargó. */
  getDurationMs(): number;
  /** Devuelve true mientras el audio se está reproduciendo. */
  isPlaying(): boolean;
  /** Devuelve true si el decoder de audio está ejecutando un seek asíncrono. */
  isSeeking(): boolean;
  /** Pausa y libera el recurso de audio. */
  dispose(): void;
}

/**
 * Crea un reproductor de audio optimizado basado en un elemento HTMLAudioElement,
 * con protección contra desincronización por scrubbing rápido de rueda.
 */
export function createAudioPlayer(): AudioPlayer {
  const element = new Audio();
  element.preload = "auto";

  let isSeeking = false;
  let targetTimeMs: number | null = null;
  let seekRafId: number | null = null;
  let pendingSeekSec: number | null = null;

  element.addEventListener("seeking", () => {
    isSeeking = true;
  });

  element.addEventListener("seeked", () => {
    isSeeking = false;
    targetTimeMs = null;
  });

  function performPendingSeek(): void {
    seekRafId = null;
    if (pendingSeekSec !== null && element.readyState >= 1) {
      const target = pendingSeekSec;
      pendingSeekSec = null;
      try {
        if ("fastSeek" in element && typeof element.fastSeek === "function") {
          element.fastSeek(target);
        } else {
          element.currentTime = target;
        }
      } catch {
        element.currentTime = target;
      }
    }
  }

  function scheduleSeek(sec: number): void {
    pendingSeekSec = sec;
    if (seekRafId === null) {
      seekRafId = requestAnimationFrame(performPendingSeek);
    }
  }

  function load(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const onMetadata = (): void => {
        cleanup();
        resolve(element.duration * 1000);
      };
      const onError = (): void => {
        cleanup();
        reject(new Error("No se pudo cargar el audio."));
      };
      function cleanup(): void {
        element.removeEventListener("loadedmetadata", onMetadata);
        element.removeEventListener("error", onError);
      }
      element.addEventListener("loadedmetadata", onMetadata);
      element.addEventListener("error", onError);
      element.src = url;
      element.load();
    });
  }

  return {
    load,
    play: () => element.play(),
    pause: () => {
      if (seekRafId !== null) {
        cancelAnimationFrame(seekRafId);
        performPendingSeek();
      }
      element.pause();
    },
    seek: (timeMs) => {
      targetTimeMs = timeMs;
      const targetSec = Math.max(0, timeMs / 1000);
      scheduleSeek(targetSec);
    },
    setPlaybackRate: (rate) => {
      element.playbackRate = rate;
    },
    setVolume: (vol) => {
      element.volume = Math.max(0, Math.min(1, vol));
    },
    getCurrentTimeMs: () => {
      if (isSeeking && targetTimeMs !== null) {
        return targetTimeMs;
      }
      return Number.isFinite(element.currentTime) ? element.currentTime * 1000 : 0;
    },
    getDurationMs: () => (Number.isFinite(element.duration) ? element.duration * 1000 : 0),
    isPlaying: () => !element.paused,
    isSeeking: () => isSeeking,
    dispose: () => {
      if (seekRafId !== null) {
        cancelAnimationFrame(seekRafId);
      }
      element.pause();
      element.removeAttribute("src");
      element.load();
    },
  };
}
