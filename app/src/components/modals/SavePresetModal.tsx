import { BookmarkPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface SavePresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  existingNames: readonly string[];
}

/**
 * Modal para guardar el mapeo de carriles actual como preset.
 * Incluye foco automático, validación en tiempo real y detección de sobrescritura.
 */
export function SavePresetModal({
  isOpen,
  onClose,
  onSave,
  existingNames,
}: SavePresetModalProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      // Pequeño timeout para asegurar que el elemento esté montado antes de hacer focus
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (!isOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const trimmedName = name.trim();
  const isValid = trimmedName.length > 0;
  const isOverwriting =
    isValid &&
    existingNames.some(
      (existing) => existing.toLowerCase() === trimmedName.toLowerCase(),
    );

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    if (!isValid) return;
    onSave(trimmedName);
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-dialog preset-modal-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-modal-title"
      >
        <header className="modal-header">
          <div className="modal-title-wrap">
            <BookmarkPlus size={18} className="text-accent" />
            <h3 id="preset-modal-title">Guardar preset actual</h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-field">
            <label htmlFor="preset-name-input" className="modal-label">
              Nombre del preset
            </label>
            <input
              id="preset-name-input"
              ref={inputRef}
              type="text"
              className="modal-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="brakets, stairs, etc"
              maxLength={40}
              autoComplete="off"
            />
            {isOverwriting && (
              <p className="modal-warning-hint">
                [AVISO] Ya existe un preset con este nombre. Se sobrescribirá.
              </p>
            )}
          </div>

          <footer className="modal-footer">
            <button
              type="button"
              className="ghost-button"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={!isValid}
            >
              <BookmarkPlus size={15} />
              <span>Guardar</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
