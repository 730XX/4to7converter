import { Settings } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { convertBeatmap } from "../../src/core/convert/engine";
import { ConversionError } from "../../src/core/convert/errors";
import { validateConvertedBeatmap } from "../../src/core/convert/validate";
import type { ConversionIssue } from "../../src/core/convert/validate";
import { parseOsuFile } from "../../src/core/osu/parser";
import { OsuParseError } from "../../src/core/osu/types";
import type { OsuBeatmap } from "../../src/core/osu/types";
import { BeatmapHeaderCard } from "./components/editor/BeatmapHeaderCard";
import { DebugConsole } from "./components/overlays/DebugConsole";
import { HomeScreen } from "./components/home/HomeScreen";
import { IssuesPanel } from "./components/editor/IssuesPanel";
import { LaneMapper } from "./components/editor/LaneMapper";
import { PlaybackFooter } from "./components/playback/PlaybackFooter";
import { Playfield } from "./components/playfield/Playfield";
import { QuickSearchModal } from "./components/modals/QuickSearchModal";
import { QuickDiffSwitcherModal } from "./components/modals/QuickDiffSwitcherModal";
import { QuickToastOsd, type OsdState } from "./components/overlays/QuickToastOsd";
import { FullScreenDropOverlay } from "./components/overlays/FullScreenDropOverlay";
import { SettingsDrawer } from "./components/overlays/SettingsDrawer";
import { KeybindsModal } from "./components/modals/KeybindsModal";
import { ExportModal, type ExportMetadata } from "./components/modals/ExportModal";
import { StatsBar } from "./components/editor/StatsBar";
import { serializeOsuFile } from "../../src/core/osu/serializer";
import { downloadConvertedBeatmap } from "./lib/download";
import { recordConversionMetric } from "./lib/session-stats";
import { appLogger } from "./lib/logger";
import type { PlaybackControls } from "./lib/use-playback";
import {
  isTauri,
  listBeatmapDifficulties,
  loadBeatmapWithAudio,
  loadOsuSkinConfig,
  saveBeatmap,
  toAssetUrl,
  toAudioUrl,
  type BeatmapDiffItem,
} from "./lib/native";
import { loadAllSkinTextures, type LoadedSkinTextures } from "./preview/skin-manager";
import {
  createDefaultLaneMapState,
  getTargetColumnCounts,
  toLaneMap,
  type LaneMapState,
} from "./lib/lane-map-state";
import { loadSettings, saveSettings, SETTINGS_LIMITS, type UserSettings } from "./lib/settings";
import { useLaneDocHistory, type LaneDoc } from "./lib/use-lane-doc-history";
import { getTimingSections, getKiaiIntervals, evaluateDynamicRhythm } from "./preview/beat-grid";
import {
  deletePreset,
  loadActiveLaneMapState,
  loadPresets,
  saveActiveLaneMapState,
  savePreset,
  type LanePreset,
} from "./lib/lane-presets";
import { usePlayback } from "./lib/use-playback";
import { loadRecentBeatmaps, saveRecentBeatmap } from "./lib/recent-beatmaps";
import { formatTimeMs } from "./preview/preview-math";
import {
  createInitialSection,
  splitSectionAt,
  deleteSection,
  toCoreSections,
  getMapStorageKey,
  loadMapSections,
  saveMapSections,
  updateSectionBoundary,
} from "./lib/timeline-sections";

const TARGET_KEY_COUNT = 7;

/** Beatmap vacío estable para que el hook de reproducción se llame incondicionalmente. */
const EMPTY_BEATMAP: OsuBeatmap = {
  formatVersion: 14,
  keyCount: 7,
  audioFilename: "",
  timingPoints: [],
  hitObjects: [],
};

interface LoadError {
  message: string;
  code: number;
}

/** Orquesta el flujo completo: carga, mapeo, estadísticas, validación y exportación. */
/**
 * Precarga una imagen resolviendo en cuanto carga (o si falla, para no colgar
 * nunca la transición de escena). Se usa para saber cuándo la escena está lista.
 */
function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

/**
 * Velo de transición de escena: cubre la pantalla mientras la vista entrante
 * carga y se desvanece (vía CSS transition, no un timer) cuando `ready` es true.
 */
function SceneTransitionVeil({ ready }: { ready: boolean }) {
  return (
    <div
      className={`scene-transition-veil ${ready ? "is-hidden" : "is-visible"}`}
      aria-hidden="true"
    />
  );
}

export default function App() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [source, setSource] = useState<OsuBeatmap | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  // Historial (undo/redo) del documento del editor de carriles: mapeo + secciones + sección activa.
  const initialLaneDoc = useMemo<LaneDoc>(
    () => ({
      laneMapState: loadActiveLaneMapState() ?? createDefaultLaneMapState(),
      sections: [],
      activeSectionId: null,
      editedBeatmap: null,
    }),
    [],
  );
  const {
    doc,
    commit: commitLaneDoc,
    replace: replaceLaneDoc,
    reset: resetLaneDoc,
    undo: undoLaneDoc,
    redo: redoLaneDoc,
    canUndo,
    canRedo,
  } = useLaneDocHistory(initialLaneDoc);
  const { laneMapState, sections, activeSectionId } = doc;
  // Ediciones manuales del beatmap derivado (arrastrar notas en el editor).
  const editedBeatmapRef = useRef(doc.editedBeatmap);
  editedBeatmapRef.current = doc.editedBeatmap;
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [difficulties, setDifficulties] = useState<BeatmapDiffItem[]>([]);
  const [zeroLn, setZeroLn] = useState<boolean>(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDiffSwitcherOpen, setIsDiffSwitcherOpen] = useState(false);
  const [isKeybindsModalOpen, setIsKeybindsModalOpen] = useState(false);
  const [isPlayMode, setIsPlayMode] = useState(false);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(loadSettings);
  const [presets, setPresets] = useState<LanePreset[]>(() => loadPresets());
  const [customSkinTextures, setCustomSkinTextures] = useState<LoadedSkinTextures | null>(null);
  const [osd, setOsd] = useState<OsdState | null>(null);
  const osdTimerRef = useRef<number | null>(null);

  // Secciones temporales de la línea de tiempo (parte del documento con historial)
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const activeSectionIdRef = useRef(activeSectionId);
  activeSectionIdRef.current = activeSectionId;
  const laneMapStateRef = useRef(laneMapState);
  laneMapStateRef.current = laneMapState;

  // Clave de almacenamiento única para el mapa y dificultad actual
  const mapStorageKey = useMemo(() => {
    if (!source) return null;
    return getMapStorageKey(sourcePath, fileName, source.artist, source.title, source.version);
  }, [source, sourcePath, fileName]);

  // Cargar secciones guardadas previamente para este mapa/dificultad o crear sección inicial
  useEffect(() => {
    if (!source || !mapStorageKey) return;

    const saved = loadMapSections(mapStorageKey);
    if (saved && saved.length > 0) {
      resetLaneDoc({
        laneMapState: saved[0]?.laneMapState ?? createDefaultLaneMapState(),
        sections: saved,
        activeSectionId: saved[0]?.id ?? null,
        editedBeatmap: null,
      });
    } else {
      const lastTime = source.hitObjects.slice(-1)[0]?.timeMs ?? 10000;
      const initial = createInitialSection(Math.max(lastTime, 10000), laneMapStateRef.current);
      resetLaneDoc({
        laneMapState: laneMapStateRef.current,
        sections: initial,
        activeSectionId: initial[0]?.id ?? null,
        editedBeatmap: null,
      });
    }
  }, [mapStorageKey]);

  // Guardar automáticamente cualquier cambio en las secciones para este mapa
  useEffect(() => {
    if (!mapStorageKey || sections.length === 0) return;
    saveMapSections(mapStorageKey, sections);
  }, [sections, mapStorageKey]);

  // Cargar texturas de la skin seleccionada (7K)
  useEffect(() => {
    let isCancelled = false;

    async function loadSkin(): Promise<void> {
      if (!settings.selectedSkinPath) {
        setCustomSkinTextures(null);
        return;
      }
      try {
        const config = await loadOsuSkinConfig(settings.selectedSkinPath, 7);
        if (config && !isCancelled) {
          const textures = await loadAllSkinTextures(config);
          if (!isCancelled) {
            setCustomSkinTextures(textures);
          }
        }
      } catch (e) {
        console.error("Error al cargar texturas de la skin:", e);
        if (!isCancelled) {
          setCustomSkinTextures(null);
        }
      }
    }

    void loadSkin();

    return () => {
      isCancelled = true;
    };
  }, [settings.selectedSkinPath]);

  function triggerOsd(state: OsdState): void {
    setOsd(state);
    if (osdTimerRef.current !== null) {
      window.clearTimeout(osdTimerRef.current);
    }
    osdTimerRef.current = window.setTimeout(() => {
      setOsd(null);
    }, 1800); // 1.8 segundos para poder visualizarlo con calma
  }

  /**
   * Descarta las ediciones manuales del beatmap derivado cuando el mapeo de
   * carriles cambia (la base se regenera). Avisa por OSD y devuelve true si
   * había ediciones que descartar.
   */
  function discardManualEdits(): boolean {
    if (editedBeatmapRef.current === null) return false;
    triggerOsd({
      type: "generic",
      title: "Mapeo actualizado",
      message: "Se descartaron tus ediciones manuales",
    });
    return true;
  }

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveActiveLaneMapState(laneMapState);
  }, [laneMapState]);

  const playbackRef = useRef<PlaybackControls | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const isPlayModeRef = useRef(isPlayMode);
  isPlayModeRef.current = isPlayMode;
  // Mirrors en refs para evitar closures viejos dentro del efecto de teclado (deps []).
  const sourceLoadedRef = useRef(false);
  sourceLoadedRef.current = source !== null;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const handleResetRef = useRef<() => void>(() => {});
  const anyOverlayOpenRef = useRef(false);
  anyOverlayOpenRef.current =
    isSettingsOpen ||
    isQuickSearchOpen ||
    isFileModalOpen ||
    isDiffSwitcherOpen ||
    isKeybindsModalOpen ||
    isExportModalOpen;

  // Transición de escena: el velo cubre hasta que la vista entrante cargó sus assets.
  const [isSceneReady, setIsSceneReady] = useState(false);

  // Atajos de teclado y combinaciones con rueda de ratón
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Prevenir que Windows robe el foco activando el menú nativo con la tecla Alt
      if (event.key === "Alt") {
        event.preventDefault();
      }

      // Ctrl + P: Búsqueda rápida estilo PowerToys Run (activo incluso si hay foco en inputs)
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyP") {
        event.preventDefault();
        setIsQuickSearchOpen((prev) => !prev);
        return;
      }

      // Ctrl + Tab: Abrir selector rápido de dificultades del Mapset
      if ((event.ctrlKey || event.metaKey) && event.code === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        setIsDiffSwitcherOpen(true);
        return;
      }

      // Ignorar si el usuario está escribiendo en un input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl + Z / Ctrl + Shift + Z (o Ctrl + Y): Deshacer / Rehacer en el editor de carriles
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) {
          redoLaneDoc();
        } else {
          undoLaneDoc();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.code === "KeyY") {
        event.preventDefault();
        redoLaneDoc();
        return;
      }

      // Ctrl + B: Dividir sección en la posición de tiempo actual
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyB") {
        event.preventDefault();
        handleSplitSection();
        return;
      }

      // Ctrl + O: Abrir/Cerrar Opciones
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyO") {
        event.preventDefault();
        setIsSettingsOpen((prev) => !prev);
        return;
      }

      // Escape: Salir del Modo Play, o si estamos en el editor, volver al home
      if (event.code === "Escape") {
        if (isPlayModeRef.current) {
          event.preventDefault();
          setIsPlayMode(false);
          return;
        }

        // Si hay un modal de App abierto (SettingsDrawer siempre está en DOM, por eso se controla por estado)
        if (anyOverlayOpenRef.current) {
          return;
        }

        // Modales/overlays que App no controla con estado: solo están en DOM cuando están abiertos
        const isOtherOverlayOpen = document.querySelector(".modal-overlay, .debug-console-panel");
        if (isOtherOverlayOpen) {
          return;
        }

        // En el editor (sin modales): volver al home descargando el beatmap
        if (sourceLoadedRef.current) {
          event.preventDefault();
          handleResetRef.current();
        }
      }

      // Tab solo (sin Ctrl, Alt ni Shift): Intercalar entre 7K y Split (desactivado en Modo Play)
      if (event.code === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        if (isPlayModeRef.current) {
          return;
        }
        setSettings((prev) => ({
          ...prev,
          previewMode: prev.previewMode === "split" ? "7k" : "split",
        }));
        return;
      }
    }

    function handleKeyUp(event: KeyboardEvent): void {
      // Evitar que el sistema abra menús contextuales tras soltar Alt
      if (event.key === "Alt") {
        event.preventDefault();
      }
    }

    function handleWheel(event: WheelEvent): void {
      // Si el selector de dificultades, búsqueda rápida u opciones están abiertos, permitir navegación y scroll natural
      const isInsideModalOrSwitcher = (event.target as HTMLElement | null)?.closest?.(
        ".quick-diff-dialog, .quick-diff-overlay, .quick-search-dialog, .quick-search-overlay, .settings-content, .debug-console-body, .modal-dialog",
      );
      if (isDiffSwitcherOpen || isInsideModalOrSwitcher) {
        return;
      }

      // 1. Ctrl + Alt + Rueda: Volumen de Hitsounds (Independiente)
      if ((event.ctrlKey || event.metaKey) && event.altKey) {
        event.preventDefault();
        const delta = event.deltaY < 0 ? 5 : -5;
        setSettings((prev) => {
          const nextHitVol = Math.max(
            SETTINGS_LIMITS.hitsoundVolume.min,
            Math.min(
              SETTINGS_LIMITS.hitsoundVolume.max,
              (prev.hitsoundVolume ?? SETTINGS_LIMITS.hitsoundVolume.default) + delta,
            ),
          );
          triggerOsd({
            type: "audio",
            volume: prev.volume,
            hitsoundVolume: nextHitVol,
            activeParam: "hitsound",
          });
          return {
            ...prev,
            hitsoundVolume: nextHitVol,
          };
        });
        return;
      }

      // 2. Ctrl + Rueda: Velocidad de Scroll (Scroll Speed)
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const delta =
          event.deltaY < 0 ? SETTINGS_LIMITS.scrollSpeed.step : -SETTINGS_LIMITS.scrollSpeed.step;
        setSettings((prev) => {
          const nextSpeed = Math.max(
            SETTINGS_LIMITS.scrollSpeed.min,
            Math.min(SETTINGS_LIMITS.scrollSpeed.max, prev.scrollSpeed + delta),
          );
          triggerOsd({
            type: "speed",
            volume: prev.volume,
            hitsoundVolume: prev.hitsoundVolume ?? SETTINGS_LIMITS.hitsoundVolume.default,
            scrollSpeed: nextSpeed,
            activeParam: "scroll",
          });
          return {
            ...prev,
            scrollSpeed: nextSpeed,
          };
        });
        return;
      }

      // 3. Alt + Rueda: Volumen de la música
      if (event.altKey) {
        event.preventDefault();
        const delta = event.deltaY < 0 ? 5 : -5;
        setSettings((prev) => {
          const nextVol = Math.max(
            SETTINGS_LIMITS.volume.min,
            Math.min(SETTINGS_LIMITS.volume.max, prev.volume + delta),
          );
          triggerOsd({
            type: "audio",
            volume: nextVol,
            hitsoundVolume: prev.hitsoundVolume ?? SETTINGS_LIMITS.hitsoundVolume.default,
            activeParam: "music",
          });
          return {
            ...prev,
            volume: nextVol,
          };
        });
        return;
      }

      // Si la búsqueda rápida, opciones o modales están abiertos, permitir scroll normal del contenedor
      if (isQuickSearchOpen || isFileModalOpen || isSettingsOpen) {
        return;
      }

      // 4. Rueda normal (sin modificadores): Navegación temporal en el mapa (Seek)
      // Hacia arriba (deltaY < 0): retroceder | Hacia abajo (deltaY > 0): adelantar
      const isInsideScrollable = (event.target as HTMLElement | null)?.closest?.(
        ".app-sidebar, .settings-content, .debug-console-body, .modal-dialog, .quick-search-results, .quick-search-dialog",
      );

      if (!isInsideScrollable && playbackRef.current) {
        event.preventDefault();
        const stepMs = event.shiftKey ? 1000 : 250;
        const deltaMs = event.deltaY < 0 ? -stepMs : stepMs;
        const currentTime = playbackRef.current.currentTimeMsRef.current ?? 0;
        playbackRef.current.seekTo(currentTime + deltaMs);
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("wheel", handleWheel, { passive: false });

    function handleResize(): void {
      console.log(
        ` [Tauri Window Resize] Width: ${window.innerWidth}px, Height: ${window.innerHeight}px (Outer: ${window.outerWidth}x${window.outerHeight}px)`,
      );
    }

    // Log inicial al montar
    handleResize();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  function isSameSongFolder(pathA: string | null, pathB: string | null): boolean {
    if (!pathA || !pathB) return false;
    const cleanA = pathA.replace(/\\/g, "/").toLowerCase();
    const cleanB = pathB.replace(/\\/g, "/").toLowerCase();
    const dirA = cleanA.slice(0, cleanA.lastIndexOf("/"));
    const dirB = cleanB.slice(0, cleanB.lastIndexOf("/"));
    return dirA === dirB && dirA.length > 0;
  }

  async function handlePathSelected(path: string): Promise<void> {
    // Velo solo al pasar de home a editor (no al cambiar de dificultad dentro del editor).
    if (source === null) setIsSceneReady(false);
    try {
      const isDiffChange = isSameSongFolder(sourcePath, path);
      if (!isDiffChange) {
        playbackRef.current?.pause();
        playbackRef.current?.seekTo(0);
      }

      const { content, audioPath, backgroundPath } = await loadBeatmapWithAudio(path);
      let parsed = parseOsuFile(content);
      let targetPath = path;
      let targetContent = content;
      let targetAudioPath = audioPath;
      let targetBackgroundPath = backgroundPath;

      // Obtener dificultades hermanas y filtrar ESTRICTAMENTE solo las de 4K
      let sibling4kDiffs: BeatmapDiffItem[] = [];
      try {
        const allDiffs = await listBeatmapDifficulties(path);
        sibling4kDiffs = allDiffs.filter((d) => d.key_count === 4);
      } catch (err) {
        console.error("Error al listar dificultades:", err);
      }

      // Si el mapa seleccionado no es 4K
      if (parsed.keyCount !== 4) {
        if (sibling4kDiffs.length > 0) {
          const fallback4k = sibling4kDiffs[0];
          if (fallback4k) {
            targetPath = fallback4k.path;
            const loaded = await loadBeatmapWithAudio(targetPath);
            targetContent = loaded.content;
            targetAudioPath = loaded.audioPath;
            targetBackgroundPath = loaded.backgroundPath;
            parsed = parseOsuFile(targetContent);

            triggerOsd({
              type: "generic",
              title: "Dificultad 4K Seleccionada",
              message: `Se cargó "${parsed.version || fallback4k.version}" (4K)`,
            });
          }
        } else {
          triggerOsd({
            type: "generic",
            title: "Modo no soportado",
            message: `El mapa es ${parsed.keyCount}K. Por ahora solo puedes cargar mapas 4K.`,
          });
          setLoadError({
            message: `El mapa seleccionado es de ${parsed.keyCount}K. Por el momento solo puedes cargar mapas 4K para convertir a 7K.`,
            code: 0,
          });
          return;
        }
      }

      setSource(parsed);
      setFileName(targetPath.split(/[\\/]/).pop() ?? targetPath);
      setSourcePath(targetPath);
      setDifficulties(sibling4kDiffs);
      setLoadError(null);
      setAudioUrl(targetAudioPath === null ? null : toAudioUrl(targetAudioPath));
      setBackgroundUrl(targetBackgroundPath === null ? null : toAssetUrl(targetBackgroundPath));
      setIsFileModalOpen(false);
      setIsQuickSearchOpen(false);

      // Guardar en el historial de mapas recientes
      saveRecentBeatmap({
        path: targetPath,
        title: parsed.title || "Unknown Title",
        artist: parsed.artist || "Unknown Artist",
        difficulty: parsed.version || "Normal",
        keys: parsed.keyCount || 4,
        bpm: parsed.timingPoints[0]?.beatLength
          ? Math.round(60000 / parsed.timingPoints[0].beatLength)
          : 120,
        backgroundPath: targetBackgroundPath ?? null,
      });
      // Precargar la cover del mapa recién abierto para que no "popee" al volver al home.
      if (targetBackgroundPath) {
        void preloadImage(toAssetUrl(targetBackgroundPath));
      }

      // Inicializar una sección inicial para toda la canción
      const initialSecs = createInitialSection(
        Math.max(parsed.hitObjects.slice(-1)[0]?.timeMs ?? 300000, 10000),
        laneMapStateRef.current,
      );
      resetLaneDoc({
        laneMapState: laneMapStateRef.current,
        sections: initialSecs,
        activeSectionId: initialSecs[0]?.id ?? null,
        editedBeatmap: null,
      });
    } catch (error) {
      console.error("Error al cargar beatmap desde path:", error);
      if (error instanceof OsuParseError || error instanceof ConversionError) {
        setLoadError({ message: error.message, code: error.code });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        setLoadError({ message: message || "No se pudo leer el archivo.", code: 0 });
      }
      setSource(null);
      setFileName(null);
      setSourcePath(null);
      setDifficulties([]);
      setAudioUrl(null);
      setBackgroundUrl(null);
    }
  }

  async function handleFileSelected(file: File): Promise<void> {
    // Velo solo si venimos del home (cambio de vista).
    if (source === null) setIsSceneReady(false);
    try {
      playbackRef.current?.pause();
      playbackRef.current?.seekTo(0);

      const content = await file.text();
      const parsed = parseOsuFile(content);

      if (parsed.keyCount !== 4) {
        triggerOsd({
          type: "generic",
          title: "Modo no soportado",
          message: `El archivo es ${parsed.keyCount}K. Solo se admiten mapas 4K.`,
        });
        setLoadError({
          message: `El archivo seleccionado es de ${parsed.keyCount}K. Por el momento solo puedes cargar mapas 4K para convertir a 7K.`,
          code: 0,
        });
        return;
      }

      setSource(parsed);
      setFileName(file.name);
      setSourcePath(null);
      setDifficulties([]);
      setLoadError(null);
      setAudioUrl(null);
      setIsFileModalOpen(false);

      const initialSecs = createInitialSection(300000, laneMapStateRef.current);
      resetLaneDoc({
        laneMapState: laneMapStateRef.current,
        sections: initialSecs,
        activeSectionId: initialSecs[0]?.id ?? null,
        editedBeatmap: null,
      });
    } catch (error) {
      if (error instanceof OsuParseError || error instanceof ConversionError) {
        setLoadError({ message: error.message, code: error.code });
      } else {
        setLoadError({ message: "No se pudo leer el archivo.", code: 0 });
      }
      setSource(null);
      setFileName(null);
      setSourcePath(null);
      setDifficulties([]);
      setAudioUrl(null);
    }
  }

  function handleReset(): void {
    setIsSceneReady(false);
    playbackRef.current?.pause();
    playbackRef.current?.seekTo(0);

    if (audioUrl !== null) {
      URL.revokeObjectURL(audioUrl);
    }
    setSource(null);
    setFileName(null);
    setSourcePath(null);
    setDifficulties([]);
    setLoadError(null);
    setAudioUrl(null);
    setBackgroundUrl(null);
    resetLaneDoc({
      laneMapState: createDefaultLaneMapState(),
      sections: [],
      activeSectionId: null,
      editedBeatmap: null,
    });
  }

  // Mantener el ref de handleReset actualizado para el atajo ESC (sin closures viejos).
  handleResetRef.current = handleReset;

  function handleSplitSection(): void {
    // Leer desde los refs para evitar el closure viejo del efecto de teclado (deps []).
    const currentSource = sourceRef.current;
    if (!currentSource || playbackRef.current === null) return;
    const curTime = playbackRef.current.currentTimeMsRef.current;
    const lastObjTime = currentSource.hitObjects.slice(-1)[0]?.timeMs ?? 10000;
    const duration =
      playbackRef.current.durationMs > 0
        ? playbackRef.current.durationMs
        : Math.max(lastObjTime, 1000);

    const { newSections, createdSectionId } = splitSectionAt(
      sectionsRef.current,
      curTime,
      duration,
    );

    if (createdSectionId !== null) {
      const createdSec = newSections.find((s) => s.id === createdSectionId);
      discardManualEdits();
      commitLaneDoc({
        sections: newSections,
        activeSectionId: createdSectionId,
        laneMapState: createdSec?.laneMapState ?? laneMapStateRef.current,
        editedBeatmap: null,
      });
      triggerOsd({
        type: "generic",
        title: "Sección dividida",
        value: formatTimeMs(curTime),
      });
    }
  }

  function handleSelectSection(sectionId: string): void {
    const sec = sections.find((s) => s.id === sectionId);
    replaceLaneDoc({
      activeSectionId: sectionId,
      laneMapState: sec?.laneMapState ?? laneMapState,
    });
  }

  function handleDeleteSection(sectionId: string): void {
    const updated = deleteSection(sections, sectionId);
    const isRemovingActive = activeSectionId === sectionId;
    const fallback = updated[0];
    discardManualEdits();
    commitLaneDoc({
      sections: updated,
      activeSectionId: isRemovingActive ? (fallback?.id ?? null) : activeSectionId,
      laneMapState: isRemovingActive ? (fallback?.laneMapState ?? laneMapState) : laneMapState,
      editedBeatmap: null,
    });
    triggerOsd({
      type: "generic",
      title: "Sección eliminada",
      value: "Fusionada",
    });
  }

  function handleUpdateBoundary(leftSectionIndex: number, newCutTimeMs: number): void {
    const updated = updateSectionBoundary(sections, leftSectionIndex, newCutTimeMs);
    discardManualEdits();
    commitLaneDoc({ sections: updated, editedBeatmap: null }, { coalesceKey: "boundary" });
  }

  function handleLaneMapChange(nextState: LaneMapState): void {
    const updatedSections =
      activeSectionId && sections.length > 0
        ? sections.map((s) => (s.id === activeSectionId ? { ...s, laneMapState: nextState } : s))
        : sections;
    discardManualEdits();
    commitLaneDoc(
      { laneMapState: nextState, sections: updatedSections, editedBeatmap: null },
      { coalesceKey: "laneMap" },
    );
  }

  function handleToggleZeroLn(nextZeroLn: boolean): void {
    if (editedBeatmapRef.current !== null) {
      discardManualEdits();
      commitLaneDoc({ editedBeatmap: null });
    }
    setZeroLn(nextZeroLn);
  }

  const converted = useMemo(
    () =>
      source === null
        ? null
        : convertBeatmap(source, {
            laneMap: toLaneMap(laneMapState),
            targetKeyCount: TARGET_KEY_COUNT,
            zeroLn,
            sections: toCoreSections(sections),
          }),
    [source, laneMapState, zeroLn, sections],
  );

  // Documento efectivo del editor: la conversión derivada, o las ediciones
  // manuales del usuario cuando existen (Opción A).
  const effectiveConverted = doc.editedBeatmap ?? converted;

  const issues = useMemo<ConversionIssue[]>(
    () => (effectiveConverted === null ? [] : validateConvertedBeatmap(effectiveConverted)),
    [effectiveConverted],
  );

  // Valores por defecto del modal de exportación, derivados del mapa cargado.
  const exportDefaults = useMemo<ExportMetadata>(() => {
    const rawSuffix = settings.diffSuffix?.trim();
    const suffix = rawSuffix && rawSuffix.length > 0 ? rawSuffix : "(7K)";
    const version7k = source?.version ? `${source.version} ${suffix}` : suffix;
    return {
      title: source?.title ?? effectiveConverted?.title ?? "",
      artist: source?.artist ?? effectiveConverted?.artist ?? "",
      creator: source?.creator ?? effectiveConverted?.creator ?? "",
      version: version7k,
      overallDifficulty: effectiveConverted?.overallDifficulty ?? source?.overallDifficulty ?? 7,
      hpDrainRate: effectiveConverted?.hpDrainRate ?? source?.hpDrainRate ?? 7,
      previewTime: effectiveConverted?.previewTime ?? source?.previewTime ?? -1,
    };
  }, [source, effectiveConverted, settings.diffSuffix]);

  // Detección de carga de la escena: el velo se desvanece recién cuando la vista
  // entrante está lista (home local = tras unos frames; editor = fondo cargado).
  useEffect(() => {
    let cancelled = false;

    // Vista home: revelar de inmediato (las covers se precargan aparte en background
    // para que no aparezcan "de golpe"); así el cambio es instantáneo y consistente.
    if (source === null) {
      const raf1 = requestAnimationFrame(() => {
        void requestAnimationFrame(() => {
          if (!cancelled) setIsSceneReady(true);
        });
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf1);
      };
    }

    // Vista editor: esperar a que la imagen de fondo termine de cargar (la que más tarda).
    if (effectiveConverted !== null && fileName !== null) {
      if (backgroundUrl) {
        preloadImage(backgroundUrl).then(() => {
          if (!cancelled) setIsSceneReady(true);
        });
      } else {
        const raf = requestAnimationFrame(() => {
          if (!cancelled) setIsSceneReady(true);
        });
        return () => {
          cancelled = true;
          cancelAnimationFrame(raf);
        };
      }
      return () => {
        cancelled = true;
      };
    }

    // Estado intermedio de carga: mantener el velo.
    return () => {
      cancelled = true;
    };
  }, [source, effectiveConverted, fileName, backgroundUrl]);

  // Precarga en background las covers de los mapas recientes para que, al volver al
  // home, ya estén cacheadas y no aparezcan "de golpe" tras la transición.
  useEffect(() => {
    const covers = loadRecentBeatmaps()
      .map((b) => b.backgroundPath)
      .filter((p): p is string => Boolean(p))
      .map((p) => toAssetUrl(p));
    void Promise.all(covers.map(preloadImage));
  }, []);

  const targetColumnCounts = useMemo(
    () => getTargetColumnCounts(laneMapState, TARGET_KEY_COUNT),
    [laneMapState],
  );

  const issueCounts = useMemo(
    () => ({
      errors: issues.filter((issue) => issue.severity === "error").length,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
    }),
    [issues],
  );

  const playback = usePlayback({
    beatmap: effectiveConverted ?? EMPTY_BEATMAP,
    audioUrl,
    volume: settings.volume,
    hitsoundsEnabled: settings.hitsounds,
    hitsoundVolume: settings.hitsoundVolume,
    isPlayMode,
    keybinds: settings.keybinds7k,
  });
  playbackRef.current = playback;

  // Sincronizar automáticamente la sección activa y su matriz de conversión según el tiempo de reproducción
  useEffect(() => {
    if (sections.length <= 1) return;
    const curTime = playback.timerTimeMs;
    const matchingSection = sections.find((sec) => curTime >= sec.startMs && curTime < sec.endMs);

    if (matchingSection && matchingSection.id !== activeSectionId) {
      replaceLaneDoc({
        activeSectionId: matchingSection.id,
        laneMapState: matchingSection.laneMapState,
      });
    }
  }, [playback.timerTimeMs, sections, activeSectionId]);

  // Modular el brillo del fondo difuminado según el Kiai Time (Build-up 3s y Flash de drop)
  useEffect(() => {
    let animId: number;
    const timingPoints = source?.timingPoints ?? [];
    const timingSections = getTimingSections(timingPoints);
    const kiaiIntervals = getKiaiIntervals(timingPoints, playback.durationMs);

    function animateBackdrop(): void {
      const curTime = playback.currentTimeMsRef.current;
      const { buildupDim, flashIntensity, isInKiai, kiaiWave } = evaluateDynamicRhythm(
        timingSections,
        kiaiIntervals,
        curTime,
      );

      if (backdropRef.current) {
        // Brillo base según el ajuste del usuario (0.05 a 1.0)
        const baseBrightness = Math.max(0.05, 1 - settings.backdropDim / 100);

        let effectiveBrightness = baseBrightness;
        let effectiveBlur = 28;

        if (buildupDim > 0) {
          // Fase 1: Build-up previo (3s antes): oscurece suavemente hasta un -85%
          effectiveBrightness = baseBrightness * (1 - buildupDim * 0.85);
          effectiveBlur = 28;
        } else if (isInKiai) {
          // Kiai: flash inicial + pulsos rítmicos constantes cada medio beat
          const flashBoost = flashIntensity * 0.85;
          const waveBoost = kiaiWave * 0.55;
          effectiveBrightness = baseBrightness * (1 + Math.max(flashBoost, waveBoost));
          effectiveBlur = Math.round(28 - Math.max(flashIntensity * 12, kiaiWave * 8));
        } else {
          // Fase 4: Estado normal: 100% de la opacidad del usuario
          effectiveBrightness = baseBrightness;
          effectiveBlur = 28;
        }

        effectiveBrightness = Math.max(0.02, effectiveBrightness);
        backdropRef.current.style.filter = `blur(${effectiveBlur}px) brightness(${effectiveBrightness.toFixed(3)})`;
      }
      animId = requestAnimationFrame(animateBackdrop);
    }

    animId = requestAnimationFrame(animateBackdrop);
    return () => cancelAnimationFrame(animId);
  }, [source?.timingPoints, playback.durationMs, settings.backdropDim, playback.currentTimeMsRef]);

  function handleSavePreset(name: string): void {
    setPresets((previous) => savePreset(previous, name, laneMapState));
  }

  function handleDeletePreset(id: string): void {
    setPresets((previous) => deletePreset(previous, id));
  }

  function handleApplyPreset(preset: LanePreset): void {
    const updatedSections =
      activeSectionId && sections.length > 0
        ? sections.map((s) =>
            s.id === activeSectionId
              ? {
                  ...s,
                  laneMapState: preset.laneMapState,
                  presetId: preset.id,
                  presetName: preset.name,
                }
              : s,
          )
        : sections;
    discardManualEdits();
    commitLaneDoc(
      { laneMapState: preset.laneMapState, sections: updatedSections, editedBeatmap: null },
      { coalesceKey: "preset" },
    );
  }

  function handleExport(): void {
    if (source === null || effectiveConverted === null || fileName === null) {
      return;
    }
    setIsExportModalOpen(true);
  }

  async function performExport(meta: ExportMetadata): Promise<void> {
    if (source === null || effectiveConverted === null || fileName === null) {
      return;
    }

    const version7k = meta.version.trim().length > 0 ? meta.version.trim() : "(7K)";
    const exportBeatmap: OsuBeatmap = {
      ...effectiveConverted,
      title: meta.title,
      artist: meta.artist,
      creator: meta.creator,
      version: version7k,
      overallDifficulty: meta.overallDifficulty,
      hpDrainRate: meta.hpDrainRate,
      previewTime: meta.previewTime,
      beatmapId: 0,
      beatmapSetId: source.beatmapSetId,
    };
    const content = serializeOsuFile(exportBeatmap);

    if (isTauri() && sourcePath) {
      try {
        const lastSep = Math.max(sourcePath.lastIndexOf("/"), sourcePath.lastIndexOf("\\"));
        const dir = lastSep >= 0 ? sourcePath.slice(0, lastSep) : ".";

        const clean = (str: string) => str.replace(/[\\/:*?"<>|]/g, "").trim();
        const artist = clean(meta.artist || "Artist");
        const title = clean(meta.title || "Title");
        const creator = clean(meta.creator || "Creator");
        const diff = clean(version7k);

        const newFileName = `${artist} - ${title} (${creator}) [${diff}].osu`;
        const newPath = `${dir}\\${newFileName}`;

        await saveBeatmap(newPath, content);
        recordConversionMetric(meta.title || fileName, effectiveConverted.hitObjects.length);
        appLogger.info(`[Export] ¡Mapa 7K guardado exitosamente en: ${newPath}`);
        triggerOsd({
          type: "export",
          title: "¡Exportado a osu!",
          message: newFileName,
        });
      } catch (err) {
        console.error("Error al guardar el beatmap:", err);
        appLogger.error(`[AVISO] [Export] Error al guardar archivo en disco: ${err}`);
        // Fallback en caso de error de escritura
        const baseName = `${fileName.replace(/\.osu$/i, "")}-7k`;
        downloadConvertedBeatmap(exportBeatmap, baseName);
        triggerOsd({
          type: "export",
          title: "¡Descarga iniciada!",
          message: `${baseName}.osu`,
        });
      }
    } else {
      const baseName = `${fileName.replace(/\.osu$/i, "")}-7k`;
      downloadConvertedBeatmap(exportBeatmap, baseName);
      triggerOsd({
        type: "export",
        title: "¡Descarga iniciada!",
        message: `${baseName}.osu`,
      });
    }
  }

  if (loadError !== null) {
    return (
      <>
        <main className="app-shell">
          <section className="error-card">
            <h1 className="error-card-title">No se pudo leer el archivo</h1>
            <p className="error-card-message">{loadError.message}</p>
            <span className="error-card-code mono">Error {loadError.code}</span>
            <button type="button" className="ghost-button" onClick={handleReset}>
              Elegir otro archivo
            </button>
          </section>
          <DebugConsole />
        </main>
        <QuickSearchModal
          isOpen={isQuickSearchOpen}
          onClose={() => setIsQuickSearchOpen(false)}
          onSelectBeatmap={(path) => void handlePathSelected(path)}
          currentBeatmapPath={sourcePath}
        />
        <SceneTransitionVeil ready={isSceneReady} />
      </>
    );
  }

  if (source === null || effectiveConverted === null || fileName === null) {
    return (
      <>
        <HomeScreen
          onPathSelected={(path) => void handlePathSelected(path)}
          onFileSelected={(file) => void handleFileSelected(file)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          settings={settings}
        />
        <FullScreenDropOverlay
          onPathDropped={(path) => void handlePathSelected(path)}
          onFileDropped={(file) => void handleFileSelected(file)}
        />
        <QuickToastOsd osd={osd} />
        <SettingsDrawer
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onUpdateSettings={setSettings}
        />
        <DebugConsole />
        <QuickSearchModal
          isOpen={isQuickSearchOpen}
          onClose={() => setIsQuickSearchOpen(false)}
          onSelectBeatmap={(path) => void handlePathSelected(path)}
          currentBeatmapPath={sourcePath}
        />
        <SceneTransitionVeil ready={isSceneReady} />
      </>
    );
  }

  return (
    <>
      {backgroundUrl !== null && (
        <div
          ref={backdropRef}
          className="app-backdrop"
          style={{
            backgroundImage: `url("${backgroundUrl.replace(/"/g, '\\"')}")`,
          }}
          aria-hidden="true"
        />
      )}
      <button
        type="button"
        className="floating-settings-btn"
        onClick={() => setIsSettingsOpen(true)}
        title="Abrir ajustes"
        aria-label="Abrir ajustes"
      >
        <Settings size={18} />
      </button>

      <main className="app-shell">
        <div className="app-layout">
          <aside className="app-sidebar">
            <BeatmapHeaderCard
              source={source}
              fileName={fileName}
              backgroundUrl={backgroundUrl}
              audioUrl={audioUrl}
              sourcePath={sourcePath}
              difficulties={difficulties}
              zeroLn={zeroLn}
              onToggleZeroLn={handleToggleZeroLn}
              onSelectDifficulty={(newPath) => void handlePathSelected(newPath)}
              onOpenNewFile={() => {
                playback.pause();
                setIsFileModalOpen(true);
              }}
              onOpenQuickSearch={() => {
                playback.pause();
                setIsQuickSearchOpen(true);
              }}
            />
            <LaneMapper
              state={laneMapState}
              sourceKeyCount={source.keyCount}
              targetKeyCount={TARGET_KEY_COUNT}
              onChange={handleLaneMapChange}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undoLaneDoc}
              onRedo={redoLaneDoc}
              presets={presets}
              onSavePreset={handleSavePreset}
              onDeletePreset={handleDeletePreset}
              onApplyPreset={handleApplyPreset}
              activeSection={sections.find((s) => s.id === activeSectionId) ?? null}
              totalSectionsCount={sections.length}
            />
            <StatsBar
              source={source}
              converted={effectiveConverted}
              targetColumnCounts={targetColumnCounts}
              issueCounts={issueCounts}
              playback={playback}
            />
            <IssuesPanel issues={issues} />
          </aside>
          <section className="app-canvas-panel">
            <Playfield
              sourceBeatmap={source}
              targetBeatmap={effectiveConverted}
              playback={playback}
              onEditNotes={(next) => commitLaneDoc({ editedBeatmap: next })}
              scrollSpeed={settings.scrollSpeed}
              playfieldWidth={settings.playfieldWidth}
              scrollDirection={settings.scrollDirection}
              previewMode={settings.previewMode}
              hitGlow={settings.hitGlow}
              volume={settings.volume}
              hitsoundVolume={settings.hitsoundVolume}
              isPlayMode={isPlayMode}
              keybinds={settings.keybinds7k}
              playOffsetMs={settings.playOffsetMs}
              comboPositionPercent={settings.comboPositionPercent}
              playShowLaneSeparators={settings.playShowLaneSeparators}
              noteHeight={settings.noteHeight}
              playShowHitError={settings.playShowHitError}
              playStageWidth={settings.playStageWidth}
              hitPositionOffset={settings.hitPositionOffset}
              receptorOffset={settings.receptorOffset}
              customSkinTextures={customSkinTextures}
              beatDivisor={settings.beatDivisor}
              onExitPlayMode={() => setIsPlayMode(false)}
            />
          </section>
        </div>
        <PlaybackFooter
          playback={playback}
          beatmap={effectiveConverted ?? source}
          onExport={handleExport}
          isPlayMode={isPlayMode}
          onTogglePlayMode={() => {
            setIsPlayMode((prev) => {
              const next = !prev;
              if (next && !playback.isPlaying) {
                playback.play();
              }
              return next;
            });
          }}
          sections={sections}
          activeSectionId={activeSectionId}
          onSelectSection={handleSelectSection}
          onSplitSection={handleSplitSection}
          onDeleteSection={handleDeleteSection}
          onUpdateBoundary={handleUpdateBoundary}
          beatDivisor={settings.beatDivisor}
          onChangeDivisor={(divisor) => setSettings((prev) => ({ ...prev, beatDivisor: divisor }))}
        />
      </main>

      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
        onOpenKeybinds={() => setIsKeybindsModalOpen(true)}
      />

      <KeybindsModal
        isOpen={isKeybindsModalOpen}
        onClose={() => setIsKeybindsModalOpen(false)}
        currentKeybinds={settings.keybinds7k}
        onSave={(newKeys) => setSettings((prev) => ({ ...prev, keybinds7k: newKeys }))}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onConfirm={(meta) => {
          setIsExportModalOpen(false);
          void performExport(meta);
        }}
        defaults={exportDefaults}
      />

      <QuickSearchModal
        isOpen={isQuickSearchOpen}
        onClose={() => setIsQuickSearchOpen(false)}
        onSelectBeatmap={(path) => void handlePathSelected(path)}
        currentBeatmapPath={sourcePath}
      />

      <QuickDiffSwitcherModal
        isOpen={isDiffSwitcherOpen}
        onClose={() => setIsDiffSwitcherOpen(false)}
        difficulties={difficulties}
        currentPath={sourcePath}
        onSelectDifficulty={(newPath) => void handlePathSelected(newPath)}
      />

      <QuickToastOsd osd={osd} />
      <DebugConsole />

      <FullScreenDropOverlay
        onPathDropped={(path) => void handlePathSelected(path)}
        onFileDropped={(file) => void handleFileSelected(file)}
      />

      {/* Modal de selección/drop de nuevo archivo sin perder el estado previo si se cancela */}
      {isFileModalOpen && (
        <div className="file-modal-overlay" onClick={() => setIsFileModalOpen(false)}>
          <div className="file-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <HomeScreen
              onPathSelected={(path: string) => void handlePathSelected(path)}
              onFileSelected={(file: File) => void handleFileSelected(file)}
              onClose={() => setIsFileModalOpen(false)}
            />
          </div>
        </div>
      )}
      <SceneTransitionVeil ready={isSceneReady} />
    </>
  );
}
