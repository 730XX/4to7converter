import { useEffect, useState } from "react";
import { Gamepad2, RotateCcw, Save, X } from "lucide-react";
import { DEFAULT_KEYBINDS_7K, formatKeyCode } from "../lib/settings";

interface KeybindsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentKeybinds: string[];
  onSave: (newKeybinds: string[]) => void;
}

/** Colores visuales de los carriles en 7K para dar contexto arcade al modal */
const LANE_COLORS_7K = [
  { name: "C1", label: "Carril 1", color: "#ffffff", border: "rgba(255, 255, 255, 0.4)" },
  { name: "C2", label: "Carril 2", color: "#f7b7d2", border: "rgba(247, 183, 210, 0.5)" },
  { name: "C3", label: "Carril 3", color: "#ffffff", border: "rgba(255, 255, 255, 0.4)" },
  { name: "C4", label: "Centro (Space)", color: "#ffd700", border: "rgba(255, 215, 0, 0.6)" },
  { name: "C5", label: "Carril 5", color: "#ffffff", border: "rgba(255, 255, 255, 0.4)" },
  { name: "C6", label: "Carril 6", color: "#f7b7d2", border: "rgba(247, 183, 210, 0.5)" },
  { name: "C7", label: "Carril 7", color: "#ffffff", border: "rgba(255, 255, 255, 0.4)" },
];

export function KeybindsModal({
  isOpen,
  onClose,
  currentKeybinds,
  onSave,
}: KeybindsModalProps) {
  const [keybinds, setKeybinds] = useState<string[]>(
    currentKeybinds && currentKeybinds.length === 7 ? [...currentKeybinds] : [...DEFAULT_KEYBINDS_7K],
  );
  const [listeningIndex, setListeningIndex] = useState<number | null>(null);

  // Sincronizar cuando se abre
  useEffect(() => {
    if (isOpen) {
      setKeybinds(
        currentKeybinds && currentKeybinds.length === 7
          ? [...currentKeybinds]
          : [...DEFAULT_KEYBINDS_7K],
      );
      setListeningIndex(null);
    }
  }, [isOpen, currentKeybinds]);

  // Listener global de teclado para capturar la tecla cuando hay un slot en escucha
  useEffect(() => {
    if (!isOpen || listeningIndex === null) return;

    function handleKeyDown(event: KeyboardEvent): void {
      event.preventDefault();
      event.stopPropagation();

      if (event.code === "Escape") {
        setListeningIndex(null);
        return;
      }

      // Teclas no permitidas como keybinds
      if (["Tab", "F5", "F11", "F12"].includes(event.code)) {
        return;
      }

      const newKey = event.code;
      setKeybinds((prev) => {
        const next = [...prev];
        next[listeningIndex!] = newKey;
        return next;
      });

      // Pasar automáticamente al siguiente carril si no es el último, o cerrar escucha
      if (listeningIndex! < 6) {
        setListeningIndex(listeningIndex! + 1);
      } else {
        setListeningIndex(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, listeningIndex]);

  if (!isOpen) return null;

  function handleResetDefault(): void {
    setKeybinds([...DEFAULT_KEYBINDS_7K]);
    setListeningIndex(null);
  }

  function handleSave(): void {
    onSave(keybinds);
    onClose();
  }

  return (
    <div className="file-modal-overlay" onClick={onClose}>
      <div
        className="keybinds-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keybinds-modal-title"
      >
        <header className="keybinds-modal-header">
          <div className="keybinds-modal-title-group">
            <Gamepad2 size={22} className="text-accent" />
            <div>
              <h2 id="keybinds-modal-title">Configurar Keybinds (7K)</h2>
              <p className="keybinds-modal-subtitle">
                Haz clic en cualquier carril para asignar tu tecla preferida
              </p>
            </div>
          </div>
          <button
            type="button"
            className="settings-close-btn"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </header>

        <div className="keybinds-modal-body">
          <div className="keybinds-grid">
            {keybinds.map((code, idx) => {
              const laneInfo = LANE_COLORS_7K[idx] ?? {
                name: `C${idx + 1}`,
                label: `Carril ${idx + 1}`,
                color: "#ffffff",
                border: "rgba(255, 255, 255, 0.4)",
              };
              const isListening = listeningIndex === idx;

              return (
                <div
                  key={idx}
                  className={`keybind-card${isListening ? " is-listening" : ""}${
                    idx === 3 ? " is-center" : ""
                  }`}
                  onClick={() => setListeningIndex(isListening ? null : idx)}
                  style={{
                    borderColor: isListening ? "var(--color-accent-strong)" : laneInfo.border,
                  }}
                >
                  <div className="keybind-card-header">
                    <span
                      className="keybind-lane-pill mono"
                      style={{ color: laneInfo.color, borderColor: laneInfo.border }}
                    >
                      {laneInfo.name}
                    </span>
                    <span className="keybind-lane-label">{laneInfo.label}</span>
                  </div>

                  <div className="keybind-key-box mono">
                    {isListening ? (
                      <span className="keybind-pulse-text">Pulsa...</span>
                    ) : (
                      <span className="keybind-key-value">{formatKeyCode(code)}</span>
                    )}
                  </div>

                  <span className="keybind-hint">
                    {isListening ? "Esc para cancelar" : "Clic para cambiar"}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="keybinds-preset-info">
            <span>Disposición clásica recomendada: </span>
            <span className="mono text-accent">S · D · F · [SPACE] · J · K · L</span>
          </div>
        </div>

        <footer className="keybinds-modal-footer">
          <button
            type="button"
            className="keybinds-btn keybinds-btn--secondary"
            onClick={handleResetDefault}
          >
            <RotateCcw size={15} />
            <span>Por Defecto</span>
          </button>

          <div className="keybinds-modal-actions">
            <button
              type="button"
              className="keybinds-btn keybinds-btn--cancel"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="keybinds-btn keybinds-btn--save primary-button"
              onClick={handleSave}
            >
              <Save size={16} />
              <span>Guardar Keybinds</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
