import { Gamepad2, Radar, RefreshCw, Settings, X } from "lucide-react";
import type { OsuDetectedBeatmap } from "../../lib/native";

interface BrandHeaderProps {
  detectedMap: OsuDetectedBeatmap | null;
  isScanning: boolean;
  onLoadDetected: (path: string) => void;
  onRescan: () => void;
  onOpenSettings?: () => void;
  onClose?: () => void;
}

export function BrandHeader({
  detectedMap,
  isScanning,
  onLoadDetected,
  onRescan,
  onOpenSettings,
  onClose,
}: BrandHeaderProps) {
  return (
    <header className="home-top-bar">
      {/* Título tipográfico moderno sin card */}
      <div className="home-title-group">
        <div className="home-logo-wrap">
          <h1 className="home-brand-heading">
            4to7 Mania <span className="home-brand-sub">Converter</span>
          </h1>
        </div>
      </div>

      {/* Acciones y Badge Inteligente de osu! */}
      <div className="home-top-actions">
        {/* Badge Inteligente de osu! integrado al Header */}
        <div
          className={`home-osu-badge ${
            detectedMap ? "is-detected" : "is-idle"
          }`}
        >
          <span className="home-osu-badge-icon">
            {isScanning ? (
              <Radar size={14} className="is-spinning text-cyan" />
            ) : (
              <Gamepad2 size={14} />
            )}
          </span>

          {detectedMap ? (
            <button
              type="button"
              onClick={() => onLoadDetected(detectedMap.path)}
              className="home-osu-load-trigger"
              title="Click para cargar el beatmap activo de osu!"
            >
              <span className="home-osu-load-label">Cargar de osu!:</span>
              <span className="home-osu-song-name">
                {detectedMap.title || detectedMap.folder_name}
              </span>
            </button>
          ) : (
            <span className="home-osu-idle-text">osu! inactivo</span>
          )}

          <button
            type="button"
            onClick={onRescan}
            disabled={isScanning}
            className="home-osu-rescan-btn"
            title="Volver a escanear osu!"
          >
            <RefreshCw size={12} className={isScanning ? "is-spinning" : ""} />
          </button>
        </div>

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            title="Ajustes (Ctrl + O)"
            className="home-settings-btn"
          >
            <Settings size={15} className="home-settings-icon" />
            <span className="mono home-settings-shortcut">Ctrl + O</span>
          </button>
        )}

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="home-close-btn"
            title="Volver al editor"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
