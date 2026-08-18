import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowRight,
  CheckCircle2,
  FileMusic,
  Gamepad2,
  RefreshCw,
  UploadCloud,
  X,
} from "lucide-react";
import { detectOsuBeatmap, isTauri, type OsuDetectedBeatmap } from "../lib/native";

interface FileDropZoneProps {
  onPathSelected: (path: string) => void;
  onFileSelected: (file: File) => void;
  onClose?: () => void;
}

interface DragHandlers {
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

/**
 * Zona de carga de archivos .osu con soporte para arrastrar y soltar,
 * explorador nativo y detección en vivo del mapa activo en osu!.
 */
export function FileDropZone({ onPathSelected, onFileSelected, onClose }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [detectedMap, setDetectedMap] = useState<OsuDetectedBeatmap | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onPathSelectedRef = useRef(onPathSelected);

  useEffect(() => {
    onPathSelectedRef.current = onPathSelected;
  }, [onPathSelected]);

  // Detección inicial y sondeo periódico de osu! mientras esté en la pantalla de inicio
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let isMounted = true;

    async function checkOsu(): Promise<void> {
      try {
        const found = await detectOsuBeatmap();
        if (isMounted) {
          setDetectedMap(found);
        }
      } catch {
        if (isMounted) {
          setDetectedMap(null);
        }
      }
    }

    // Delay inicial de 500ms para permitir que la transición del splashscreen termine suavemente
    const initialTimer = window.setTimeout(() => {
      void checkOsu();
    }, 500);

    // Sondeo suave cada 3 segundos mientras esté abierta la pantalla de inicio
    const interval = window.setInterval(() => {
      void checkOsu();
    }, 3000);

    return () => {
      isMounted = false;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  async function handleManualScan(): Promise<void> {
    setIsScanning(true);
    try {
      const found = await detectOsuBeatmap();
      setDetectedMap(found);
    } finally {
      setIsScanning(false);
    }
  }

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let isMounted = true;
    let unlisten: (() => void) | null = null;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (!isMounted) return;
        const { type } = event.payload;
        if (type === "enter" || type === "over") {
          setIsDragging(true);
          return;
        }
        if (type === "leave") {
          setIsDragging(false);
          return;
        }
        setIsDragging(false);
        const osuPath = event.payload.paths.find((path) => path.toLowerCase().endsWith(".osu"));
        if (osuPath !== undefined) {
          onPathSelectedRef.current(osuPath);
        }
      })
      .then((fn) => {
        if (isMounted) {
          unlisten = fn;
        } else {
          fn();
        }
      })
      .catch((err) => {
        console.warn("No se pudo registrar listener de drag and drop en Tauri:", err);
      });

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  async function openFilePicker(): Promise<void> {
    if (isTauri()) {
      const selected = await open({
        multiple: false,
        filters: [{ name: "osu", extensions: ["osu"] }],
      });
      if (typeof selected === "string") {
        onPathSelectedRef.current(selected);
      }
      return;
    }
    inputRef.current?.click();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file !== undefined) {
      onFileSelected(file);
    }
    event.target.value = "";
  }

  function handleDragEnter(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node)) {
      return;
    }
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file !== undefined) {
      onFileSelected(file);
    }
  }

  const dragHandlers: Partial<DragHandlers> = isTauri()
    ? {}
    : {
        onDragEnter: handleDragEnter,
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
        onDrop: handleDrop,
      };

  return (
    <section
      className={`drop-zone${isDragging ? " is-dragging" : ""}${onClose ? " drop-zone--modal" : ""}`}
      {...dragHandlers}
    >
      {onClose && (
        <button
          type="button"
          className="drop-zone-close-btn"
          onClick={onClose}
          title="Cerrar ventana"
          aria-label="Cerrar ventana"
        >
          <X size={18} />
        </button>
      )}

      {/* Banner interactivo de detección de osu! */}
      {isTauri() && (
        <div className="osu-detect-banner">
          {detectedMap ? (
            <div className="osu-detect-card osu-detect-card--active">
              <div className="osu-detect-header">
                <span className="osu-detect-badge">
                  <Gamepad2 size={14} className="osu-detect-icon" />
                  osu! en ejecución
                </span>
                <button
                  type="button"
                  className="osu-detect-refresh-btn"
                  onClick={() => void handleManualScan()}
                  title="Volver a escanear osu!"
                  disabled={isScanning}
                >
                  <RefreshCw size={13} className={isScanning ? "is-spinning" : ""} />
                </button>
              </div>

              <div className="osu-detect-info">
                <p className="osu-detect-title">{detectedMap.title || detectedMap.folder_name}</p>
                <p className="osu-detect-meta mono">
                  {detectedMap.version ? `[${detectedMap.version}]` : detectedMap.file_name}
                </p>
              </div>

              <button
                type="button"
                className="osu-detect-load-btn"
                onClick={() => onPathSelectedRef.current(detectedMap.path)}
              >
                <CheckCircle2 size={16} />
                <span>Cargar mapa detectado</span>
                <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <div className="osu-detect-card osu-detect-card--idle">
              <div className="osu-detect-idle-content">
                <Gamepad2 size={16} className="text-muted" />
                <span className="osu-detect-idle-text">¿Tienes osu! abierto?</span>
              </div>
              <button
                type="button"
                className="osu-detect-scan-btn"
                onClick={() => void handleManualScan()}
                disabled={isScanning}
              >
                <RefreshCw size={13} className={isScanning ? "is-spinning" : ""} />
                <span>{isScanning ? "Escaneando..." : "Detectar mapa"}</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div className="drop-zone-icon-shell">
        <FileMusic size={44} className="drop-zone-icon" />
      </div>
      <h1 className="drop-zone-title">Convierte tus mapas de osu!mania de 4k a 7k a tu manera.</h1>

      <button type="button" className="drop-zone-button" onClick={() => void openFilePicker()}>
        <span className="drop-zone-prompt">
          <UploadCloud
            size={20}
            style={{ display: "inline-block", verticalAlign: "middle", marginRight: 8 }}
          />
          Arrastra tu archivo .osu aquí
        </span>
        <span className="drop-zone-browse">o haz clic para buscarlo</span>
      </button>

      <p className="drop-zone-helper">Solo mapas osu!mania (Mode 3)</p>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept=".osu"
        onChange={handleInputChange}
      />
    </section>
  );
}
