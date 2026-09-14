import { useEffect, useState } from "react";
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
  X,
  Layers,
  HelpCircle,
  Palette,
  RefreshCw,
} from "lucide-react";
import {
  BEAT_DIVISORS,
  formatKeyCode,
  SETTINGS_LIMITS,
  type UserSettings,
} from "../../lib/settings";
import { listOsuSkins, type SkinMetadata } from "../../lib/native";

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
  const [skins, setSkins] = useState<SkinMetadata[]>([]);
  const [isLoadingSkins, setIsLoadingSkins] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void refreshSkins();
    }
  }, [isOpen]);

  async function refreshSkins(): Promise<void> {
    setIsLoadingSkins(true);
    try {
      const list = await listOsuSkins();
      setSkins(list);
    } catch (e) {
      console.error("Error al cargar lista de skins:", e);
    } finally {
      setIsLoadingSkins(false);
    }
  }

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
    playStageWidth = 500,
    hitPositionOffset = 40,
    receptorOffset = 0,
    selectedSkinPath = null,
    beatDivisor = 1,
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

                    <button type="button" className="keybinds-edit-btn" onClick={onOpenKeybinds}>
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
                      min={SETTINGS_LIMITS.playOffsetMs.min}
                      max={SETTINGS_LIMITS.playOffsetMs.max}
                      step={SETTINGS_LIMITS.playOffsetMs.step}
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
                    min={SETTINGS_LIMITS.comboPositionPercent.min}
                    max={SETTINGS_LIMITS.comboPositionPercent.max}
                    step={SETTINGS_LIMITS.comboPositionPercent.step}
                    value={comboPositionPercent}
                    onChange={(e) => update("comboPositionPercent", Number(e.target.value))}
                    className="settings-slider"
                  />
                </div>

                <div className="settings-item">
                  <div className="settings-item-info">
                    <div className="settings-item-label-group">
                      <span className="settings-item-label">Ancho del Playfield</span>
                      <span className="settings-item-hint">
                        Ancho total del escenario en Modo Play (320px compacto, 800px ancho)
                      </span>
                    </div>
                    <span className="settings-item-value mono">{playStageWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={SETTINGS_LIMITS.playStageWidth.min}
                    max={SETTINGS_LIMITS.playStageWidth.max}
                    step={SETTINGS_LIMITS.playStageWidth.step}
                    value={playStageWidth}
                    onChange={(e) => update("playStageWidth", Number(e.target.value))}
                    className="settings-slider"
                  />
                </div>

                <div className="settings-item">
                  <div className="settings-item-info">
                    <div className="settings-item-label-group">
                      <span className="settings-item-label">
                        Posición de Línea de Juicio (Hit Position)
                      </span>
                      <span className="settings-item-hint">
                        Altura de la línea de golpe lógica desde el borde inferior
                      </span>
                    </div>
                    <span className="settings-item-value mono">{hitPositionOffset}px</span>
                  </div>
                  <input
                    type="range"
                    min={SETTINGS_LIMITS.hitPositionOffset.min}
                    max={SETTINGS_LIMITS.hitPositionOffset.max}
                    step={SETTINGS_LIMITS.hitPositionOffset.step}
                    value={hitPositionOffset}
                    onChange={(e) => update("hitPositionOffset", Number(e.target.value))}
                    className="settings-slider"
                  />
                </div>

                <div className="settings-item">
                  <div className="settings-item-info">
                    <div className="settings-item-label-group">
                      <span className="settings-item-label">
                        Alineación de Receptores (Receptor Offset)
                      </span>
                      <span className="settings-item-hint">
                        Desplaza verticalmente los sprites de los receptores de tu skin
                      </span>
                    </div>
                    <span className="settings-item-value mono">
                      {receptorOffset > 0 ? `+${receptorOffset}` : receptorOffset}px
                    </span>
                  </div>
                  <div className="settings-slider-wrapper">
                    <input
                      type="range"
                      min={SETTINGS_LIMITS.receptorOffset.min}
                      max={SETTINGS_LIMITS.receptorOffset.max}
                      step={SETTINGS_LIMITS.receptorOffset.step}
                      value={receptorOffset}
                      onChange={(e) => update("receptorOffset", Number(e.target.value))}
                      className="settings-slider"
                    />
                    {receptorOffset !== 0 && (
                      <button
                        type="button"
                        className="preset-action-btn"
                        onClick={() => update("receptorOffset", 0)}
                        title="Restablecer alineación a 0 px"
                      >
                        <Clock size={13} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="settings-item settings-item--row">
                  <div className="settings-item-label-group">
                    <span className="settings-item-label">Divisor de líneas guía (editor)</span>
                    <span className="settings-item-hint">
                      Líneas por beat en la preview del editor (1/1 = beats y medidas)
                    </span>
                  </div>
                  <select
                    className="settings-select"
                    value={beatDivisor}
                    onChange={(e) => update("beatDivisor", Number(e.target.value))}
                    aria-label="Divisor de líneas guía"
                  >
                    {BEAT_DIVISORS.map((divisor) => (
                      <option key={divisor} value={divisor}>
                        {divisor === 1 ? "1/1" : `1/${divisor}`}
                      </option>
                    ))}
                  </select>
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

                <div className="settings-item settings-item--row">
                  <div className="settings-item-label-group">
                    <span className="settings-item-label">Barra de precisión (Hit Error)</span>
                    <span className="settings-item-hint">
                      Muestra desvíos early/late debajo del combo al pulsar teclas
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch${settings.playShowHitError !== false ? " is-active" : ""}`}
                    onClick={() => update("playShowHitError", settings.playShowHitError === false)}
                    aria-pressed={settings.playShowHitError !== false}
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
                    <span className="settings-item-value mono">
                      {(scrollSpeed / 10).toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={SETTINGS_LIMITS.scrollSpeed.min}
                    max={SETTINGS_LIMITS.scrollSpeed.max}
                    step={SETTINGS_LIMITS.scrollSpeed.step}
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
                    min={SETTINGS_LIMITS.noteHeight.min}
                    max={SETTINGS_LIMITS.noteHeight.max}
                    step={SETTINGS_LIMITS.noteHeight.step}
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
                    min={SETTINGS_LIMITS.backdropDim.min}
                    max={SETTINGS_LIMITS.backdropDim.max}
                    step={SETTINGS_LIMITS.backdropDim.step}
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

              <section className="settings-group">
                <div className="settings-group-header">
                  <Palette size={16} className="text-accent" />
                  <h3>Skin de osu! (skin.ini)</h3>
                </div>

                <div className="settings-item">
                  <div className="settings-item-info">
                    <div className="settings-item-label-group">
                      <span className="settings-item-label">Skin Activa</span>
                      <span className="settings-item-hint">
                        Renderiza notas, receptores y juicios oficiales de tu skin
                      </span>
                    </div>
                    <button
                      type="button"
                      className="preset-action-btn"
                      onClick={() => void refreshSkins()}
                      title="Recargar skins instaladas"
                      disabled={isLoadingSkins}
                    >
                      <RefreshCw size={13} className={isLoadingSkins ? "animate-spin" : ""} />
                    </button>
                  </div>

                  <select
                    className="settings-select"
                    value={selectedSkinPath ?? ""}
                    onChange={(e) => update("selectedSkinPath", e.target.value || null)}
                  >
                    <option value="">Nativo / Predeterminado (Vectorial)</option>
                    {skins.map((skin) => (
                      <option key={skin.folder_path} value={skin.folder_path}>
                        {skin.name} {skin.author ? `(por ${skin.author})` : ""}
                      </option>
                    ))}
                  </select>
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
                    min={SETTINGS_LIMITS.volume.min}
                    max={SETTINGS_LIMITS.volume.max}
                    step={SETTINGS_LIMITS.volume.step}
                    value={volume}
                    onChange={(e) => update("volume", Number(e.target.value))}
                    onWheel={(e) => {
                      const dir = e.deltaY < 0 ? 1 : -1;
                      let next = volume + dir * 5;
                      next = Math.max(
                        SETTINGS_LIMITS.volume.min,
                        Math.min(SETTINGS_LIMITS.volume.max, next),
                      );
                      update("volume", next);
                    }}
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
                      <span className="settings-item-value mono">
                        {settings.hitsoundVolume ?? SETTINGS_LIMITS.hitsoundVolume.default}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={SETTINGS_LIMITS.hitsoundVolume.min}
                      max={SETTINGS_LIMITS.hitsoundVolume.max}
                      step={SETTINGS_LIMITS.hitsoundVolume.step}
                      value={settings.hitsoundVolume ?? SETTINGS_LIMITS.hitsoundVolume.default}
                      onChange={(e) => update("hitsoundVolume", Number(e.target.value))}
                      onWheel={(e) => {
                        const dir = e.deltaY < 0 ? 1 : -1;
                        const current =
                          settings.hitsoundVolume ?? SETTINGS_LIMITS.hitsoundVolume.default;
                        let next = current + dir * 5;
                        next = Math.max(
                          SETTINGS_LIMITS.hitsoundVolume.min,
                          Math.min(SETTINGS_LIMITS.hitsoundVolume.max, next),
                        );
                        update("hitsoundVolume", next);
                      }}
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
