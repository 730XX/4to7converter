import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { OsuBeatmap } from "../../../src/core/osu/types";
import { createAudioPlayer, type AudioPlayer } from "./audio";
import { hitSoundEngine } from "./hitsound.js";

/** Tiempo adicional tras la última nota donde la vista previa sigue activa. */
const END_PADDING_MS = 2000;

/** Intervalo aproximado de sincronización de la etiqueta de tiempo. */
const LABEL_SYNC_MS = 100;

/** Tolerancia al detectar el fin del audio. */
const END_EPSILON_MS = 20;

/** Controles de reproducción compartidos entre el playfield y la barra inferior. */
export interface PlaybackControls {
  isPlaying: boolean;
  speed: number;
  setSpeed: (speed: number) => void;
  /** Tiempo mostrado en la etiqueta, actualizado aproximadamente cada 100 ms. */
  timerTimeMs: number;
  durationMs: number;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  seekTo: (timeMs: number) => void;
  restart: () => void;
  /** Reloj en vivo que el bucle de dibujo del canvas lee en cada fotograma. */
  currentTimeMsRef: RefObject<number>;
}

/**
 * Opciones del hook de reproducción: el beatmap convertido, la URL de audio y
 * los parámetros de los hitsounds sintéticos.
 */
export interface UsePlaybackOptions {
  beatmap: OsuBeatmap;
  audioUrl: string | null;
  volume?: number; // 0 - 100
  hitsoundsEnabled?: boolean;
  hitsoundVolume?: number; // 0 - 100
}

/**
 * Hook que centraliza toda la lógica de reproducción de la vista previa: ciclo
 * de vida del reproductor de audio, reloj maestro, detección de fin, control
 * de velocidad y atajo de teclado (Espacio). El dibujo del canvas queda fuera
 * del hook; el playfield consume {@link PlaybackControls.currentTimeMsRef}.
 *
 * @param options - El beatmap convertido y la URL de audio asociada, o null.
 * @returns Controles de reproducción listos para la UI.
 */
export function usePlayback(options: UsePlaybackOptions): PlaybackControls {
  const { beatmap, audioUrl, volume = 80, hitsoundsEnabled = true, hitsoundVolume = 80 } = options;
  const audioRef = useRef<AudioPlayer | null>(null);
  const isPlayingRef = useRef(false);
  const currentTimeMsRef = useRef(0);
  const lastFrameNowRef = useRef(-1);
  const lastLabelSyncRef = useRef(0);
  const audioDurationRef = useRef<number | null>(null);
  const endBoundRef = useRef(0);
  const durationMsRef = useRef(0);
  const speedRef = useRef(1);
  const volumeRef = useRef(volume);
  const beatmapRef = useRef(beatmap);
  const hitsoundsEnabledRef = useRef(hitsoundsEnabled);
  const hitsoundVolumeRef = useRef(hitsoundVolume);
  const hitsoundLastCheckedRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [timerTimeMs, setTimerTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  speedRef.current = speed;
  volumeRef.current = volume;
  beatmapRef.current = beatmap;
  hitsoundsEnabledRef.current = hitsoundsEnabled;
  hitsoundVolumeRef.current = hitsoundVolume;

  useEffect(() => {
    volumeRef.current = volume;
    audioRef.current?.setVolume(volume / 100);
  }, [volume]);

  const lastNoteEndMs = useMemo(() => {
    let end = 0;
    for (const hitObject of beatmap.hitObjects) {
      end = Math.max(end, hitObject.endTimeMs ?? hitObject.timeMs);
    }
    return end;
  }, [beatmap]);

  function syncDuration(): void {
    const next = audioDurationRef.current ?? endBoundRef.current;
    durationMsRef.current = next;
    setDurationMs(next);
  }

  useEffect(() => {
    endBoundRef.current = lastNoteEndMs + END_PADDING_MS;
    syncDuration();
  }, [lastNoteEndMs]);

  useEffect(() => {
    speedRef.current = speed;
    audioRef.current?.setPlaybackRate(speed);
  }, [speed]);

  useEffect(() => {
    if (audioUrl === null) {
      audioRef.current?.dispose();
      audioRef.current = null;
      audioDurationRef.current = null;
      syncDuration();
      return;
    }
    const player = createAudioPlayer();
    audioRef.current = player;
    player.setPlaybackRate(speedRef.current);
    player.setVolume(volumeRef.current / 100);
    let cancelled = false;
    player
      .load(audioUrl)
      .then((duration) => {
        if (cancelled) {
          return;
        }
        audioDurationRef.current = duration;
        syncDuration();
        if (isPlayingRef.current) {
          player.seek(currentTimeMsRef.current);
          void player.play();
        }
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        audioDurationRef.current = null;
        syncDuration();
      });
    return () => {
      cancelled = true;
      player.dispose();
      if (audioRef.current === player) {
        audioRef.current = null;
      }
      audioDurationRef.current = null;
      syncDuration();
    };
  }, [audioUrl]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }
    }

    function frame(now: number): void {
      const audio = audioRef.current;
      const audioAvailable = audio !== null && audioDurationRef.current !== null;

      if (isPlayingRef.current) {
        if (audioAvailable) {
          lastFrameNowRef.current = now;
          if (!audio.isSeeking()) {
            currentTimeMsRef.current = audio.getCurrentTimeMs();
          }
          const audioDuration = audioDurationRef.current ?? 0;
          if (currentTimeMsRef.current >= audioDuration - END_EPSILON_MS) {
            stopPlayback();
          }
        } else if (lastFrameNowRef.current >= 0) {
          const elapsed = (now - lastFrameNowRef.current) * speedRef.current;
          lastFrameNowRef.current = now;
          currentTimeMsRef.current = Math.min(
            currentTimeMsRef.current + elapsed,
            endBoundRef.current,
          );
          if (currentTimeMsRef.current >= endBoundRef.current) {
            stopPlayback();
          }
        }

        // Detección determinista de hitsounds: cada nota cuyo tiempo cae en el
        // intervalo recién recorrido dispara un hit. El guard de 500 ms evita
        // una ráfaga de hits tras un seek o restart.
        const hitDelta = currentTimeMsRef.current - hitsoundLastCheckedRef.current;
        if (hitsoundsEnabledRef.current && hitDelta > 0 && hitDelta < 500) {
          for (const hitObject of beatmapRef.current.hitObjects) {
            if (
              hitObject.timeMs > hitsoundLastCheckedRef.current &&
              hitObject.timeMs <= currentTimeMsRef.current
            ) {
              hitSoundEngine.playHit(hitsoundVolumeRef.current / 100);
            }
          }
        }
      }

      if (isPlayingRef.current && currentTimeMsRef.current >= endBoundRef.current) {
        stopPlayback();
      }

      hitsoundLastCheckedRef.current = currentTimeMsRef.current;

      if (now - lastLabelSyncRef.current >= LABEL_SYNC_MS) {
        lastLabelSyncRef.current = now;
        setTimerTimeMs(Math.round(currentTimeMsRef.current));
        setDurationMs(durationMsRef.current);
      }

      rafIdRef.current = requestAnimationFrame(frame);
    }

    window.addEventListener("keydown", handleKeyDown);
    rafIdRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  function stopPlayback(): void {
    isPlayingRef.current = false;
    setIsPlaying(false);
    lastFrameNowRef.current = -1;
    audioRef.current?.pause();
    if (currentTimeMsRef.current >= endBoundRef.current) {
      currentTimeMsRef.current = endBoundRef.current;
    }
  }

  function play(): void {
    const audio = audioRef.current;
    if (audio !== null && audioDurationRef.current !== null) {
      audio.setPlaybackRate(speedRef.current);
      void audio.play();
    }
    lastFrameNowRef.current = performance.now();
    isPlayingRef.current = true;
    setIsPlaying(true);
  }

  function pause(): void {
    isPlayingRef.current = false;
    setIsPlaying(false);
    lastFrameNowRef.current = -1;
    audioRef.current?.pause();
  }

  function togglePlay(): void {
    if (isPlayingRef.current) {
      pause();
    } else {
      play();
    }
  }

  function seekTo(timeMs: number): void {
    const clamped = Math.max(0, Math.min(timeMs, durationMsRef.current));
    currentTimeMsRef.current = clamped;
    hitsoundLastCheckedRef.current = clamped;
    lastFrameNowRef.current = performance.now();
    audioRef.current?.seek(clamped);
    setTimerTimeMs(Math.round(clamped));
  }

  function restart(): void {
    seekTo(0);
    play();
  }

  return {
    isPlaying,
    speed,
    setSpeed,
    timerTimeMs,
    durationMs,
    togglePlay,
    play,
    pause,
    seekTo,
    restart,
    currentTimeMsRef,
  };
}
