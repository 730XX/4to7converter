import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { detectOsuBeatmap, isTauri, type OsuDetectedBeatmap } from "../../lib/native";
import { loadRecentBeatmaps, type RecentBeatmapItem } from "../../lib/recent-beatmaps";
import { BrandHeader } from "./BrandHeader";
import { OsuProcessCard } from "./OsuProcessCard";
import { DropZone } from "./DropZone";
import { RecentBeatmaps } from "./RecentBeatmaps";
import { ShortcutBar } from "./ShortcutBar";
import { BgaBackground } from "./BgaBackground";

interface HomeScreenProps {
  onPathSelected: (path: string) => void;
  onFileSelected: (file: File) => void;
  onClose?: () => void;
  onOpenSettings?: () => void;
}

/**
 * Pantalla de Inicio principal de 4to7 Mania Converter.
 * Orquesta BrandHeader, OsuProcessCard, DropZone, RecentBeatmaps y ShortcutBar.
 */
export function HomeScreen({
  onPathSelected,
  onFileSelected,
  onClose,
  onOpenSettings,
}: HomeScreenProps) {
  const [detectedMap, setDetectedMap] = useState<OsuDetectedBeatmap | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [recentMaps] = useState<RecentBeatmapItem[]>(() => loadRecentBeatmaps());
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

  return (
    <div className="home-screen-wrapper">
      <BgaBackground />

      <div className="home-screen-container">
        <BrandHeader onOpenSettings={onOpenSettings} onClose={onClose} />

        {isTauri() && (
          <OsuProcessCard
            detectedMap={detectedMap}
            isScanning={isScanning}
            onLoadDetected={(path) => onPathSelectedRef.current(path)}
            onRescan={() => void handleManualScan()}
          />
        )}

        <DropZone
          onOpenFilePicker={() => void openFilePicker()}
          onFileSelected={onFileSelected}
        />

        <RecentBeatmaps
          maps={recentMaps}
          onSelectMap={(path) => onPathSelectedRef.current(path)}
          onFallbackBrowse={() => void openFilePicker()}
        />
      </div>

      <ShortcutBar />
    </div>
  );
}
