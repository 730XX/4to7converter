import { Bookmark, BookmarkPlus, ChevronDown, Check, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LanePreset } from "../lib/lane-presets";
import type { LaneMapState } from "../lib/lane-map-state";
import { SavePresetModal } from "./SavePresetModal";

interface PresetSelectorProps {
  presets: readonly LanePreset[];
  currentState: LaneMapState;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  onApply: (preset: LanePreset) => void;
}

/** Compara estructuralmente dos estados de mapeo de carriles. */
function areStatesEqual(a: LaneMapState, b: LaneMapState): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const rowA = a[i] ?? [];
    const rowB = b[i] ?? [];
    if (rowA.length !== rowB.length) return false;
    for (let j = 0; j < rowA.length; j++) {
      if (rowA[j] !== rowB[j]) return false;
    }
  }
  return true;
}

/**
 * Selector compacto y elegante de presets de mapeo para el LaneMapper.
 * Permite seleccionar un preset rápidamente, eliminarlo o abrir la modal para guardar el actual.
 */
export function PresetSelector({
  presets,
  currentState,
  onSave,
  onDelete,
  onApply,
}: PresetSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Determinar si el estado actual coincide exactamente con algún preset guardado
  const activePreset = useMemo(() => {
    return presets.find((preset) => areStatesEqual(preset.laneMapState, currentState)) ?? null;
  }, [presets, currentState]);

  const existingNames = useMemo(() => presets.map((p) => p.name), [presets]);

  // Cerrar dropdown al hacer clic fuera o presionar Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function handleSelectPreset(preset: LanePreset): void {
    onApply(preset);
    setIsOpen(false);
  }

  function handleDeletePreset(event: React.MouseEvent, id: string): void {
    event.stopPropagation();
    onDelete(id);
  }

  return (
    <>
      <div className="preset-selector-bar" ref={containerRef}>
        <div className="preset-dropdown-container">
          <button
            type="button"
            className={`preset-select-trigger${isOpen ? " is-open" : ""}`}
            onClick={() => setIsOpen((prev) => !prev)}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            title="Seleccionar preset de mapeo"
          >
            <Bookmark size={14} className="preset-select-icon" />
            <span className="preset-select-label">
              {activePreset !== null ? activePreset.name : "Presets guardados..."}
            </span>
            {activePreset !== null && (
              <span className="preset-active-tag">Activo</span>
            )}
            <ChevronDown size={14} className={`preset-chevron${isOpen ? " is-rotated" : ""}`} />
          </button>

          {isOpen && (
            <div className="preset-dropdown-menu" role="listbox">
              {presets.length === 0 ? (
                <div className="preset-dropdown-empty">
                  <span>No hay presets guardados</span>
                  <small>Guarda tu configuración actual abajo</small>
                </div>
              ) : (
                <ul className="preset-dropdown-list">
                  {presets.map((preset) => {
                    const isSelected = activePreset?.id === preset.id;
                    return (
                      <li key={preset.id} className="preset-dropdown-item">
                        <button
                          type="button"
                          className={`preset-item-btn${isSelected ? " is-selected" : ""}`}
                          onClick={() => handleSelectPreset(preset)}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <div className="preset-item-name-wrap">
                            {isSelected && <Check size={14} className="preset-check-icon" />}
                            <span className="preset-item-name">{preset.name}</span>
                          </div>
                          <button
                            type="button"
                            className="preset-item-delete-btn"
                            onClick={(event) => handleDeletePreset(event, preset.id)}
                            title={`Eliminar preset ${preset.name}`}
                            aria-label={`Eliminar preset ${preset.name}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="preset-save-btn"
          onClick={() => setIsModalOpen(true)}
          title="Guardar mapeo actual como preset"
        >
          <BookmarkPlus size={14} />
          <span>Guardar preset</span>
        </button>
      </div>

      <SavePresetModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={onSave}
        existingNames={existingNames}
      />
    </>
  );
}
