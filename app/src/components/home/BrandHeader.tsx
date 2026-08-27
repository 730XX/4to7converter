import { Settings2, Layers3, X } from "lucide-react";

interface BrandHeaderProps {
  onOpenSettings?: () => void;
  onClose?: () => void;
}

export function BrandHeader({ onOpenSettings, onClose }: BrandHeaderProps) {
  return (
    <header className="home-brand-header">
      <div className="glass-panel home-brand-badge">
        <span className="home-brand-logo-icon bg-neon-gradient">
          <Layers3 size={20} strokeWidth={2.4} />
        </span>
        <div className="home-brand-text">
          <div className="home-brand-title-row">
            <span className="home-brand-name">4to7 Mania Converter</span>
            <span className="home-brand-version mono">v0.4.0</span>
          </div>
          <div className="home-brand-status">
            <span className="status-ping-dot">
              <span className="ping-wave" />
              <span className="ping-core" />
            </span>
            Motor listo • 7K Engine
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            title="Ajustes (Ctrl + O)"
            className="glass-panel home-settings-btn"
          >
            <Settings2 size={16} className="home-settings-icon" />
            <span className="mono home-settings-shortcut">Ctrl + O</span>
          </button>
        )}

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="glass-panel home-close-btn"
            title="Volver"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
