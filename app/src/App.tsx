import { Settings } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { convertBeatmap } from "../../src/core/convert/engine";
import { ConversionError } from "../../src/core/convert/errors";
import { validateConvertedBeatmap } from "../../src/core/convert/validate";
import type { ConversionIssue } from "../../src/core/convert/validate";
import { parseOsuFile } from "../../src/core/osu/parser";
import { OsuParseError } from "../../src/core/osu/types";
import type { OsuBeatmap } from "../../src/core/osu/types";
import { BeatmapHeaderCard } from "./components/BeatmapHeaderCard";
import { DebugConsole } from "./components/DebugConsole";
import { FileDropZone } from "./components/FileDropZone";
import { IssuesPanel } from "./components/IssuesPanel";
import { LaneMapper } from "./components/LaneMapper";
import { PlaybackFooter } from "./components/PlaybackFooter";
import { Playfield } from "./components/Playfield";
import { QuickSearchModal } from "./components/QuickSearchModal";
import { QuickToastOsd, type OsdState } from "./components/QuickToastOsd";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { KeybindsModal } from "./components/KeybindsModal";
import { StatsBar } from "./components/StatsBar";
import { serializeOsuFile } from "../../src/core/osu/serializer";
import { downloadConvertedBeatmap } from "./lib/download";
import { appLogger } from "./lib/logger";
import type { PlaybackControls } from "./lib/use-playback";
import {
  isTauri,
  listBeatmapDifficulties,
  loadBeatmapWithAudio,
  saveBeatmap,
  toAssetUrl,
  toAudioUrl,
  type BeatmapDiffItem,
} from "./lib/native";
import {
  createDefaultLaneMapState,
  getTargetColumnCounts,
  toLaneMap,
  type LaneMapState,
} from "./lib/lane-map-state";
import { loadSettings, saveSettings, type UserSettings } from "./lib/settings";
import {
  getTimingSections,
  getKiaiIntervals,
  evaluateDynamicRhythm,
} from "./preview/beat-grid";
import {
  deletePreset,
  loadActiveLaneMapState,
  loadPresets,
  saveActiveLaneMapState,
  savePreset,
  type LanePreset,
} from "./lib/lane-presets";
import { usePlayback } from "./lib/use-playback";

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
export default function App() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [source, setSource] = useState<OsuBeatmap | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [laneMapState, setLaneMapState] = useState<LaneMapState>(
    () => loadActiveLaneMapState() ?? createDefaultLaneMapState(),
  );
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [difficulties, setDifficulties] = useState<BeatmapDiffItem[]>([]);
  const [zeroLn, setZeroLn] = useState<boolean>(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isKeybindsModalOpen, setIsKeybindsModalOpen] = useState(false);
  const [isPlayMode, setIsPlayMode] = useState(false);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(loadSettings);
  const [presets, setPresets] = useState<LanePreset[]>(() => loadPresets());
  const [osd, setOsd] = useState<OsdState | null>(null);
  const osdTimerRef = useRef<number | null>(null);

  function triggerOsd(state: OsdState): void {
    setOsd(state);
    if (osdTimerRef.current !== null) {
      window.clearTimeout(osdTimerRef.current);
    }
    osdTimerRef.current = window.setTimeout(() => {
      setOsd(null);
    }, 1800); // 1.8 segundos para poder visualizarlo con calma
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

  // Atajos de teclado y combinaciones con rueda de ratón
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Prevenir que Windows robe el foco activando el menú nativo con la tecla Alt
      if (event.key === "Alt") {
        event.preventDefault();
      }

      // Ctrl + P: Búsqueda rápida estilo PowerToys Run (activo incluso si hay foco en inputs)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setIsQuickSearchOpen((prev) => !prev);
        return;
      }

      // Ignorar si el usuario está escribiendo en un input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl + O: Abrir/Cerrar Opciones
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        setIsSettingsOpen((prev) => !prev);
        return;
      }

      // Escape: Salir del Modo Play inmediatamente
      if (event.key === "Escape") {
        setIsPlayMode((prev) => {
          if (prev) {
            event.preventDefault();
            return false;
          }
          return prev;
        });
      }

      // Tab: Intercalar entre 7K y Split (desactivado en Modo Play)
      if (event.key === "Tab") {
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
      // 1. Ctrl + Alt + Rueda: Volumen de Hitsounds (Independiente)
      if ((event.ctrlKey || event.metaKey) && event.altKey) {
        event.preventDefault();
        const delta = event.deltaY < 0 ? 5 : -5;
        setSettings((prev) => {
          const nextHitVol = Math.max(0, Math.min(100, (prev.hitsoundVolume ?? 70) + delta));
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
        const delta = event.deltaY < 0 ? 1 : -1;
        setSettings((prev) => {
          const nextSpeed = Math.max(10, Math.min(40, prev.scrollSpeed + delta));
          triggerOsd({
            type: "speed",
            volume: prev.volume,
            hitsoundVolume: prev.hitsoundVolume ?? 70,
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
          const nextVol = Math.max(0, Math.min(100, prev.volume + delta));
          triggerOsd({
            type: "audio",
            volume: nextVol,
            hitsoundVolume: prev.hitsoundVolume ?? 70,
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

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
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
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
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
    try {
      const isDiffChange = isSameSongFolder(sourcePath, path);
      if (!isDiffChange) {
        playbackRef.current?.pause();
        playbackRef.current?.seekTo(0);
      }

      const { content, audioPath, backgroundPath } = await loadBeatmapWithAudio(path);
      const parsed = parseOsuFile(content);
      setSource(parsed);
      setFileName(path.split(/[\\/]/).pop() ?? path);
      setSourcePath(path);
      setLoadError(null);
      setAudioUrl(audioPath === null ? null : toAudioUrl(audioPath));
      setBackgroundUrl(backgroundPath === null ? null : toAssetUrl(backgroundPath));
      setIsFileModalOpen(false);
      setIsQuickSearchOpen(false);

      // Cargar lista de todas las dificultades del mapset
      listBeatmapDifficulties(path)
        .then((diffs) => {
          if (diffs.length > 0) {
            setDifficulties(diffs);
          }
        })
        .catch((err) => {
          console.error("Error al listar dificultades:", err);
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
    try {
      playbackRef.current?.pause();
      playbackRef.current?.seekTo(0);

      const content = await file.text();
      const parsed = parseOsuFile(content);
      setSource(parsed);
      setFileName(file.name);
      setSourcePath(null);
      setDifficulties([]);
      setLoadError(null);
      setAudioUrl(null);
      setIsFileModalOpen(false);
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
    setLaneMapState(createDefaultLaneMapState());
  }

  const converted = useMemo(
    () =>
      source === null
        ? null
        : convertBeatmap(source, {
            laneMap: toLaneMap(laneMapState),
            targetKeyCount: TARGET_KEY_COUNT,
            zeroLn,
          }),
    [source, laneMapState, zeroLn],
  );

  const issues = useMemo<ConversionIssue[]>(
    () => (converted === null ? [] : validateConvertedBeatmap(converted)),
    [converted],
  );

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
    beatmap: converted ?? EMPTY_BEATMAP,
    audioUrl,
    volume: settings.volume,
    hitsoundsEnabled: settings.hitsounds,
    hitsoundVolume: settings.hitsoundVolume,
    isPlayMode,
    keybinds: settings.keybinds7k,
  });
  playbackRef.current = playback;

  const [isKiaiActive, setIsKiaiActive] = useState(false);

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

      // Sincronizar estado booleano de Kiai para el UI (solo cuando cambie)
      setIsKiaiActive((prev) => (prev !== isInKiai ? isInKiai : prev));

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
    setLaneMapState(preset.laneMapState);
  }

  async function handleExport(): Promise<void> {
    if (source === null || converted === null || fileName === null) {
      return;
    }

    const rawSuffix = settings.diffSuffix?.trim();
    const suffix = rawSuffix && rawSuffix.length > 0 ? rawSuffix : "(7K)";
    const version7k = source.version ? `${source.version} ${suffix}` : suffix;
    const exportBeatmap: OsuBeatmap = {
      ...converted,
      version: version7k,
      beatmapId: 0,
      beatmapSetId: source.beatmapSetId,
    };
    const content = serializeOsuFile(exportBeatmap);

    if (isTauri() && sourcePath) {
      try {
        const lastSep = Math.max(sourcePath.lastIndexOf("/"), sourcePath.lastIndexOf("\\"));
        const dir = lastSep >= 0 ? sourcePath.slice(0, lastSep) : ".";

        const clean = (str: string) => str.replace(/[\\/:*?"<>|]/g, "").trim();
        const artist = clean(source.artist || "Artist");
        const title = clean(source.title || "Title");
        const creator = clean(source.creator || "Creator");
        const diff = clean(version7k);

        const newFileName = `${artist} - ${title} (${creator}) [${diff}].osu`;
        const newPath = `${dir}\\${newFileName}`;

        await saveBeatmap(newPath, content);
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
      </>
    );
  }

  if (source === null || converted === null || fileName === null) {
    return (
      <>
        <main className="app-shell">
          <FileDropZone
            onPathSelected={(path) => void handlePathSelected(path)}
            onFileSelected={(file) => void handleFileSelected(file)}
          />
          <DebugConsole />
        </main>
        <QuickSearchModal
          isOpen={isQuickSearchOpen}
          onClose={() => setIsQuickSearchOpen(false)}
          onSelectBeatmap={(path) => void handlePathSelected(path)}
          currentBeatmapPath={sourcePath}
        />
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
              onToggleZeroLn={setZeroLn}
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
              onChange={setLaneMapState}
              presets={presets}
              onSavePreset={handleSavePreset}
              onDeletePreset={handleDeletePreset}
              onApplyPreset={handleApplyPreset}
            />
            <StatsBar
              source={source}
              converted={converted}
              targetColumnCounts={targetColumnCounts}
              issueCounts={issueCounts}
              playback={playback}
            />
            <IssuesPanel issues={issues} />
          </aside>
          <section className="app-canvas-panel">
            <Playfield
              sourceBeatmap={source}
              targetBeatmap={converted}
              playback={playback}
              scrollSpeed={settings.scrollSpeed}
              playfieldWidth={settings.playfieldWidth}
              scrollDirection={settings.scrollDirection}
              previewMode={settings.previewMode}
              hitGlow={settings.hitGlow}
              volume={settings.volume}
              isPlayMode={isPlayMode}
              keybinds={settings.keybinds7k}
              playOffsetMs={settings.playOffsetMs}
              comboPositionPercent={settings.comboPositionPercent}
              playShowLaneSeparators={settings.playShowLaneSeparators}
              noteHeight={settings.noteHeight}
              onExitPlayMode={() => setIsPlayMode(false)}
            />
          </section>
        </div>
        <PlaybackFooter
          playback={playback}
          beatmap={converted ?? source}
          onExport={handleExport}
          isPlayMode={isPlayMode}
          onTogglePlayMode={() => setIsPlayMode((prev) => !prev)}
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

      <QuickSearchModal
        isOpen={isQuickSearchOpen}
        onClose={() => setIsQuickSearchOpen(false)}
        onSelectBeatmap={(path) => void handlePathSelected(path)}
        currentBeatmapPath={sourcePath}
      />

      <QuickToastOsd osd={osd} />
      <DebugConsole />

      {/* Modal de selección/drop de nuevo archivo sin perder el estado previo si se cancela */}
      {isFileModalOpen && (
        <div className="file-modal-overlay" onClick={() => setIsFileModalOpen(false)}>
          <div className="file-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <FileDropZone
              onPathSelected={(path) => void handlePathSelected(path)}
              onFileSelected={(file) => void handleFileSelected(file)}
              onClose={() => setIsFileModalOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
