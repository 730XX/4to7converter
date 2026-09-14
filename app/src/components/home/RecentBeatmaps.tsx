import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Columns2,
  Grid3X3,
  Play,
  Trash2,
  Tv,
  Volume2,
  VolumeX,
} from "lucide-react";
import { formatTimeAgo, type RecentBeatmapItem } from "../../lib/recent-beatmaps";
import { isTauri, loadBeatmapWithAudio, toAssetUrl, toAudioUrl } from "../../lib/native";
import { createAudioPlayer, prefetchAudio, type AudioPlayer } from "../../lib/audio";
import { AudioVisualizer, type VisualizerPalette } from "./AudioVisualizer";
import {
  calculateNpsDensity,
  extractHitObjectTimes,
  extractTimingPoints,
  generateSmoothSvgPath,
  type NpsDensityData,
} from "../../lib/nps-density";
import {
  getTimingSections,
  getKiaiIntervals,
  evaluateDynamicRhythm,
  type TimingSectionInfo,
  type KiaiInterval,
} from "../../preview/beat-grid";
import type { TimingPoint } from "../../../../src/core/osu/types";

type ViewLayoutMode = "grid3" | "grid2" | "bms";

interface RecentBeatmapsProps {
  maps: readonly RecentBeatmapItem[];
  onSelectMap: (path: string) => void;
  onFallbackBrowse: () => void;
  onRemoveMap?: (item: RecentBeatmapItem) => void;
  volume?: number;
  onBmsStateChange?: (
    activeMap: RecentBeatmapItem | null,
    isBmsMode: boolean,
    audioElement: HTMLAudioElement | null,
    isPlaying: boolean,
    audioPlayer?: AudioPlayer | null
  ) => void;
}

function extractPreviewTime(content: string): number {
  const match = content.match(/PreviewTime:\s*(-?\d+)/i);
  if (match && match[1]) {
    const ms = parseInt(match[1], 10);
    return ms > 0 ? ms / 1000 : 0;
  }
  return 0;
}

export function RecentBeatmaps({
  maps,
  onSelectMap,
  onFallbackBrowse,
  onRemoveMap,
  volume = 80,
  onBmsStateChange,
}: RecentBeatmapsProps) {
  const [layoutMode, setLayoutMode] = useState<ViewLayoutMode>(() => {
    try {
      const saved = localStorage.getItem("4to7_recents_layout_mode");
      if (saved === "grid3" || saved === "grid2" || saved === "bms") return saved;
      return "grid3";
    } catch {
      return "grid3";
    }
  });

  const [carouselIndex, setCarouselIndex] = useState(0);
  const [bmsPalette, setBmsPalette] = useState<VisualizerPalette | null>(null);
  const [isPreviewMuted, setIsPreviewMuted] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [rawHitObjectTimes, setRawHitObjectTimes] = useState<number[]>([]);
  const [timingPoints, setTimingPoints] = useState<TimingPoint[]>([]);
  const [timingSections, setTimingSections] = useState<TimingSectionInfo[]>([]);
  const [kiaiIntervals, setKiaiIntervals] = useState<KiaiInterval[]>([]);
  const [npsData, setNpsData] = useState<NpsDensityData | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    timeSec: number;
    nps: number;
    percent: number;
    isKiai?: boolean;
  } | null>(null);
  const [audioPlayer, setAudioPlayer] = useState<AudioPlayer | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const isDraggingScrubberRef = useRef(false);
  const carouselCardRef = useRef<HTMLDivElement | null>(null);

  // Asegurar que carouselIndex siempre esté dentro de rango
  useEffect(() => {
    if (carouselIndex >= maps.length) {
      setCarouselIndex(Math.max(0, maps.length - 1));
    }
  }, [maps.length, carouselIndex]);

  const activeBmsMap = maps[carouselIndex] ?? maps[0] ?? null;
  const activeBmsBgUrl = activeBmsMap?.backgroundPath ? toAssetUrl(activeBmsMap.backgroundPath) : null;

  const onBmsStateChangeRef = useRef(onBmsStateChange);
  useEffect(() => {
    onBmsStateChangeRef.current = onBmsStateChange;
  }, [onBmsStateChange]);

  // Notificar al HomeScreen sobre el modo BMS y el mapa activo
  useEffect(() => {
    onBmsStateChangeRef.current?.(
      activeBmsMap,
      layoutMode === "bms",
      null,
      isPlayingPreview && !isPreviewMuted,
      audioPlayer || playerRef.current
    );
  }, [activeBmsMap, layoutMode, audioPlayer, isPlayingPreview, isPreviewMuted]);

  function changeLayout(mode: ViewLayoutMode) {
    setLayoutMode(mode);
    try {
      localStorage.setItem("4to7_recents_layout_mode", mode);
    } catch {
      // ignore
    }
  }

  // =========================================================================
  // AUDIO PREVIEW ENGINE (Carga y reproduce el audio en PreviewTime con AudioPlayer)
  // =========================================================================
  useEffect(() => {
    // Solo cargar/reproducir audio cuando estamos en modo BMS con un map y en Tauri.
    // El estado de mute NO debe re-ejecutar este efecto (evita recargar y reiniciar el audio).
    if (layoutMode !== "bms" || !activeBmsMap?.path || !isTauri()) {
      if (playerRef.current) {
        playerRef.current.pause();
        playerRef.current.dispose();
        playerRef.current = null;
        setAudioPlayer(null);
        setIsPlayingPreview(false);
        setCurrentTimeSec(0);
        setDurationSec(0);
      }
      setRawHitObjectTimes([]);
      setTimingPoints([]);
      setTimingSections([]);
      setKiaiIntervals([]);
      setNpsData(null);
      setHoverInfo(null);
      return;
    }

    let isCancelled = false;

    // Limpiar intervalo previo de fade
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }

    async function playSongPreview() {
      try {
        if (!activeBmsMap?.path) return;
        const result = await loadBeatmapWithAudio(activeBmsMap.path);
        if (isCancelled || !result.audioPath) return;

        const previewSec = extractPreviewTime(result.content);
        const times = extractHitObjectTimes(result.content);
        setRawHitObjectTimes(times);
        const points = extractTimingPoints(result.content);
        setTimingPoints(points);
        const sections = getTimingSections(points);
        setTimingSections(sections);
        const audioUrl = toAudioUrl(result.audioPath);

        // Desechar reproductor previo si existe
        if (playerRef.current) {
          playerRef.current.dispose();
          playerRef.current = null;
        }

        const player = createAudioPlayer();
        playerRef.current = player;
        setAudioPlayer(player);

        player.setLoop(true);
        const targetVol = isPreviewMuted ? 0 : Math.max(0, Math.min(1, volume / 100));
        player.setVolume(targetVol);

        const durationMs = await player.load(audioUrl);
        if (isCancelled) {
          player.dispose();
          return;
        }

        const durationInSec = durationMs / 1000;
        setDurationSec(durationInSec);

        if (previewSec > 0 && durationInSec > 0 && previewSec < durationInSec) {
          const startMs = previewSec * 1000;
          player.seek(startMs);
          setCurrentTimeSec(previewSec);
        } else {
          player.seek(0);
          setCurrentTimeSec(0);
        }

        await player.play();
        if (isCancelled) {
          player.dispose();
          return;
        }
        setIsPlayingPreview(true);

        // Pre-carga inteligente: predecodificar el audio de los mapas adyacentes en el carrusel
        const nextMap = maps[carouselIndex + 1] ?? maps[0];
        const prevMap = maps[carouselIndex - 1] ?? maps[maps.length - 1];
        const adjacentMaps = [nextMap, prevMap].filter(Boolean);

        for (const adj of adjacentMaps) {
          if (adj?.path && adj.path !== activeBmsMap.path) {
            void loadBeatmapWithAudio(adj.path).then((res) => {
              if (res.audioPath) {
                prefetchAudio(toAudioUrl(res.audioPath));
              }
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.error("Error al cargar audio preview con AudioPlayer:", err);
      }
    }

    void playSongPreview();

    return () => {
      isCancelled = true;
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      if (playerRef.current) {
        playerRef.current.pause();
        playerRef.current.dispose();
        playerRef.current = null;
        setAudioPlayer(null);
      }
    };
  }, [layoutMode, activeBmsMap?.path]);

  // Calcular la curva de densidad NPS cuando la duración y las notas del beatmap estén listas
  useEffect(() => {
    if (durationSec > 0 && rawHitObjectTimes.length > 0) {
      const data = calculateNpsDensity(rawHitObjectTimes, durationSec, 80);
      setNpsData(data);
    } else {
      setNpsData(null);
    }
  }, [durationSec, rawHitObjectTimes]);

  // Calcular intervalos de Kiai a partir de los timing points
  useEffect(() => {
    if (durationSec > 0 && timingPoints.length > 0) {
      const intervals = getKiaiIntervals(timingPoints, durationSec * 1000);
      setKiaiIntervals(intervals);
    } else {
      setKiaiIntervals([]);
    }
  }, [durationSec, timingPoints]);

  // Modular iluminación dinámica del fondo y tarjeta según Kiai Mode (Build-up 3s, Flash drop y pulso)
  useEffect(() => {
    if (
      !isPlayingPreview ||
      isPreviewMuted ||
      layoutMode !== "bms" ||
      timingSections.length === 0
    ) {
      const bgaContainer = document.querySelector<HTMLElement>(".home-bga-container");
      if (bgaContainer) {
        bgaContainer.style.removeProperty("--home-bga-brightness");
        bgaContainer.style.removeProperty("--home-bga-blur");
      }
      if (carouselCardRef.current) {
        carouselCardRef.current.style.removeProperty("--bms-kiai-flash");
        carouselCardRef.current.style.removeProperty("--bms-kiai-active");
      }
      return;
    }

    let animId: number;
    const bgaContainer = document.querySelector<HTMLElement>(".home-bga-container");
    const baseBrightness = 0.35;
    const baseBlur = 45;

    function animateKiai(): void {
      if (playerRef.current) {
        const curTimeMs = playerRef.current.getCurrentTimeMs();
        const { buildupDim, flashIntensity, isInKiai, kiaiWave } = evaluateDynamicRhythm(
          timingSections,
          kiaiIntervals,
          curTimeMs,
        );

        let effectiveBrightness = baseBrightness;
        let effectiveBlur = baseBlur;

        if (buildupDim > 0) {
          // Fase 1: Build-up previo (3s antes): oscurece suavemente hasta un -85%
          effectiveBrightness = baseBrightness * (1 - buildupDim * 0.85);
          effectiveBlur = baseBlur;
        } else if (isInKiai) {
          // Fase 2 y 3: Flash de drop (+85%) y pulsos rítmicos cada 8 beats
          const flashBoost = flashIntensity * 0.85;
          const waveBoost = kiaiWave * 0.55;
          effectiveBrightness = baseBrightness * (1 + Math.max(flashBoost, waveBoost));
          effectiveBlur = Math.max(
            18,
            Math.round(baseBlur - Math.max(flashIntensity * 18, kiaiWave * 12)),
          );
        }

        effectiveBrightness = Math.max(0.04, effectiveBrightness);

        if (bgaContainer) {
          bgaContainer.style.setProperty("--home-bga-brightness", effectiveBrightness.toFixed(3));
          bgaContainer.style.setProperty("--home-bga-blur", `${effectiveBlur}px`);
        }

        if (carouselCardRef.current) {
          carouselCardRef.current.style.setProperty(
            "--bms-kiai-flash",
            flashIntensity.toFixed(3),
          );
          carouselCardRef.current.style.setProperty(
            "--bms-kiai-active",
            isInKiai ? "1" : "0",
          );
        }
      }

      if (playerRef.current && !isDraggingScrubberRef.current) {
        const curSec = playerRef.current.getCurrentTimeMs() / 1000;
        setCurrentTimeSec(curSec);
      }

      animId = requestAnimationFrame(animateKiai);
    }

    animId = requestAnimationFrame(animateKiai);

    return () => {
      cancelAnimationFrame(animId);
      const bga = document.querySelector<HTMLElement>(".home-bga-container");
      if (bga) {
        bga.style.removeProperty("--home-bga-brightness");
        bga.style.removeProperty("--home-bga-blur");
      }
      if (carouselCardRef.current) {
        carouselCardRef.current.style.removeProperty("--bms-kiai-flash");
        carouselCardRef.current.style.removeProperty("--bms-kiai-active");
      }
    };
  }, [isPlayingPreview, isPreviewMuted, layoutMode, timingSections, kiaiIntervals]);

  // Generar las trayectorias SVG continuas (Bézier Spline)
  const svgPaths = useMemo(() => {
    if (!npsData || npsData.normalizedPoints.length === 0) return null;
    return generateSmoothSvgPath(npsData.normalizedPoints, 1000, 20);
  }, [npsData]);

  function handleScrubberSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!playerRef.current || durationSec <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const targetPercent = clickX / rect.width;
    const targetTime = targetPercent * durationSec;
    playerRef.current.seek(targetTime * 1000);
    setCurrentTimeSec(targetTime);
  }

  function handleScrubberMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (durationSec <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = percent * durationSec;

    let nps = 0;
    if (npsData && npsData.rawNpsPoints.length > 0) {
      const sampleIdx = Math.min(
        npsData.rawNpsPoints.length - 1,
        Math.max(0, Math.floor(percent * npsData.rawNpsPoints.length)),
      );
      nps = npsData.rawNpsPoints[sampleIdx] ?? 0;
    }

    const isKiai = kiaiIntervals.some(
      (interval) => targetTime * 1000 >= interval.startMs && targetTime * 1000 <= interval.endMs,
    );

    setHoverInfo({
      timeSec: targetTime,
      nps,
      percent: percent * 100,
      isKiai,
    });
  }

  function handleScrubberMouseLeave() {
    setHoverInfo(null);
  }

  // Sincronizar solo el estado de mute con el reproductor de audio.
  // Silenciar a volumen 0 mantiene la reproducción y posición sincronizada.
  useEffect(() => {
    if (playerRef.current) {
      if (isPreviewMuted) {
        playerRef.current.setVolume(0);
      } else {
        playerRef.current.setVolume(Math.max(0, Math.min(1, volume / 100)));
      }
    }
  }, [isPreviewMuted, volume]);

  // Actualizar volumen en caliente si el usuario usa atajos en el Home
  useEffect(() => {
    if (playerRef.current && !isPreviewMuted) {
      playerRef.current.setVolume(Math.max(0, Math.min(1, volume / 100)));
    }
  }, [volume, isPreviewMuted]);

  // Soporte de navegación por teclado en modo BMS (flechas izquierda/derecha y Enter)
  useEffect(() => {
    if (layoutMode !== "bms" || maps.length === 0) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCarouselIndex((prev) => (prev > 0 ? prev - 1 : maps.length - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCarouselIndex((prev) => (prev < maps.length - 1 ? prev + 1 : 0));
      } else if (e.key === "Enter") {
        const currentMap = maps[carouselIndex];
        if (currentMap) {
          if (currentMap.path) onSelectMap(currentMap.path);
          else onFallbackBrowse();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [layoutMode, maps, carouselIndex, onSelectMap, onFallbackBrowse]);

  if (maps.length === 0) return null;

  return (
    <section className="home-recents-section">
      {/* Header con Switcher de Visualización */}
      <div className="home-recents-header">
        <div className="home-recents-title-wrap">
          <Clock3 size={15} className="home-recents-icon" />
          <h2 className="home-recents-title">Mapas recientes</h2>
          <span className="home-recents-count mono">{maps.length}</span>
        </div>

        {/* Switcher de Vistas: Grilla 3 / Columnas 2 / BMS Showcase */}
        <div className="home-view-switchers">
          <button
            type="button"
            className={`home-view-btn ${layoutMode === "grid3" ? "is-active" : ""}`}
            onClick={() => changeLayout("grid3")}
            title="Grilla de 3 columnas"
          >
            <Grid3X3 size={14} />
            <span>Grid</span>
          </button>

          <button
            type="button"
            className={`home-view-btn ${layoutMode === "grid2" ? "is-active" : ""}`}
            onClick={() => changeLayout("grid2")}
            title="Columnas de 2"
          >
            <Columns2 size={14} />
            <span>Col</span>
          </button>

          <button
            type="button"
            className={`home-view-btn home-view-btn-bms ${layoutMode === "bms" ? "is-active" : ""}`}
            onClick={() => changeLayout("bms")}
            title="Modo BMS Arcade (Carrusel 1 a 1)"
          >
            <Tv size={14} />
            <span>BMS</span>
          </button>
        </div>
      </div>

      {/* VISTA 1 & 2: GRILLAS DE TRACKS (grid3 o grid2) */}
      {layoutMode !== "bms" && (
        <div className={`home-recents-grid ${layoutMode === "grid2" ? "is-grid-2" : "is-grid-3"}`}>
          {maps.map((map) => {
            const bgUrl = map.backgroundPath ? toAssetUrl(map.backgroundPath) : null;

            return (
              <button
                key={map.id}
                type="button"
                onClick={() => {
                  if (map.path) {
                    onSelectMap(map.path);
                  } else {
                    onFallbackBrowse();
                  }
                }}
                className="home-track-card"
              >
                <div className="home-track-jacket-wrap">
                  {bgUrl ? (
                    <img
                      src={bgUrl}
                      alt=""
                      className="home-track-jacket-img"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="home-track-jacket-placeholder"
                      style={{
                        backgroundImage: map.cover ?? "linear-gradient(135deg, #1e293b, #0f172a)",
                      }}
                    />
                  )}
                  <div className="home-track-jacket-play">
                    <Play size={12} fill="currentColor" />
                  </div>
                </div>

                <div className="home-track-info">
                  <div className="home-track-title-row">
                    <span className="home-track-title" title={map.title}>
                      {map.title}
                    </span>
                  </div>

                  <div className="home-track-artist-row">
                    <span className="home-track-artist" title={map.artist}>
                      {map.artist}
                    </span>
                    <span className="home-track-diff-tag">
                      [{map.difficulty}]
                    </span>
                  </div>

                  <div className="home-track-meta-row mono">
                    <span className="home-track-time">{formatTimeAgo(map.timestamp)}</span>
                  </div>
                </div>

                <div className="home-track-side-meta">
                  <span className={`home-track-key-pill mono ${map.keys === 4 ? "is-4k" : "is-7k"}`}>
                    {map.keys}K
                  </span>
                  <span className="home-track-bpm mono">{map.bpm} BPM</span>
                </div>

                <div
                  className="home-track-remove"
                  role="button"
                  aria-label="Quitar de recientes"
                  title="Quitar de recientes"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveMap?.(map);
                  }}
                >
                  <Trash2 size={11} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* VISTA 3: MODO BMS ARCADE (CARRUSEL INMERSIVO 1 A 1 CON AUDIO PREVIEW) */}
      {layoutMode === "bms" && activeBmsMap && (
        <div className="home-bms-showcase-container">
          <div
            ref={carouselCardRef}
            className="home-bms-carousel-card"
            style={
              {
                "--bms-accent": bmsPalette ? `rgb(${bmsPalette.centerRgb.join(",")})` : "#38bdf8",
                "--bms-accent-edge": bmsPalette ? `rgb(${bmsPalette.edgeRgb.join(",")})` : "#818cf8",
                "--bms-accent-bg": bmsPalette ? `rgba(${bmsPalette.centerRgb.join(",")}, 0.14)` : "rgba(56, 189, 248, 0.12)",
                "--bms-accent-border": bmsPalette ? `rgba(${bmsPalette.centerRgb.join(",")}, 0.35)` : "rgba(56, 189, 248, 0.3)",
                "--bms-accent-glow": bmsPalette ? `rgba(${bmsPalette.centerRgb.join(",")}, 0.8)` : "rgba(56, 189, 248, 0.8)",
              } as React.CSSProperties
            }
          >
            {/* Portada / Jacket Gigante con Scanlines y Viñeta */}
            <div className="home-bms-jacket-viewport">
              {activeBmsBgUrl ? (
                <img
                  src={activeBmsBgUrl}
                  alt=""
                  className="home-bms-jacket-full"
                />
              ) : (
                <div
                  className="home-bms-jacket-full-placeholder"
                  style={{
                    backgroundImage: activeBmsMap.cover ?? "linear-gradient(135deg, #0ea5e9, #8b5cf6)",
                  }}
                />
              )}
              <div className="home-bms-jacket-scanlines" />
              <div className="home-bms-jacket-vignette" />

              {/* Badges Flotantes sobre el Jacket */}
              <div className="home-bms-jacket-badges">
                <span className={`home-bms-key-badge mono ${activeBmsMap.keys === 4 ? "is-4k" : "is-7k"}`}>
                  {activeBmsMap.keys}K MODE
                </span>
                <span className="home-bms-bpm-badge mono">{activeBmsMap.bpm} BPM</span>
              </div>

              {/* Opción 3: Visualizador de Audio Arcade en la base del Jacket */}
              <div className="home-bms-jacket-visualizer">
                <AudioVisualizer
                  analyserNode={playerRef.current?.getAnalyserNode() ?? null}
                  isPlaying={isPlayingPreview && !isPreviewMuted}
                  barCount={36}
                  width={280}
                  height={32}
                  coverImageUrl={activeBmsBgUrl}
                  onPaletteChange={setBmsPalette}
                />
              </div>
            </div>

            {/* Panel de Metadatos y Acción Central */}
            <div className="home-bms-info-pane">
              <div className="home-bms-meta-main">
                <div className="home-bms-top-bar">
                  <div className="home-bms-index-indicator mono">
                    STAGE {carouselIndex + 1} / {maps.length}
                  </div>

                  <div className="home-bms-top-actions">
                    {/* Control de Audio Preview */}
                    <button
                      type="button"
                      onClick={() => setIsPreviewMuted((prev) => !prev)}
                      className={`home-bms-audio-toggle ${isPreviewMuted ? "is-muted" : "is-playing"}`}
                      title={isPreviewMuted ? "Activar audio preview" : "Silenciar preview"}
                    >
                      {isPreviewMuted ? (
                        <>
                          <VolumeX size={13} />
                          <span>Mute</span>
                        </>
                      ) : (
                        <Volume2 size={13} />
                      )}
                    </button>

                    {/* Quitar este mapa de recientes */}
                    <button
                      type="button"
                      onClick={() => activeBmsMap && onRemoveMap?.(activeBmsMap)}
                      className="home-bms-remove-btn"
                      title="Quitar de recientes"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <h3 className="home-bms-song-title" title={activeBmsMap.title}>
                  {activeBmsMap.title}
                </h3>

                <div className="home-bms-song-artist-row">
                  <span className="home-bms-artist">{activeBmsMap.artist}</span>
                  <span className="home-bms-diff-badge">[{activeBmsMap.difficulty}]</span>
                </div>

                <div className="home-bms-timestamp mono">
                  Jugado {formatTimeAgo(activeBmsMap.timestamp)}
                </div>

                {/* Reproductor con Visualizador justo arriba de la Línea de Tiempo estilo YouTube */}
                <div className="home-bms-player-block">
                  <div className="home-bms-player-header">
                    <div className="home-bms-player-times mono">
                      <span className="home-bms-time-current">
                        {Math.floor(currentTimeSec / 60)}:
                        {String(Math.floor(currentTimeSec % 60)).padStart(2, "0")}
                      </span>
                      <span className="home-bms-time-sep">/</span>
                      <span className="home-bms-time-total">
                        {durationSec > 0
                          ? `${Math.floor(durationSec / 60)}:${String(Math.floor(durationSec % 60)).padStart(2, "0")}`
                          : "--:--"}
                      </span>
                    </div>
                  </div>

                  {/* Barra de progreso / Scrubbing estilo YouTube con Onda de Densidad NPS */}
                  <div
                    className="home-bms-scrubber"
                    onClick={handleScrubberSeek}
                    onMouseMove={handleScrubberMouseMove}
                    onMouseLeave={handleScrubberMouseLeave}
                    role="slider"
                    aria-label="Línea de tiempo de la canción"
                    aria-valuemin={0}
                    aria-valuemax={durationSec || 100}
                    aria-valuenow={currentTimeSec}
                    tabIndex={0}
                  >
                    {/* Tooltip interactivo flotante al hacer hover */}
                    {hoverInfo && (
                      <div
                        className="home-bms-scrubber-tooltip mono"
                        style={{ left: `${Math.max(10, Math.min(90, hoverInfo.percent))}%` }}
                      >
                        <span className="home-bms-tooltip-time">
                          {Math.floor(hoverInfo.timeSec / 60)}:
                          {String(Math.floor(hoverInfo.timeSec % 60)).padStart(2, "0")}
                        </span>
                        <span className="home-bms-tooltip-sep">•</span>
                        <span className="home-bms-tooltip-nps">{hoverInfo.nps} NPS</span>
                        {hoverInfo.isKiai && (
                          <span className="home-bms-tooltip-kiai">KIAI</span>
                        )}
                      </div>
                    )}

                    {/* Línea guía vertical de hover */}
                    {hoverInfo && (
                      <div
                        className="home-bms-scrubber-hover-line"
                        style={{ left: `${hoverInfo.percent}%` }}
                      />
                    )}

                    {/* Curva suave de densidad NPS (SVG) con soporte de zonas Kiai */}
                    {svgPaths && (
                      <div className="home-bms-nps-wave-container">
                        <svg
                          viewBox="0 0 1000 20"
                          preserveAspectRatio="none"
                          className="home-bms-nps-wave-svg"
                        >
                          <defs>
                            {/* Relleno vertical transparente estilo YouTube (Normal) */}
                            <linearGradient id="bmsWaveFillGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="var(--bms-accent, #38bdf8)" stopOpacity="0.30" />
                              <stop offset="60%" stopColor="var(--bms-accent, #38bdf8)" stopOpacity="0.10" />
                              <stop offset="100%" stopColor="var(--bms-accent, #38bdf8)" stopOpacity="0.02" />
                            </linearGradient>

                            {/* Borde superior con color fuerte vibrante (Normal) */}
                            <linearGradient id="bmsWaveStrokeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="var(--bms-accent, #38bdf8)" stopOpacity="1" />
                              <stop offset="100%" stopColor="var(--bms-accent-edge, #818cf8)" stopOpacity="1" />
                            </linearGradient>

                            {/* Relleno vertical Ámbar / Fuego con EXACTAMENTE la misma transparencia que el color normal */}
                            <linearGradient id="bmsWaveKiaiFillGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.30" />
                              <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.10" />
                              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
                            </linearGradient>

                            {/* Borde superior Dorado Brillante (Kiai Time) */}
                            <linearGradient id="bmsWaveKiaiStrokeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#fbbf24" stopOpacity="1" />
                              <stop offset="100%" stopColor="#f59e0b" stopOpacity="1" />
                            </linearGradient>

                            {/* Clip path según el progreso de reproducción actual */}
                            <clipPath id="bmsWaveProgressClip">
                              <rect
                                x="0"
                                y="0"
                                width={`${durationSec > 0 ? (currentTimeSec / durationSec) * 1000 : 0}`}
                                height="20"
                              />
                            </clipPath>

                            {/* Clip path exclusivo para las zonas donde existe Kiai */}
                            <clipPath id="bmsWaveKiaiClip">
                              {durationSec > 0 &&
                                kiaiIntervals.map((interval, i) => {
                                  const durationMs = durationSec * 1000;
                                  const startX = Math.max(0, (interval.startMs / durationMs) * 1000);
                                  const endX = Math.min(1000, (interval.endMs / durationMs) * 1000);
                                  const rectWidth = Math.max(0, endX - startX);
                                  return (
                                    <rect
                                      key={`kiai-interval-${i}`}
                                      x={startX.toFixed(1)}
                                      y="0"
                                      width={rectWidth.toFixed(1)}
                                      height="20"
                                    />
                                  );
                                })}
                            </clipPath>

                            {/* Máscara que excluye las zonas Kiai para que el relleno normal no se solape con el Kiai */}
                            {kiaiIntervals.length > 0 && (
                              <mask id="bmsWaveNonKiaiMask">
                                <rect x="0" y="0" width="1000" height="20" fill="#ffffff" />
                                {durationSec > 0 &&
                                  kiaiIntervals.map((interval, i) => {
                                    const durationMs = durationSec * 1000;
                                    const startX = Math.max(0, (interval.startMs / durationMs) * 1000);
                                    const endX = Math.min(1000, (interval.endMs / durationMs) * 1000);
                                    const rectWidth = Math.max(0, endX - startX);
                                    return (
                                      <rect
                                        key={`kiai-mask-${i}`}
                                        x={startX.toFixed(1)}
                                        y="0"
                                        width={rectWidth.toFixed(1)}
                                        height="20"
                                        fill="#000000"
                                      />
                                    );
                                  })}
                              </mask>
                            )}
                          </defs>

                          {/* 1. Curva de fondo translúcida (sección no reproducida normal) */}
                          <path
                            d={svgPaths.fillPath}
                            className="home-bms-nps-wave-bg"
                          />
                          <path
                            d={svgPaths.strokePath}
                            className="home-bms-nps-wave-bg-stroke"
                          />

                          {/* 2. Zonas Kiai en la curva de fondo (solo el trazo ámbar para no sumar opacidad al cuerpo) */}
                          {kiaiIntervals.length > 0 && (
                            <g clipPath="url(#bmsWaveKiaiClip)">
                              <path
                                d={svgPaths.strokePath}
                                fill="none"
                                stroke="rgba(245, 158, 11, 0.35)"
                                strokeWidth="1.2"
                              />
                            </g>
                          )}

                          {/* 3. Curva activa reproducida normal (excluyendo zonas Kiai para evitar doble opacidad) */}
                          <g
                            clipPath="url(#bmsWaveProgressClip)"
                            mask={kiaiIntervals.length > 0 ? "url(#bmsWaveNonKiaiMask)" : undefined}
                          >
                            <path
                              d={svgPaths.fillPath}
                              fill="url(#bmsWaveFillGradient)"
                              className="home-bms-nps-wave-fill"
                            />
                            <path
                              d={svgPaths.strokePath}
                              stroke="url(#bmsWaveStrokeGradient)"
                              className="home-bms-nps-wave-stroke"
                            />
                          </g>

                          {/* 4. Curva activa reproducida en Kiai (OJO: SOLO en los tramos Kiai) */}
                          {kiaiIntervals.length > 0 && (
                            <g clipPath="url(#bmsWaveProgressClip)">
                              <g clipPath="url(#bmsWaveKiaiClip)">
                                <path
                                  d={svgPaths.fillPath}
                                  fill="url(#bmsWaveKiaiFillGradient)"
                                  className="home-bms-nps-wave-kiai-fill"
                                />
                                <path
                                  d={svgPaths.strokePath}
                                  stroke="url(#bmsWaveKiaiStrokeGradient)"
                                  className="home-bms-nps-wave-kiai-stroke"
                                />
                              </g>
                            </g>
                          )}
                        </svg>
                      </div>
                    )}

                    <div className="home-bms-scrubber-track">
                      <div
                        className="home-bms-scrubber-fill"
                        style={{
                          width: `${durationSec > 0 ? (currentTimeSec / durationSec) * 100 : 0}%`,
                        }}
                      >
                        <div className="home-bms-scrubber-thumb" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botón de Cargar y Controles del Carrusel */}
              <div className="home-bms-actions-row">
                <button
                  type="button"
                  onClick={() => {
                    if (activeBmsMap.path) onSelectMap(activeBmsMap.path);
                    else onFallbackBrowse();
                  }}
                  className="home-bms-load-btn"
                >
                  <Play size={16} fill="currentColor" />
                  <span>(Enter)</span>
                </button>

                <div className="home-bms-nav-btns">
                  <button
                    type="button"
                    onClick={() =>
                      setCarouselIndex((prev) => (prev > 0 ? prev - 1 : maps.length - 1))
                    }
                    className="home-bms-nav-btn"
                    title="Anterior (←)"
                  >
                    <ChevronLeft size={18} />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setCarouselIndex((prev) => (prev < maps.length - 1 ? prev + 1 : 0))
                    }
                    className="home-bms-nav-btn"
                    title="Siguiente (→)"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tira inferior de Miniaturas para Navegación Rápida */}
          <div className="home-bms-thumbnails-strip">
            {maps.map((map, idx) => {
              const thumbUrl = map.backgroundPath ? toAssetUrl(map.backgroundPath) : null;
              const isSelected = idx === carouselIndex;

              return (
                <button
                  key={`thumb-${map.id}-${idx}`}
                  type="button"
                  onClick={() => setCarouselIndex(idx)}
                  className={`home-bms-thumb-item ${isSelected ? "is-selected" : ""}`}
                  title={`${map.title} - ${map.artist}`}
                >
                  {thumbUrl ? (
                    <img src={thumbUrl} alt="" className="home-bms-thumb-img" />
                  ) : (
                    <div className="home-bms-thumb-placeholder" />
                  )}
                  <span className="home-bms-thumb-idx mono">{idx + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
