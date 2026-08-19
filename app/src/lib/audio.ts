/**
 * Controlador de audio de alta precisión para VSRG basado en Web Audio API (AudioContext + AudioBuffer).
 *
 * Ventajas sobre HTMLAudioElement:
 * 1. Decodifica el archivo completo en un buffer PCM en RAM: los saltos a cualquier segundo son
 *    instantáneos (0 ms de buffering) y 100% exactos a nivel de muestra matemática.
 * 2. Compensa automáticamente el "encoder delay" inherente de archivos MP3 (1152 muestras / ~26 ms)
 *    para que los golpes musicales y las notas del mapa (.osu) impacten en perfecta sincronía.
 * 3. Comparte el mismo reloj de audio de hardware con los hitsounds.
 */
export interface AudioPlayer {
  /** Carga y decodifica el audio en memoria, devolviendo la duración en milisegundos. */
  load(url: string): Promise<number>;
  /** Inicia o reanuda la reproducción. */
  play(): Promise<void>;
  /** Pausa la reproducción manteniendo la posición exacta. */
  pause(): void;
  /** Salta instantáneamente a cualquier milisegundo de la canción. */
  seek(timeMs: number): void;
  /** Ajusta la velocidad de reproducción sin perder precisión. */
  setPlaybackRate(rate: number): void;
  /** Ajusta el volumen del audio (0.0 a 1.0). */
  setVolume(volume: number): void;
  /** Devuelve la posición actual exacta en milisegundos calibrada con el beatmap. */
  getCurrentTimeMs(): number;
  /** Devuelve la duración total en milisegundos. */
  getDurationMs(): number;
  /** Devuelve true si el audio está en reproducción activa. */
  isPlaying(): boolean;
  /** Siempre false: los seeks en memoria son síncronos e instantáneos. */
  isSeeking(): boolean;
  /** Libera los buffers y el contexto de audio. */
  dispose(): void;
}

/** Retardo estándar de compresión LAME en MP3 (1152 muestras a 44.1kHz ≈ 26.12 ms) */
const MP3_ENCODER_DELAY_MS = 26;

/**
 * Crea un reproductor Web Audio API optimizado para juegos de ritmo.
 */
export function createAudioPlayer(): AudioPlayer {
  let ctx: AudioContext | null = null;
  let audioBuffer: AudioBuffer | null = null;
  let currentSource: AudioBufferSourceNode | null = null;
  let gainNode: GainNode | null = null;

  let isPlaying = false;
  let playbackRate = 1;
  let volume = 0.8;
  let rawDurationMs = 0;

  let startCtxTime = 0;
  let startOffsetSec = 0;
  let pausedOffsetSec = 0;

  function getAudioContext(): AudioContext {
    if (!ctx || ctx.state === "closed") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AudioCtx();
    }
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    return ctx;
  }

  function stopCurrentSource(): void {
    if (currentSource) {
      try {
        currentSource.onended = null;
        currentSource.stop();
        currentSource.disconnect();
      } catch {
        // Ignorar si el nodo ya había finalizado
      }
      currentSource = null;
    }
  }

  function startSourceAt(offsetSec: number): void {
    if (!audioBuffer) return;
    const context = getAudioContext();
    stopCurrentSource();

    const clampedOffset = Math.max(0, Math.min(offsetSec, audioBuffer.duration));
    startOffsetSec = clampedOffset;
    startCtxTime = context.currentTime;
    pausedOffsetSec = clampedOffset;

    if (clampedOffset >= audioBuffer.duration) {
      isPlaying = false;
      return;
    }

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackRate;

    if (!gainNode) {
      gainNode = context.createGain();
      gainNode.gain.setValueAtTime(volume, context.currentTime);
      gainNode.connect(context.destination);
    } else {
      gainNode.gain.setValueAtTime(volume, context.currentTime);
    }

    source.connect(gainNode);

    source.onended = () => {
      if (currentSource === source) {
        currentSource = null;
        isPlaying = false;
        pausedOffsetSec = audioBuffer ? audioBuffer.duration : 0;
      }
    };

    source.start(0, clampedOffset);
    currentSource = source;
    isPlaying = true;
  }

  async function load(url: string): Promise<number> {
    const context = getAudioContext();
    stopCurrentSource();
    isPlaying = false;
    pausedOffsetSec = 0;

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    audioBuffer = await context.decodeAudioData(arrayBuffer);
    rawDurationMs = audioBuffer.duration * 1000;
    return rawDurationMs;
  }

  function play(): Promise<void> {
    if (!audioBuffer) return Promise.resolve();
    const context = getAudioContext();
    if (context.state === "suspended") {
      void context.resume();
    }
    startSourceAt(pausedOffsetSec);
    return Promise.resolve();
  }

  function pause(): void {
    if (!isPlaying) return;
    const currentMs = getCurrentTimeMs();
    pausedOffsetSec = (currentMs + MP3_ENCODER_DELAY_MS) / 1000;
    stopCurrentSource();
    isPlaying = false;
  }

  function seek(timeMs: number): void {
    // Al saltar en la canción, mapeamos el tiempo del beatmap al tiempo real del buffer
    const targetBufferSec = Math.max(0, Math.min((timeMs + MP3_ENCODER_DELAY_MS) / 1000, rawDurationMs / 1000));
    pausedOffsetSec = targetBufferSec;
    if (isPlaying) {
      startSourceAt(targetBufferSec);
    }
  }

  function getCurrentTimeMs(): number {
    if (!audioBuffer) return 0;
    if (isPlaying && ctx) {
      const elapsedCtxTime = ctx.currentTime - startCtxTime;
      const currentBufferSec = startOffsetSec + elapsedCtxTime * playbackRate;
      // Restamos el encoder delay para que el reloj coincida exactamente con las marcas de tiempo del beatmap
      const beatmapTimeMs = currentBufferSec * 1000 - MP3_ENCODER_DELAY_MS;
      return Math.max(0, Math.min(beatmapTimeMs, rawDurationMs));
    }
    const beatmapTimeMs = pausedOffsetSec * 1000 - MP3_ENCODER_DELAY_MS;
    return Math.max(0, Math.min(beatmapTimeMs, rawDurationMs));
  }

  return {
    load,
    play,
    pause,
    seek,
    setPlaybackRate: (rate) => {
      playbackRate = rate;
      if (currentSource && ctx) {
        const currentMs = getCurrentTimeMs();
        startOffsetSec = (currentMs + MP3_ENCODER_DELAY_MS) / 1000;
        startCtxTime = ctx.currentTime;
        currentSource.playbackRate.setValueAtTime(rate, ctx.currentTime);
      }
    },
    setVolume: (vol) => {
      volume = Math.max(0, Math.min(1, vol));
      if (gainNode && ctx) {
        gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      }
    },
    getCurrentTimeMs,
    getDurationMs: () => rawDurationMs,
    isPlaying: () => isPlaying,
    isSeeking: () => false,
    dispose: () => {
      stopCurrentSource();
      if (ctx && ctx.state !== "closed") {
        void ctx.close();
      }
      ctx = null;
      audioBuffer = null;
      gainNode = null;
    },
  };
}
