import { useEffect, useRef, useState } from "react";
import { parseOsuFile } from "../../../../src/core/osu/parser";
import type { HitObject, OsuBeatmap } from "../../../../src/core/osu/types";
import { loadBeatmapWithAudio, loadOsuSkinConfig } from "../../lib/native";
import { loadSettings } from "../../lib/settings";
import { getAudioEncoderDelayMs } from "../../lib/audio";
import { PlayEngine } from "../../preview/play-engine";
import { buildPlayfieldPalette, drawPlayfieldFrame, type PlayfieldPalette } from "../../preview/renderer";
import { loadAllSkinTextures, type LoadedSkinTextures } from "../../preview/skin-manager";
import { buildSpeedTimeline, type SpeedTimeline } from "../../preview/speed-timeline";

interface BmsMiniPlayfieldPreviewProps {
  beatmapPath: string | null;
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  scrollSpeed?: number;
  scrollDirection?: "down" | "up";
  hitsoundVolume?: number;
  hitPositionOffset?: number;
  receptorOffset?: number;
  noteHeight?: number;
  onOpenBeatmap?: () => void;
}

export function BmsMiniPlayfieldPreview({
  beatmapPath,
  audioElement,
  isPlaying,
  scrollSpeed = 25,
  scrollDirection = "down",
  hitsoundVolume = 35,
  hitPositionOffset = 20,
  receptorOffset = 0,
  noteHeight = 16,
  onOpenBeatmap,
}: BmsMiniPlayfieldPreviewProps) {
  const [, setBeatmap] = useState<OsuBeatmap | null>(null);
  const [hitObjects4K, setHitObjects4K] = useState<HitObject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [customSkinTextures, setCustomSkinTextures] = useState<LoadedSkinTextures | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const playEngineRef = useRef<PlayEngine>(new PlayEngine([], 4));
  const paletteRef = useRef<PlayfieldPalette>(buildPlayfieldPalette(4));
  const hitObjects4KRef = useRef<HitObject[]>([]);
  const customSkinRef = useRef<LoadedSkinTextures | null>(null);
  const speedTimelineRef = useRef<SpeedTimeline>(buildSpeedTimeline([]));
  const speedLabelRef = useRef<HTMLDivElement | null>(null);

  // Refs reactivos para el bucle de renderizado a 60FPS
  const scrollSpeedRef = useRef<number>(scrollSpeed);
  const scrollDirectionRef = useRef<"down" | "up">(scrollDirection);
  const hitsoundVolumeRef = useRef<number>(hitsoundVolume);
  const hitPositionOffsetRef = useRef<number>(hitPositionOffset);
  const receptorOffsetRef = useRef<number>(receptorOffset);
  const noteHeightRef = useRef<number>(noteHeight);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const lastTimeMsRef = useRef<number>(0);
  const encoderDelayMsRef = useRef<number>(0);
  // Marca que el motor se acaba de (re)inicializar y hay que sembrar el cursor
  // de Autoplay en el tiempo actual para no re-disparar notas ya pasadas.
  const pendingSeedRef = useRef<boolean>(false);

  // Sincronizador de tiempo continuo de alta precisión
  const lastSyncAudioTimeRef = useRef<number>(0);
  const lastSyncPerfTimeRef = useRef<number>(performance.now());

  scrollSpeedRef.current = scrollSpeed;
  scrollDirectionRef.current = scrollDirection;
  hitsoundVolumeRef.current = hitsoundVolume;
  hitPositionOffsetRef.current = hitPositionOffset;
  receptorOffsetRef.current = receptorOffset;
  noteHeightRef.current = noteHeight;
  isPlayingRef.current = isPlaying;
  hitObjects4KRef.current = hitObjects4K;
  customSkinRef.current = customSkinTextures;

  // 1. Cargar Skin 4K configurada en Settings
  useEffect(() => {
    let isCancelled = false;

    async function loadSkin() {
      try {
        const settings = loadSettings();
        if (!settings.selectedSkinPath) {
          setCustomSkinTextures(null);
          return;
        }

        const config = await loadOsuSkinConfig(settings.selectedSkinPath, 4);
        if (config && !isCancelled) {
          const textures = await loadAllSkinTextures(config);
          if (!isCancelled) {
            setCustomSkinTextures(textures);
          }
        }
      } catch (err) {
        console.warn("No se pudo cargar skin para mini preview:", err);
      }
    }

    void loadSkin();

    return () => {
      isCancelled = true;
    };
  }, []);

  // 2. Cargar y parsear el beatmap (normalizando siempre a 4K)
  useEffect(() => {
    if (!beatmapPath) {
      setBeatmap(null);
      setHitObjects4K([]);
      speedTimelineRef.current = buildSpeedTimeline([]);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);

    async function loadMap() {
      try {
        const result = await loadBeatmapWithAudio(beatmapPath!);
        if (isCancelled) return;

        const parsed = parseOsuFile(result.content);
        speedTimelineRef.current = buildSpeedTimeline(parsed.timingPoints);
        
        // Normalizar todas las notas a 4 columnas
        const normalized: HitObject[] = parsed.hitObjects.map((obj) => ({
          ...obj,
          column: obj.column % 4,
        }));

        playEngineRef.current.init(normalized, 4);
        paletteRef.current = buildPlayfieldPalette(4);
        lastTimeMsRef.current = 0;
        pendingSeedRef.current = true;
        // Retardo de encoder según el formato del audio (26 ms solo para MP3).
        encoderDelayMsRef.current = getAudioEncoderDelayMs(result.audioPath ?? "");

        setHitObjects4K(normalized);
        setBeatmap(parsed);
      } catch (err) {
        console.error("Error al cargar beatmap para mini preview:", err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    void loadMap();

    return () => {
      isCancelled = true;
    };
  }, [beatmapPath]);

  // 3. Loop de Renderizado 60FPS con Autoplay, Hitsounds, Combo y MAX
  useEffect(() => {
    function resizeCanvas() {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(Math.max(container.clientWidth, 1) * dpr);
      const h = Math.round(Math.max(container.clientHeight, 1) * dpr);

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    function triggerHitSound(effectiveVol: number) {
      import("../../lib/hitsound").then(({ hitSoundEngine }) => {
        hitSoundEngine.playHit(effectiveVol);
      });
    }

    function drawFrame() {
      const canvas = canvasRef.current;
      const notes = hitObjects4KRef.current;
      if (!canvas || notes.length === 0) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      if (cssWidth === 0 || cssHeight === 0) return;

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const now = performance.now();
      let currentAudioSec = 0;
      
      // Intentar leer el tiempo real del audio
      if (audioElement && !isNaN(audioElement.currentTime)) {
        currentAudioSec = audioElement.currentTime;
      }

      // Si el audio recién se carga o está en 0, calcular un tiempo visual fluido en base a performance.now()
      let timeMs: number;
      
      if (currentAudioSec === 0 && notes.length > 0) {
        // Modo fallback: el audio aún no arranca. Loopear visualmente la preview.
        const firstNoteTime = notes[0]?.timeMs ?? 0;
        timeMs = firstNoteTime + ((now % 30000) / 30000) * 15000;
        
        // Mantener lastSync actualizado para cuando el audio arranque
        lastSyncAudioTimeRef.current = 0;
        lastSyncPerfTimeRef.current = now;
      } else {
        // Sincronización fina con el audio
        if (Math.abs(currentAudioSec - lastSyncAudioTimeRef.current) > 0.04) {
          lastSyncAudioTimeRef.current = currentAudioSec;
          lastSyncPerfTimeRef.current = now;
        }

        const elapsedSinceSync = (now - lastSyncPerfTimeRef.current) / 1000;
        // Restar el encoder delay (según el formato del audio) para que el reloj del
        // render coincida exactamente con las marcas de tiempo del beatmap, igual que el preview principal.
        timeMs = (lastSyncAudioTimeRef.current + elapsedSinceSync) * 1000 - encoderDelayMsRef.current;
      }

      // Si el tiempo loopea hacia atrás o salta repentinamente
      if (timeMs < lastTimeMsRef.current - 400) {
        playEngineRef.current.reset();
        pendingSeedRef.current = true;
      }
      lastTimeMsRef.current = timeMs;

      // Solo procesar Autoplay cuando el audio tiene un reloj real (no en la carga/fallback),
      // para no disparar hitsounds de la nada al cambiar de mapa. Los hitsounds solo suenan
      // si el preview está reproduciéndose (no muteado); el juicio visual sigue activo.
      if (currentAudioSec > 0) {
        if (pendingSeedRef.current) {
          playEngineRef.current.seedAutoplayCursor(timeMs);
          pendingSeedRef.current = false;
        }
        playEngineRef.current.updateAutoplay(
          timeMs,
          isPlayingRef.current ? triggerHitSound : undefined,
          hitsoundVolumeRef.current
        );
      }

      const playState = playEngineRef.current.getState();
      const currentScrollSpeed = scrollSpeedRef.current;
      const currentScrollDirection = scrollDirectionRef.current;
      const speedState = speedTimelineRef.current.stateAt(timeMs);
      if (speedLabelRef.current) {
        if (speedState.mode === "stop") {
          speedLabelRef.current.textContent = "STOP  Visual scroll paused";
        } else {
          const bpmLabel = speedState.bpm > 0 ? `BPM ${Math.round(speedState.bpm)}` : "BPM --";
          speedLabelRef.current.textContent = `${bpmLabel}  SV ${speedState.svMultiplier.toFixed(2)}x`;
        }
      }
      const approachMs = Math.round(17500 / Math.max(currentScrollSpeed, 5));

      drawPlayfieldFrame(
        ctx,
        cssWidth,
        cssHeight,
        notes,
        timeMs,
        4, // 4K forzado
        paletteRef.current,
        {
          approachMs,
          scrollDirection: currentScrollDirection,
          hitGlow: false,
          isPlayMode: true,
          userActiveLanes: playState.activeHeldLanes,
          combo: playState.combo,
          lastBrokenCombo: playState.lastBrokenCombo,
          comboBreakTime: playState.comboBreakTime,
          lastHitTime: playState.lastHitTime,
          hitNoteIndices: playState.hitNoteIndices,
          holdingLnIndices: playState.holdingLnIndices,
          comboPositionPercent: 50, // Forzar Combo/MAX estrictamente al centro
          debugHitWindows: false,
          showLaneSeparators: true,
          noteHeight: noteHeightRef.current,
          showHitError: false,
          lastJudgement: playState.lastJudgement,
          hitPositionOffset: hitPositionOffsetRef.current,
          receptorOffset: receptorOffsetRef.current,
          customSkinTextures: customSkinRef.current,
          speedTimeline: speedTimelineRef.current,
          isCompleted: false,
        }
      );
    }

    function frame() {
      resizeCanvas();
      drawFrame();
      rafIdRef.current = requestAnimationFrame(frame);
    }

    const container = containerRef.current;
    let resizeObserver: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(resizeCanvas);
      resizeObserver.observe(container);
    }

    resizeCanvas();
    rafIdRef.current = requestAnimationFrame(frame);

    return () => {
      resizeObserver?.disconnect();
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [audioElement]);

  return (
    <div
      ref={containerRef}
      className="home-bms-mini-playfield-card"
      onClick={onOpenBeatmap}
      title="Click para abrir en el editor"
    >
      <canvas ref={canvasRef} className="home-bms-mini-canvas" />
      <div ref={speedLabelRef} className="home-bms-mini-speed mono">BPM --  SV 1.00x</div>

      {isLoading && (
        <div className="home-bms-mini-loading mono">
          CARGANDO NOTAS...
        </div>
      )}

      <div className="home-bms-mini-scanlines" />
    </div>
  );
}
