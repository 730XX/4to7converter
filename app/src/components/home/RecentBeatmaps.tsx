import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Columns2,
  Grid3X3,
  Play,
  Tv,
  Volume2,
  VolumeX,
} from "lucide-react";
import { formatTimeAgo, type RecentBeatmapItem } from "../../lib/recent-beatmaps";
import { isTauri, loadBeatmapWithAudio, toAssetUrl, toAudioUrl } from "../../lib/native";
import { AudioVisualizer } from "./AudioVisualizer";

type ViewLayoutMode = "grid3" | "grid2" | "bms";

interface RecentBeatmapsProps {
  maps: readonly RecentBeatmapItem[];
  onSelectMap: (path: string) => void;
  onFallbackBrowse: () => void;
  volume?: number;
  onBmsStateChange?: (
    activeMap: RecentBeatmapItem | null,
    isBmsMode: boolean,
    audioElement: HTMLAudioElement | null,
    isPlaying: boolean
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
  const [isPreviewMuted, setIsPreviewMuted] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);

  // Inicializar Audio una sola vez
  useEffect(() => {
    if (!audioRef.current && typeof Audio !== "undefined") {
      const audio = new Audio();
      audio.loop = true;
      audio.crossOrigin = "anonymous";
      audioRef.current = audio;
      setAudioEl(audio);
    }
  }, []);

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
      audioEl || audioRef.current,
      isPlayingPreview && !isPreviewMuted
    );
  }, [activeBmsMap, layoutMode, audioEl, isPlayingPreview, isPreviewMuted]);

  function changeLayout(mode: ViewLayoutMode) {
    setLayoutMode(mode);
    try {
      localStorage.setItem("4to7_recents_layout_mode", mode);
    } catch {
      // ignore
    }
  }

  // =========================================================================
  // AUDIO PREVIEW ENGINE (Carga y reproduce el audio en PreviewTime)
  // =========================================================================
  useEffect(() => {
    // Si no estamos en modo BMS o no hay path o no estamos en Tauri, pausar y salir
    if (layoutMode !== "bms" || !activeBmsMap?.path || isPreviewMuted || !isTauri()) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        setIsPlayingPreview(false);
      }
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
        const audioUrl = toAudioUrl(result.audioPath);

        // Crear o reutilizar elemento Audio
        if (!audioRef.current) {
          audioRef.current = new Audio();
          audioRef.current.loop = true;
          audioRef.current.crossOrigin = "anonymous";
        }

        const audio = audioRef.current;
        audio.pause();
        audio.removeAttribute("src"); // Limpiar src anterior para forzar recarga
        
        const targetVol = Math.max(0, Math.min(1, volume / 100));
        audio.volume = targetVol;

        // Esperar metadatos para saltar al PreviewTime
        const onLoadedMetadata = () => {
          if (isCancelled) return;
          // Validar que el duration es un número válido y mayor a 0
          if (previewSec > 0 && Number.isFinite(audio.duration) && previewSec < audio.duration) {
            audio.currentTime = previewSec;
          } else {
            audio.currentTime = 0;
          }

          void audio.play().then(() => {
            if (isCancelled) return;
            setIsPlayingPreview(true);
            audio.volume = targetVol;
          }).catch((err) => {
            console.warn("Autoplay de preview no permitido o interrumpido:", err);
          });
        };

        // Attach event BEFORE setting src to prevent race conditions
        audio.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
        
        audio.src = audioUrl;
        audio.load();
      } catch (err) {
        console.error("Error al cargar audio preview:", err);
      }
    }

    void playSongPreview();

    return () => {
      isCancelled = true;
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, [layoutMode, activeBmsMap?.path, isPreviewMuted]);

  // Actualizar volumen en caliente si el usuario usa atajos en el Home
  useEffect(() => {
    if (audioRef.current && !isPreviewMuted) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume / 100));
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
              </button>
            );
          })}
        </div>
      )}

      {/* VISTA 3: MODO BMS ARCADE (CARRUSEL INMERSIVO 1 A 1 CON AUDIO PREVIEW) */}
      {layoutMode === "bms" && activeBmsMap && (
        <div className="home-bms-showcase-container">
          <div className="home-bms-carousel-card">
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
            </div>

            {/* Panel de Metadatos y Acción Central */}
            <div className="home-bms-info-pane">
              <div className="home-bms-meta-main">
                <div className="home-bms-top-bar">
                  <div className="home-bms-index-indicator mono">
                    STAGE {carouselIndex + 1} / {maps.length}
                  </div>

                  <div className="home-bms-audio-controls">
                    {/* Visualizador de Espectro Arcade 60FPS con Rango Dinámico Amplio */}
                    <AudioVisualizer
                      audioElement={audioRef.current}
                      isPlaying={isPlayingPreview && !isPreviewMuted}
                      barCount={26}
                      width={140}
                      height={28}
                    />

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
