import { useState } from "react";
import {
  Volume2,
  Gauge,
  Sliders,
  ArrowDownUp,
  LayoutGrid,
  FileText,
  Gamepad2,
  Keyboard,
  Clock,
  Sparkles,
  X,
  Layers,
  HelpCircle,
} from "lucide-react";
import { formatKeyCode, type UserSettings } from "../lib/settings";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onUpdateSettings: (updater: (prev: UserSettings) => UserSettings) => void;
  onOpenKeybinds?: () => void;
}

type SettingsTab = "play" | "gameplay" | "audio" | "general";

/**
 * Sidebar drawer remasterizado con navegación por pestañas (Tabs) y diseño Glassmorphism.
 */
export function SettingsDrawer({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onOpenKeybinds,
}: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("play");

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
    keybinds7k,
    playOffsetMs = 0,
    comboPositionPercent = 55,
    playShowLaneSeparators = true,
    noteHeight = 16,
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

      <aside
        className={`settings-drawer${isOpen ? " is-open" : ""}`}
        aria-label="Ajustes de la aplicación"
      >
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

        {/* Barra de Pestañas / Tabs Modernos */}
        <nav className="settings-tabs-nav" aria-label="Categorías de ajustes">
          <button
            type="button"
            className={`settings-tab-btn${activeTab === "play" ? " is-active" : ""}`}
            onClick={() => setActiveTab("play")}
          >
            <Gamepad2 size={15} />
            <span>Play</span>
          </button>
          <button
            type="button"
            className={`settings-tab-btn${activeTab === "gameplay" ? " is-active" : ""}`}
            onClick={() => setActiveTab("gameplay")}
          >
            <Gauge size={15} />
            <span>Gameplay</span>
          </button>
          <button
            type="button"
            className={`settings-tab-btn${activeTab === "audio" ? " is-active" : ""}`}
            onClick={() => setActiveTab("audio")}
          >
            <Volume2 size={15} />
            <span>Audio</span>
          </button>
          <button
            type="button"
            className={`settings-tab-btn${activeTab === "general" ? " is-active" : ""}`}
            onClick={() => setActiveTab("general")}
          >
            <FileText size={15} />
            <span>General</span>
          </button>
        </nav>

        {/* Contenido scrolleable de opciones según la pestaña activa */}
        <div className="settings-content">
          {/* TAB 1: Modo Play & Keybinds */}
          {activeTab === "play" && (
            <div className="settings-tab-pane">
              <section className="settings-group">
                <div className="settings-group-header">
                  <Gamepad2 size={16} className="text-accent" />
                  <h3>Controles & Calibración (7K)</h3>
                </div>

                <div className="settings-item">
                  <div className="settings-item-label-group" style={{ marginBottom: "6px" }}>
                    <span className="settings-item-label">Teclas de juego (7K)</span>
                    <span className="settings-item-hint">
                      Haz clic para remapear teclas en el modal visual
                    </span>
                  </div>

                  <div className="keybinds-strip-container">
                    <div
                      className="keybinds-strip mono"
                      onClick={onOpenKeybinds}
                      title="Abrir configurador de keybinds"
                    >
                      {(keybinds7k || []).map((code, idx) => (
                        <div
                          key={idx}
                          className={`keybinds-strip-key${idx === 3 ? " is-center" : ""}`}
                        >
                          {formatKeyCode(code)}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="keybinds-edit-btn"
                      onClick={onOpenKeybinds}
                    >
                      <Keyboard size={14} />
                      <span>Configurar Keybinds</span>
                    </button>
                  </div>
                </div>

                <div className="settings-item">
                  <div className="settings-item-info">
                    <div className="settings-item-label-group">
                      <span className="settings-item-label">Offset de Entrada</span>
                      <span className="settings-item-hint">
                        Sincronización visual y de golpe para Modo Play
                      </span>
                    </div>
                    <span className="settings-item-value mono">
                      {playOffsetMs > 0 ? `+${playOffsetMs}` : playOffsetMs} ms
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input
                      type="range"
                      min={-150}
                      max={150}
                      step={5}
                      value={playOffsetMs}
                      onChange={(e) => update("playOffsetMs", Number(e.target.value))}
                      className="settings-slider"
                    />
                    {playOffsetMs !== 0 && (
                      <button
                        type="button"
                        className="preset-action-btn"
                        onClick={() => update("playOffsetMs", 0)}
                        title="Restablecer offset a 0 ms"
                      >
                        <Clock size={13} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="settings-item">
                  <div className="settings-item-info">
                    <div className="settings-item-label-group">
                      <span className="settings-item-label">Altura del Contador de Combo</span>
                      <span className="settings-item-hint">
                        Posición vertical en el canvas (30% arriba, 85% abajo)
                      </span>
                    </div>
                    <span className="settings-item-value mono">{comboPositionPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={85}
                    step={1}
                    value={comboPositionPercent}
                    onChange={(e) => update("comboPositionPercent", Number(e.target.value))}
                    className="settings-slider"
                  />
                </div>

                <div className="settings-item settings-item--row">
                  <div className="settings-item-label-group">
                    <span className="settings-item-label">Barras separadoras</span>
                    <span className="settings-item-hint">
                      Líneas divisorias verticales en Modo Play
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch${playShowLaneSeparators ? " is-active" : ""}`}
                    onClick={() => update("playShowLaneSeparators", !playShowLaneSeparators)}
                    aria-pressed={playShowLaneSeparators}
                  >
                    <span className="toggle-thumb" />
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: Gameplay, Velocidad & Skin */}
          {activeTab === "gameplay" && (
            <div className="settings-tab-pane">
              <section className="settings-group">
                <div className="settings-group-header">
                  <Gauge size={16} className="text-accent" />
                  <h3>Velocidad & Lectura</h3>
                </div>

                <div className="settings-item">
                  <div className="settings-item-info">
                    <span className="settings-item-label">Velocidad de Scroll</span>
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
                    <div className="settings-item-label-group">
                      <span className="settings-item-label">Altura de las notas</span>
                      <span className="settings-item-hint">
                        Grosor vertical en píxeles (default: 16px)
                      </span>
                    </div>
                    <span className="settings-item-value mono">{noteHeight}px</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={36}
                    step={2}
                    value={noteHeight}
                    onChange={(e) => update("noteHeight", Number(e.target.value))}
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

              <section className="settings-group">
                <div className="settings-group-header">
                  <Layers size={16} className="text-accent" />
                  <h3>Playfield & Visuales</h3>
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
                      <span>7K</span>
                    </button>
                    <button
                      type="button"
                      className={`segmented-btn${previewMode === "4k" ? " is-active" : ""}`}
                      onClick={() => update("previewMode", "4k")}
                    >
                      <span>4K</span>
                    </button>
                    <button
                      type="button"
                      className={`segmented-btn${previewMode === "split" ? " is-active" : ""}`}
                      onClick={() => update("previewMode", "split")}
                    >
                      <span>Split</span>
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
            </div>
          )}

          {/* TAB 3: Audio & Hitsounds */}
          {activeTab === "audio" && (
            <div className="settings-tab-pane">
              <section className="settings-group">
                <div className="settings-group-header">
                  <Volume2 size={16} className="text-accent" />
                  <h3>Volúmenes</h3>
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
                  <div className="settings-item-label-group">
                    <span className="settings-item-label">Hitsounds Sintéticos</span>
                    <span className="settings-item-hint">Sonido de golpe al reproducir notas</span>
                  </div>
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
            </div>
          )}

          {/* TAB 4: General, Exportación & Atajos */}
          {activeTab === "general" && (
            <div className="settings-tab-pane">
              <section className="settings-group">
                <div className="settings-group-header">
                  <FileText size={16} className="text-accent" />
                  <h3>Exportación de Mapas</h3>
                </div>

                <div className="settings-item">
                  <div className="settings-item-label-group" style={{ marginBottom: "6px" }}>
                    <span className="settings-item-label">Sufijo de Dificultad</span>
                    <span className="settings-item-hint">
                      Texto agregado al nombre al exportar el .osu convertido
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

              <section className="settings-group">
                <div className="settings-group-header">
                  <HelpCircle size={16} className="text-accent" />
                  <h3>Atajos Rápidos de Teclado</h3>
                </div>

                <div className="settings-shortcuts-list">
                  <div className="settings-shortcut-row">
                    <span>Play / Pausa</span>
                    <kbd className="mono">Espacio</kbd>
                  </div>
                  <div className="settings-shortcut-row">
                    <span>Búsqueda rápida de mapas</span>
                    <kbd className="mono">Ctrl + P</kbd>
                  </div>
                  <div className="settings-shortcut-row">
                    <span>Abrir / Cerrar Ajustes</span>
                    <kbd className="mono">Ctrl + O</kbd>
                  </div>
                  <div className="settings-shortcut-row">
                    <span>Alternar vista 7K / Split</span>
                    <kbd className="mono">Tab</kbd>
                  </div>
                  <div className="settings-shortcut-row">
                    <span>Velocidad de scroll</span>
                    <kbd className="mono">Ctrl + Rueda</kbd>
                  </div>
                  <div className="settings-shortcut-row">
                    <span>Volumen de música</span>
                    <kbd className="mono">Alt + Rueda</kbd>
                  </div>
                  <div className="settings-shortcut-row">
                    <span>Volumen de hitsounds</span>
                    <kbd className="mono">Ctrl + Alt + Rueda</kbd>
                  </div>
                  <div className="settings-shortcut-row">
                    <span>Salir de Modo Play</span>
                    <kbd className="mono">ESC</kbd>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
