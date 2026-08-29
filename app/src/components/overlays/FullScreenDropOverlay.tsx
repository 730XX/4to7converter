import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { FileUp } from "lucide-react";
import { isTauri } from "../../lib/native";

interface FullScreenDropOverlayProps {
  onPathDropped: (path: string) => void;
  onFileDropped: (file: File) => void;
}

export function FullScreenDropOverlay({
  onPathDropped,
  onFileDropped,
}: FullScreenDropOverlayProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // 1. Detección en Tauri nativo
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;

    async function setupTauriDragDrop() {
      try {
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent((event) => {
          const type = event.payload.type;
          if (type === "enter" || type === "over") {
            setIsDraggingOver(true);
          } else if (type === "leave") {
            setIsDraggingOver(false);
          } else if (type === "drop") {
            setIsDraggingOver(false);
            const droppedPaths = event.payload.paths;
            if (droppedPaths && droppedPaths.length > 0) {
              const firstOsu = droppedPaths.find((p) => p.toLowerCase().endsWith(".osu"));
              if (firstOsu) {
                onPathDropped(firstOsu);
              }
            }
          }
        });
      } catch (err) {
        console.error("Error al escuchar drag and drop en Tauri:", err);
      }
    }

    void setupTauriDragDrop();
    return () => {
      if (unlisten) unlisten();
    };
  }, [onPathDropped]);

  // 2. Detección en Web / DOM estándar
  useEffect(() => {
    let dragCounter = 0;

    function handleDragEnter(e: DragEvent) {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
        setIsDraggingOver(true);
      }
    }

    function handleDragLeave(e: DragEvent) {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setIsDraggingOver(false);
      }
    }

    function handleDragOver(e: DragEvent) {
      e.preventDefault();
      if (!isDraggingOver && e.dataTransfer && e.dataTransfer.types.includes("Files")) {
        setIsDraggingOver(true);
      }
    }

    function handleDrop(e: DragEvent) {
      e.preventDefault();
      dragCounter = 0;
      setIsDraggingOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file && file.name.toLowerCase().endsWith(".osu")) {
        onFileDropped(file);
      }
    }

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [isDraggingOver, onFileDropped]);

  if (!isDraggingOver) return null;

  return (
    <div className="fullscreen-drop-overlay" aria-modal="true" role="dialog">
      <div className="fullscreen-drop-border" />
      
      <div className="fullscreen-drop-content">
        <div className="fullscreen-drop-icon-gem">
          <FileUp size={64} className="fullscreen-drop-icon" strokeWidth={2.2} />
        </div>

        <h1 className="fullscreen-drop-title">
          ¡SUELTA EL BEATMAP AQUÍ!
        </h1>

        <p className="fullscreen-drop-subtitle">
          Archivo Listo para cargar mi king 👑
        </p>

        {/* <div className="fullscreen-drop-tag mono">
          4to7 CONVERTER AUTO-LOAD
        </div> */}
      </div>
    </div>
  );
}
