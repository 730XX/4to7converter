import { useEffect, useRef, useState } from "react";
import { Check, CornerDownLeft } from "lucide-react";
import type { BeatmapDiffItem } from "../../lib/native";

interface QuickDiffSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  difficulties: BeatmapDiffItem[];
  currentPath: string | null;
  onSelectDifficulty: (path: string) => void;
}

/**
 * Modal flotante de cambio rápido de dificultad (Ctrl + Tab / Quick Diff Switcher).
 * Permite ciclar con Tab/Flechas y confirmar con Enter o al soltar Ctrl.
 */
export function QuickDiffSwitcherModal({
  isOpen,
  onClose,
  difficulties,
  currentPath,
  onSelectDifficulty,
}: QuickDiffSwitcherModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Inicializar el índice seleccionado en la dificultad actual
  useEffect(() => {
    if (isOpen && difficulties.length > 0) {
      const currentIndex = difficulties.findIndex((d) => d.path === currentPath);
      // Si se abre con Ctrl+Tab, saltar automáticamente a la siguiente dificultad
      const nextIndex = currentIndex !== -1 ? (currentIndex + 1) % difficulties.length : 0;
      setSelectedIndex(nextIndex);
    }
  }, [isOpen, difficulties, currentPath]);

  // Scroll automático para mantener el ítem seleccionado visible
  useEffect(() => {
    if (!isOpen) return;
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex, isOpen]);

  // Manejador de teclado mientras el modal está activo
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (difficulties.length === 0) return;

      // Tab o Flecha Abajo: Siguiente dificultad
      if (e.code === "Tab" || e.key === "Tab" || e.code === "ArrowDown" || e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev + 1) % difficulties.length);
      }
      // Shift+Tab o Flecha Arriba: Dificultad anterior
      else if (e.code === "ArrowUp" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev - 1 + difficulties.length) % difficulties.length);
      }
      // Enter: Confirmar selección
      else if (e.code === "Enter" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const selected = difficulties[selectedIndex];
        if (selected) {
          onSelectDifficulty(selected.path);
          onClose();
        }
      }
    }

    function handleKeyUp(e: KeyboardEvent): void {
      // Al soltar Ctrl, confirmar la dificultad seleccionada (estilo Alt+Tab / Ctrl+Tab de Windows/IDEs)
      if (e.key === "Control" || e.key === "Meta" || e.code === "ControlLeft" || e.code === "ControlRight") {
        e.preventDefault();
        e.stopPropagation();
        const selected = difficulties[selectedIndex];
        if (selected) {
          onSelectDifficulty(selected.path);
          onClose();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
    };
  }, [isOpen, selectedIndex, difficulties, onSelectDifficulty, onClose]);

  if (!isOpen || difficulties.length === 0) {
    return null;
  }

  return (
    <div className="quick-diff-overlay" onClick={onClose}>
      <div
        className="quick-diff-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Selector rápido de dificultades"
      >
        <div className="quick-diff-list" ref={listRef}>
          {difficulties.map((diff, index) => {
            const isSelected = index === selectedIndex;
            const isCurrent = diff.path === currentPath;
            const modeTag = diff.mode === 3 ? `${diff.key_count}K` : "STD";

            return (
              <div
                key={diff.path}
                className={`quick-diff-row${isSelected ? " is-selected" : ""}${isCurrent ? " is-current" : ""}`}
                onClick={() => {
                  onSelectDifficulty(diff.path);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="quick-diff-row-left">
                  <span className="quick-diff-version" title={diff.version}>
                    {diff.version}
                  </span>
                  <span className="quick-diff-mode-tag">
                    ({modeTag})
                  </span>
                </div>

                <div className="quick-diff-row-right">
                  {isCurrent && (
                    <span className="quick-diff-active-indicator" title="Dificultad actual">
                      <Check size={13} />
                    </span>
                  )}
                  {isSelected && (
                    <div className="quick-diff-enter-hint">
                      <CornerDownLeft size={13} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
