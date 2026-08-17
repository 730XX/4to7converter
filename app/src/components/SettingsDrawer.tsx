import {
  Volume2,
  Gauge,
  Eye,
  Palette,
  X,
  Sliders,
  Sparkles,
  ArrowDownUp,
  LayoutGrid,
  FileText
} from "lucide-react";
import type { UserSettings } from "../lib/settings";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onUpdateSettings: (updater: (prev: UserSettings) => UserSettings) => void;
}

/**
 * Sidebar drawer de configuración de la aplicación con diseño Glassmorphism.
 */
export function SettingsDrawer({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}: SettingsDrawerProps) {
  const {
    volume,
    scrollSpeed,
    scrollDirection,
    previewMode,
    backdropDim,
    playfieldWidth,
    hitGlow,
    hitsounds,
    diffSuffix,
  } = settings;

  function update<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
    onUpdateSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <>
      {/* Overlay difuminado de fondo al abrir el drawer */}
      <div
        className={`settings-overlay${isOpen ? " is-open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`settings-drawer${isOpen ? " is-open" : ""}`} aria-label="Ajustes de la aplicación">
        {/* Cabecera del Drawer */}
        <header className="settings-header">
          <div className="settings-header-title">
            <Sliders size={20} className="text-accent" />
            <h2>Ajustes</h2>
          </div>
          <button
            type="button"
            className="settings-close-btn"
            onClick={onClose}
            aria-label="Cerrar ajustes"
          >
            <X size={18} />
          </button>
        </header>

        {/* Contenido scrolleable de opciones */}
        <div className="settings-content">
          {/* SECCIÓN: Audio */}
          <section className="settings-group">
            <div className="settings-group-header">
              <Volume2 size={16} className="text-accent" />
              <h3>Audio & Sonido</h3>
            </div>

            <div className="settings-item">
              <div className="settings-item-info">
                <span className="settings-item-label">Volumen de música</span>
                <span className="settings-item-value mono">{volume}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => update("volume", Number(e.target.value))}
                className="settings-slider"
              />
            </div>

            <div className="settings-item settings-item--row">
              <span className="settings-item-label">Hitsounds (soft-hitnormal)</span>
              <button
                type="button"
                className={`toggle-switch${hitsounds ? " is-active" : ""}`}
                onClick={() => update("hitsounds", !hitsounds)}
                aria-pressed={hitsounds}
              >
                <span className="toggle-thumb" />
              </button>
            </div>

            {hitsounds && (
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Volumen de hitsounds</span>
                  <span className="settings-item-value mono">{settings.hitsoundVolume ?? 70}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.hitsoundVolume ?? 70}
                  onChange={(e) => update("hitsoundVolume", Number(e.target.value))}
                  className="settings-slider"
                />
              </div>
            )}
          </section>

          {/* SECCIÓN: Gameplay & Scroll */}
          <section className="settings-group">
            <div className="settings-group-header">
              <Gauge size={16} className="text-accent" />
              <h3>Gameplay & Scroll</h3>
            </div>

            <div className="settings-item">
              <div className="settings-item-info">
                <span className="settings-item-label">Scroll (Scroll Speed)</span>
                <span className="settings-item-value mono">{(scrollSpeed / 10).toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={10}
                max={40}
                value={scrollSpeed}
                onChange={(e) => update("scrollSpeed", Number(e.target.value))}
                className="settings-slider"
              />
            </div>

            <div className="settings-item">
              <div className="settings-item-info">
                <span className="settings-item-label">Dirección de scroll</span>
              </div>
              <div className="settings-segmented-control">
                <button
                  type="button"
                  className={`segmented-btn${scrollDirection === "down" ? " is-active" : ""}`}
                  onClick={() => update("scrollDirection", "down")}
                >
                  <ArrowDownUp size={14} />
                  <span>Downscroll</span>
                </button>
                <button
                  type="button"
                  className={`segmented-btn${scrollDirection === "up" ? " is-active" : ""}`}
                  onClick={() => update("scrollDirection", "up")}
                >
                  <ArrowDownUp size={14} />
                  <span>Upscroll</span>
                </button>
              </div>
            </div>
          </section>

          {/* SECCIÓN: Visualización & Preview */}
          <section className="settings-group">
            <div className="settings-group-header">
              <Eye size={16} className="text-accent" />
              <h3>Visualización</h3>
            </div>

            <div className="settings-item">
              <div className="settings-item-info">
                <span className="settings-item-label">Modo de Vista Previa</span>
              </div>
              <div className="settings-segmented-control">
                
                <button
                  type="button"
                  className={`segmented-btn${previewMode === "7k" ? " is-active" : ""}`}
                  onClick={() => update("previewMode", "7k")}
                >
                  <span>7K Convertido</span>
                </button>
                
                <button
                  type="button"
                  className={`segmented-btn${previewMode === "4k" ? " is-active" : ""}`}
                  onClick={() => update("previewMode", "4k")}
                >
                  <span>4K Original</span>
                </button>
                <button
                  type="button"
                  className={`segmented-btn${previewMode === "split" ? " is-active" : ""}`}
                  onClick={() => update("previewMode", "split")}
                >
                  <span>Split (Ambos)</span>
                </button>
              </div>
            </div>

            <div className="settings-item">
              <div className="settings-item-info">
                <span className="settings-item-label">Opacidad de fondo (Backdrop Dim)</span>
                <span className="settings-item-value mono">{backdropDim}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={backdropDim}
                onChange={(e) => update("backdropDim", Number(e.target.value))}
                className="settings-slider"
              />
            </div>
          </section>

          {/* SECCIÓN: Estilo del Playfield */}
          <section className="settings-group">
            <div className="settings-group-header">
              <Palette size={16} className="text-accent" />
              <h3>Playfield & Efectos</h3>
            </div>

            <div className="settings-item">
              <div className="settings-item-info">
                <span className="settings-item-label">Ancho del playfield</span>
              </div>
              <div className="settings-segmented-control">
                <button
                  type="button"
                  className={`segmented-btn${playfieldWidth === "compact" ? " is-active" : ""}`}
                  onClick={() => update("playfieldWidth", "compact")}
                >
                  <LayoutGrid size={14} />
                  <span>Compacto</span>
                </button>
                <button
                  type="button"
                  className={`segmented-btn${playfieldWidth === "normal" ? " is-active" : ""}`}
                  onClick={() => update("playfieldWidth", "normal")}
                >
                  <LayoutGrid size={14} />
                  <span>Normal</span>
                </button>
                <button
                  type="button"
                  className={`segmented-btn${playfieldWidth === "wide" ? " is-active" : ""}`}
                  onClick={() => update("playfieldWidth", "wide")}
                >
                  <LayoutGrid size={14} />
                  <span>Amplio</span>
                </button>
              </div>
            </div>

            <div className="settings-item settings-item--row">
              <div className="settings-item-label-group">
                <span className="settings-item-label">Destello en Hit Line (Glow)</span>
                <span className="settings-item-hint">Resplandor al tocar las notas</span>
              </div>
              <button
                type="button"
                className={`toggle-switch${hitGlow ? " is-active" : ""}`}
                onClick={() => update("hitGlow", !hitGlow)}
                aria-pressed={hitGlow}
              >
                <span className="toggle-thumb" />
              </button>
            </div>
          </section>

          {/* SECCIÓN: Exportación & Dificultad */}
          <section className="settings-group">
            <div className="settings-group-header">
              <FileText size={16} className="text-accent" />
              <h3>Exportación</h3>
            </div>

            <div className="settings-item">
              <div className="settings-item-label-group" style={{ marginBottom: "6px" }}>
                <span className="settings-item-label">Sufijo de Dificultad (Diff)</span>
                <span className="settings-item-hint">
                  Texto al final del nombre de dificultad al exportar (por defecto: (7K))
                </span>
              </div>
              <input
                type="text"
                value={diffSuffix ?? "(7K)"}
                placeholder="(7K)"
                onChange={(e) => update("diffSuffix", e.target.value)}
                className="settings-text-input"
              />
            </div>
          </section>

          {/* SECCIÓN: Atajos de teclado */}
          <section className="settings-group">
            <div className="settings-group-header">
              <Sparkles size={16} className="text-accent" />
              <h3>Atajos Rápidos</h3>
            </div>
            <div className="settings-shortcuts-list">
              <div className="settings-shortcut-row">
                <span className="shortcut-desc">Play / Pausa</span>
                <kbd className="shortcut-kbd mono">Espacio</kbd>
              </div>
              <div className="settings-shortcut-row">
                <span className="shortcut-desc">Abrir / Cerrar Opciones</span>
                <kbd className="shortcut-kbd mono">Ctrl + O</kbd>
              </div>
              <div className="settings-shortcut-row">
                <span className="shortcut-desc">Alternar Vista Split / 7K</span>
                <kbd className="shortcut-kbd mono">Tab</kbd>
              </div>
              <div className="settings-shortcut-row">
                <span className="shortcut-desc">Velocidad de caída</span>
                <kbd className="shortcut-kbd mono">Ctrl + Rueda</kbd>
              </div>
              <div className="settings-shortcut-row">
                <span className="shortcut-desc">Volumen de música</span>
                <kbd className="shortcut-kbd mono">Alt + Rueda</kbd>
              </div>
              <div className="settings-shortcut-row">
                <span className="shortcut-desc">Volumen de hitsounds</span>
                <kbd className="shortcut-kbd mono">Ctrl + Alt + Rueda</kbd>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
