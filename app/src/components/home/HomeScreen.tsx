import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { detectOsuBeatmap, isTauri, type OsuDetectedBeatmap } from "../../lib/native";
import { loadRecentBeatmaps, removeRecentBeatmap, type RecentBeatmapItem } from "../../lib/recent-beatmaps";
import { BrandHeader } from "./BrandHeader";
import { DropZone } from "./DropZone";
import { RecentBeatmaps } from "./RecentBeatmaps";
import { ShortcutBar } from "./ShortcutBar";
import { BgaBackground } from "./BgaBackground";
import { SessionStatsWidget } from "./SessionStatsWidget";
import { BmsMiniPlayfieldPreview } from "./BmsMiniPlayfieldPreview";

import type { UserSettings } from "../../lib/settings";

interface HomeScreenProps {
  onPathSelected: (path: string) => void;
  onFileSelected: (file: File) => void;
  onClose?: () => void;
  onOpenSettings?: () => void;
  settings?: UserSettings;
}

/**
 * Pantalla de Inicio principal de 4to7 Mania Converter.
 * Orquesta BrandHeader, DropZone/BmsMiniPlayfieldPreview, RecentBeatmaps, SessionStatsWidget y ShortcutBar.
 */
export function HomeScreen({
  onPathSelected,
  onFileSelected,
  onClose,
  onOpenSettings,
  settings,
}: HomeScreenProps) {
  const [detectedMap, setDetectedMap] = useState<OsuDetectedBeatmap | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [recentMaps, setRecentMaps] = useState<RecentBeatmapItem[]>(() => loadRecentBeatmaps());
  const [activeBmsState, setActiveBmsState] = useState<{
    map: RecentBeatmapItem | null;
    isBmsMode: boolean;
    audioElement: HTMLAudioElement | null;
    isPlaying: boolean;
  }>({
    map: null,
    isBmsMode: false,
    audioElement: null,
    isPlaying: false,
  });
  const onPathSelectedRef = useRef(onPathSelected);

  useEffect(() => {
    onPathSelectedRef.current = onPathSelected;
  }, [onPathSelected]);

  // Sondeo de osu! en segundo plano
  useEffect(() => {
    if (!isTauri()) return;
    let isMounted = true;

    async function checkOsu(): Promise<void> {
      try {
        const found = await detectOsuBeatmap();
        if (isMounted) setDetectedMap(found);
      } catch {
        if (isMounted) setDetectedMap(null);
      }
    }

    void checkOsu();
    const interval = window.setInterval(() => {
      void checkOsu();
    }, 4000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  // Eventos de arrastrar y soltar nativos en Tauri
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;

    async function setupTauriDragDrop(): Promise<void> {
      try {
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent((event) => {
          if (event.payload.type === "drop") {
            const droppedPaths = event.payload.paths;
            if (droppedPaths && droppedPaths.length > 0) {
              const firstOsu = droppedPaths.find((p) => p.toLowerCase().endsWith(".osu"));
              if (firstOsu) {
                onPathSelectedRef.current(firstOsu);
              }
            }
          }
        });
      } catch (err) {
        console.error("Error al suscribirse a eventos de arrastre nativo:", err);
      }
    }

    void setupTauriDragDrop();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  async function handleManualScan(): Promise<void> {
    setIsScanning(true);
    try {
      const found = await detectOsuBeatmap();
      setDetectedMap(found);
    } catch {
      setDetectedMap(null);
    } finally {
      setIsScanning(false);
    }
  }

  async function openFilePicker(): Promise<void> {
    if (isTauri()) {
      try {
        const selected = await open({
          multiple: false,
          filters: [{ name: "osu! Beatmap", extensions: ["osu"] }],
        });
        if (typeof selected === "string") {
          onPathSelectedRef.current(selected);
        }
      } catch {
        // Fallback al selector web
      }
    }
  }

  const handleBmsStateChange = (
    map: RecentBeatmapItem | null,
    isBmsMode: boolean,
    audioElement: HTMLAudioElement | null,
    isPlaying: boolean
  ) => {
    setActiveBmsState((prev) => {
      if (
        prev.map?.path === map?.path &&
        prev.isBmsMode === isBmsMode &&
        prev.audioElement === audioElement &&
        prev.isPlaying === isPlaying
      ) {
        return prev;
      }
      return { map, isBmsMode, audioElement, isPlaying };
    });
  };

  const handleRemoveRecentMap = (item: RecentBeatmapItem) => {
    removeRecentBeatmap(item);
    setRecentMaps((prev) => prev.filter((b) => b.id !== item.id));
  };

  return (
    <div className="home-screen-wrapper">
      <BgaBackground />

      <div className="home-screen-container">
        {/* Sección Principal Asimétrica 70% / 30% */}
        <main className="home-main-split">
          {/* Columna Izquierda: BrandHeader + Mapas Recientes (70%) */}
          <div className="home-main-left">
            <BrandHeader
              detectedMap={detectedMap}
              isScanning={isScanning}
              onLoadDetected={(path) => onPathSelectedRef.current(path)}
              onRescan={() => void handleManualScan()}
              onOpenSettings={onOpenSettings}
              onClose={onClose}
            />

            <RecentBeatmaps
              maps={recentMaps}
              onSelectMap={(path) => onPathSelectedRef.current(path)}
              onFallbackBrowse={() => void openFilePicker()}
              onRemoveMap={handleRemoveRecentMap}
              volume={settings?.volume ?? 80}
              onBmsStateChange={handleBmsStateChange}
            />
          </div>

          {/* Columna Derecha: Hub de Entrada o Mini Playfield BMS + Live Monitor (30%) */}
          <div className="home-main-right">
            {activeBmsState.isBmsMode && activeBmsState.map ? (
              <BmsMiniPlayfieldPreview
                beatmapPath={activeBmsState.map.path}
                audioElement={activeBmsState.audioElement}
                isPlaying={activeBmsState.isPlaying}
                scrollSpeed={settings?.scrollSpeed ?? 25}
                scrollDirection={settings?.scrollDirection ?? "down"}
                hitsoundVolume={
                  activeBmsState.isPlaying ? (settings?.hitsoundVolume ?? 35) : 0
                }
                hitPositionOffset={settings?.hitPositionOffset ?? 20}
                receptorOffset={settings?.receptorOffset ?? 0}
                noteHeight={settings?.noteHeight ?? 16}
                onOpenBeatmap={() => {
                  if (activeBmsState.map?.path) {
                    onPathSelectedRef.current(activeBmsState.map.path);
                  }
                }}
              />
            ) : (
              <>
                <DropZone
                  onOpenFilePicker={() => void openFilePicker()}
                  onFileSelected={onFileSelected}
                />
                <SessionStatsWidget />
              </>
            )}
          </div>
        </main>
      </div>

      <ShortcutBar />
    </div>
  );
}
