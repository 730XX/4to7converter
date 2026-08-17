/**
 * Controlador de audio para la vista previa. Oculta el elemento
 * HTMLAudioElement subyacente y expone solo las operaciones que el playfield
 * necesita, con el tiempo expresado en milisegundos.
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
  /** Pausa y libera el recurso de audio. */
  dispose(): void;
}

/**
 * Crea un reproductor de audio basado en un elemento HTMLAudioElement.
 */
export function createAudioPlayer(): AudioPlayer {
  const element = new Audio();

  function load(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const onMetadata = (): void => {
        element.removeEventListener("loadedmetadata", onMetadata);
        element.removeEventListener("error", onError);
        resolve(element.duration * 1000);
      };
      const onError = (): void => {
        element.removeEventListener("loadedmetadata", onMetadata);
        element.removeEventListener("error", onError);
        reject(new Error("No se pudo cargar el audio."));
      };
      element.addEventListener("loadedmetadata", onMetadata);
      element.addEventListener("error", onError);
      element.src = url;
      element.load();
    });
  }

  return {
    load,
    play: () => element.play(),
    pause: () => element.pause(),
    seek: (timeMs) => {
      element.currentTime = timeMs / 1000;
    },
    setPlaybackRate: (rate) => {
      element.playbackRate = rate;
    },
    setVolume: (vol) => {
      element.volume = Math.max(0, Math.min(1, vol));
    },
    getCurrentTimeMs: () => (Number.isFinite(element.currentTime) ? element.currentTime * 1000 : 0),
    getDurationMs: () => (Number.isFinite(element.duration) ? element.duration * 1000 : 0),
    isPlaying: () => !element.paused,
    dispose: () => {
      element.pause();
      element.removeAttribute("src");
      element.load();
    },
  };
}
