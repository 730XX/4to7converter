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
  /** Configura si la reproducción debe repetirse en bucle continuo. */
  setLoop(loop: boolean): void;
  /** Siempre false: los seeks en memoria son síncronos e instantáneos. */
  isSeeking(): boolean;
  /** Devuelve el AnalyserNode para visualizadores de espectro en tiempo real. */
  getAnalyserNode(): AnalyserNode | null;
  /** Pausa y libera los buffers y el contexto de audio. */
  dispose(): void;
}

/** Retardo estándar de compresión LAME en MP3 (1152 muestras a 44.1kHz ≈ 26.12 ms) */
export const MP3_ENCODER_DELAY_MS = 26;

/**
 * Retardo de encoder según el formato de audio. El "encoder delay" solo aplica a
 * formatos con lead-in de compresión (MP3/LAME ≈ 26 ms). OGG/Vorbis, WAV, FLAC,
 * AAC/M4A y Opus no añaden ese retardo (o lo traen a ~0), por lo que aplicar 26 ms
 * ahí desincroniza la preview. Se decide por la extensión del archivo/URL.
 */
export function getAudioEncoderDelayMs(audioUrlOrPath: string): number {
  const clean = ((audioUrlOrPath || "").split("?")[0] ?? "").toLowerCase();
  if (clean.endsWith(".mp3")) {
    return MP3_ENCODER_DELAY_MS;
  }
  return 0;
}

// =========================================================================
// SINGLETON AUDIOCONTEXT Y CACHE LRU DE AUDIOBUFFER
// =========================================================================
let sharedAudioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === "suspended") {
    void sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

const MAX_BUFFER_CACHE_ENTRIES = 12;
const bufferCache = new Map<string, AudioBuffer>();
const pendingDecodes = new Map<string, Promise<AudioBuffer>>();

/**
 * Carga y decodifica un archivo de audio en un AudioBuffer usando cache LRU y deduplicación.
 */
export async function getOrFetchAudioBuffer(url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) {
    // Promover en la cola LRU
    bufferCache.delete(url);
    bufferCache.set(url, cached);
    return cached;
  }

  const existingPromise = pendingDecodes.get(url);
  if (existingPromise) {
    return existingPromise;
  }

  const decodePromise = (async () => {
    try {
      const context = getSharedAudioContext();
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const decoded = await context.decodeAudioData(arrayBuffer);

      // Manejar política LRU si se supera el tamaño máximo
      if (bufferCache.size >= MAX_BUFFER_CACHE_ENTRIES) {
        const oldestKey = bufferCache.keys().next().value;
        if (oldestKey) {
          bufferCache.delete(oldestKey);
        }
      }
      bufferCache.set(url, decoded);
      return decoded;
    } finally {
      pendingDecodes.delete(url);
    }
  })();

  pendingDecodes.set(url, decodePromise);
  return decodePromise;
}

/**
 * Pre-decodifica en segundo plano el audio de una URL para que esté listo al instante (0ms).
 */
export function prefetchAudio(url: string): void {
  if (!url || bufferCache.has(url) || pendingDecodes.has(url)) return;
  void getOrFetchAudioBuffer(url).catch(() => {
    // Ignorar errores de prefetch silenciosamente
  });
}

/**
 * Crea un reproductor Web Audio API optimizado para juegos de ritmo.
 */
export function createAudioPlayer(): AudioPlayer {
  let audioBuffer: AudioBuffer | null = null;
  let currentSource: AudioBufferSourceNode | null = null;
  let gainNode: GainNode | null = null;
  let analyserNode: AnalyserNode | null = null;

  let isPlaying = false;
  let isLooping = false;
  let playbackRate = 1.0;
  let volume = 0.8;
  let rawDurationMs = 0;
  let encoderDelayMs = MP3_ENCODER_DELAY_MS;

  let startCtxTime = 0;
  let startOffsetSec = 0;
  let pausedOffsetSec = 0;

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
    const context = getSharedAudioContext();
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
    source.loop = isLooping;
    if (isLooping && audioBuffer) {
      source.loopStart = 0;
      source.loopEnd = audioBuffer.duration;
    }

    if (!gainNode) {
      gainNode = context.createGain();
      gainNode.gain.setValueAtTime(volume, context.currentTime);

      analyserNode = context.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.35;
      analyserNode.minDecibels = -90;
      analyserNode.maxDecibels = -15;

      gainNode.connect(analyserNode);
      analyserNode.connect(context.destination);
    } else {
      gainNode.gain.setValueAtTime(volume, context.currentTime);
    }

    source.connect(gainNode);

    source.onended = () => {
      if (currentSource === source) {
        if (!isLooping) {
          currentSource = null;
          isPlaying = false;
          pausedOffsetSec = audioBuffer ? audioBuffer.duration : 0;
        }
      }
    };

    source.start(0, clampedOffset);
    currentSource = source;
    isPlaying = true;
  }

  async function load(url: string): Promise<number> {
    stopCurrentSource();
    isPlaying = false;
    pausedOffsetSec = 0;

    encoderDelayMs = getAudioEncoderDelayMs(url);

    audioBuffer = await getOrFetchAudioBuffer(url);
    rawDurationMs = audioBuffer.duration * 1000;
    return rawDurationMs;
  }

  function play(): Promise<void> {
    if (!audioBuffer) return Promise.resolve();
    const context = getSharedAudioContext();
    if (context.state === "suspended") {
      void context.resume();
    }
    startSourceAt(pausedOffsetSec);
    return Promise.resolve();
  }

  function pause(): void {
    if (!isPlaying) return;
    const currentMs = getCurrentTimeMs();
    pausedOffsetSec = (currentMs + encoderDelayMs) / 1000;
    stopCurrentSource();
    isPlaying = false;
  }

  function seek(timeMs: number): void {
    // Al saltar en la canción, mapeamos el tiempo del beatmap al tiempo real del buffer
    const targetBufferSec = Math.max(0, Math.min((timeMs + encoderDelayMs) / 1000, rawDurationMs / 1000));
    pausedOffsetSec = targetBufferSec;
    if (isPlaying) {
      startSourceAt(targetBufferSec);
    }
  }

  function getCurrentTimeMs(): number {
    if (!audioBuffer) return 0;
    const context = getSharedAudioContext();
    if (isPlaying) {
      const elapsedCtxTime = context.currentTime - startCtxTime;
      let currentBufferSec = startOffsetSec + elapsedCtxTime * playbackRate;
      if (isLooping && audioBuffer && audioBuffer.duration > 0) {
        currentBufferSec = currentBufferSec % audioBuffer.duration;
      }
      // Restamos el encoder delay para que el reloj coincida exactamente con las marcas de tiempo del beatmap
      const beatmapTimeMs = currentBufferSec * 1000 - encoderDelayMs;
      return Math.max(0, Math.min(beatmapTimeMs, rawDurationMs));
    }
    const beatmapTimeMs = pausedOffsetSec * 1000 - encoderDelayMs;
    return Math.max(0, Math.min(beatmapTimeMs, rawDurationMs));
  }

  return {
    load,
    play,
    pause,
    seek,
    setPlaybackRate: (rate) => {
      playbackRate = rate;
      const context = getSharedAudioContext();
      if (currentSource) {
        const currentMs = getCurrentTimeMs();
        startOffsetSec = (currentMs + encoderDelayMs) / 1000;
        startCtxTime = context.currentTime;
        currentSource.playbackRate.setValueAtTime(rate, context.currentTime);
      }
    },
    setVolume: (vol) => {
      volume = Math.max(0, Math.min(1, vol));
      const context = getSharedAudioContext();
      if (gainNode) {
        gainNode.gain.setValueAtTime(volume, context.currentTime);
      }
    },
    getCurrentTimeMs,
    getDurationMs: () => rawDurationMs,
    isPlaying: () => isPlaying,
    setLoop: (loop: boolean) => {
      isLooping = loop;
      if (currentSource) {
        currentSource.loop = loop;
        if (loop && audioBuffer) {
          currentSource.loopStart = 0;
          currentSource.loopEnd = audioBuffer.duration;
        }
      }
    },
    isSeeking: () => false,
    getAnalyserNode: () => analyserNode,
    dispose: () => {
      stopCurrentSource();
      if (gainNode) {
        try {
          gainNode.disconnect();
        } catch {}
      }
      if (analyserNode) {
        try {
          analyserNode.disconnect();
        } catch {}
      }
      audioBuffer = null;
      gainNode = null;
      analyserNode = null;
    },
  };
}
