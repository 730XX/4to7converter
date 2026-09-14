import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

/** Metadata editable del beatmap 7K antes de exportarlo. */
export interface ExportMetadata {
  title: string;
  artist: string;
  creator: string;
  version: string;
  overallDifficulty: number;
  hpDrainRate: number;
  previewTime: number;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (metadata: ExportMetadata) => void;
  /** Valores por defecto derivados del mapa cargado. */
  defaults: ExportMetadata;
}

/** Quita caracteres inválidos para el nombre de archivo. */
function sanitizeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "").trim();
}

/**
 * Modal de exportación: permite editar la metadata del beatmap 7K
 * (título, artista, creador, dificultad, OD, HP y PreviewTime) antes de guardarlo.
 */
export function ExportModal({ isOpen, onClose, onConfirm, defaults }: ExportModalProps) {
  const [title, setTitle] = useState(defaults.title);
  const [artist, setArtist] = useState(defaults.artist);
  const [creator, setCreator] = useState(defaults.creator);
  const [version, setVersion] = useState(defaults.version);
  const [od, setOd] = useState(String(defaults.overallDifficulty));
  const [hp, setHp] = useState(String(defaults.hpDrainRate));
  const [previewTime, setPreviewTime] = useState(String(defaults.previewTime));

  // Reiniciar el borrador con los valores por defecto cada vez que se abre.
  useEffect(() => {
    if (!isOpen) return;
    setTitle(defaults.title);
    setArtist(defaults.artist);
    setCreator(defaults.creator);
    setVersion(defaults.version);
    setOd(String(defaults.overallDifficulty));
    setHp(String(defaults.hpDrainRate));
    setPreviewTime(String(defaults.previewTime));
  }, [isOpen, defaults]);

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

  if (!isOpen) return null;

  const trimmedTitle = title.trim();
  const trimmedArtist = artist.trim();
  const trimmedCreator = creator.trim();
  const trimmedVersion = version.trim();
  const parsedOd = Number.parseFloat(od);
  const parsedHp = Number.parseFloat(hp);
  const parsedPreview = Number.parseInt(previewTime, 10);

  const isOdValid = Number.isFinite(parsedOd) && parsedOd >= 0 && parsedOd <= 10;
  const isHpValid = Number.isFinite(parsedHp) && parsedHp >= 0 && parsedHp <= 10;
  const isPreviewValid = Number.isFinite(parsedPreview) && parsedPreview >= -1;
  const isValid =
    trimmedTitle.length > 0 && trimmedArtist.length > 0 && isOdValid && isHpValid && isPreviewValid;

  const filename = `${sanitizeFilenamePart(trimmedArtist || "Artist")} - ${sanitizeFilenamePart(
    trimmedTitle || "Title",
  )} (${sanitizeFilenamePart(trimmedCreator || "Creator")}) [${sanitizeFilenamePart(
    trimmedVersion || "7K",
  )}].osu`;

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    if (!isValid) return;
    onConfirm({
      title: trimmedTitle,
      artist: trimmedArtist,
      creator: trimmedCreator,
      version: trimmedVersion,
      overallDifficulty: parsedOd,
      hpDrainRate: parsedHp,
      previewTime: parsedPreview,
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-dialog export-modal-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        <header className="modal-header">
          <div className="modal-title-wrap">
            <Download size={18} className="text-accent" />
            <h3 id="export-modal-title">Exportar mapa 7K</h3>
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
            <label htmlFor="export-title" className="modal-label">
              Título
            </label>
            <input
              id="export-title"
              type="text"
              className="modal-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="modal-field">
            <label htmlFor="export-artist" className="modal-label">
              Artista
            </label>
            <input
              id="export-artist"
              type="text"
              className="modal-input"
              value={artist}
              onChange={(event) => setArtist(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="modal-field-row">
            <div className="modal-field">
              <label htmlFor="export-creator" className="modal-label">
                Creador
              </label>
              <input
                id="export-creator"
                type="text"
                className="modal-input"
                value={creator}
                onChange={(event) => setCreator(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="modal-field">
              <label htmlFor="export-version" className="modal-label">
                Dificultad
              </label>
              <input
                id="export-version"
                type="text"
                className="modal-input"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="modal-field-row">
            <div className="modal-field">
              <label htmlFor="export-od" className="modal-label">
                OD (0-10)
              </label>
              <input
                id="export-od"
                type="number"
                min={0}
                max={10}
                step={0.1}
                className="modal-input"
                value={od}
                onChange={(event) => setOd(event.target.value)}
              />
            </div>
            <div className="modal-field">
              <label htmlFor="export-hp" className="modal-label">
                HP (0-10)
              </label>
              <input
                id="export-hp"
                type="number"
                min={0}
                max={10}
                step={0.1}
                className="modal-input"
                value={hp}
                onChange={(event) => setHp(event.target.value)}
              />
            </div>
          </div>

          <div className="modal-field">
            <label htmlFor="export-preview" className="modal-label">
              PreviewTime (ms, -1 = sin preview)
            </label>
            <input
              id="export-preview"
              type="number"
              step={1}
              className="modal-input"
              value={previewTime}
              onChange={(event) => setPreviewTime(event.target.value)}
            />
          </div>

          {!isValid && (
            <p className="modal-warning-hint">
              [AVISO] Título y artista son obligatorios; OD y HP deben estar entre 0 y 10;
              PreviewTime debe ser -1 o mayor.
            </p>
          )}

          <div className="modal-field export-filename-preview">
            <span className="modal-label">Nombre de archivo</span>
            <span className="export-filename-value mono">{filename}</span>
          </div>

          <footer className="modal-footer">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={!isValid}>
              <Download size={15} />
              <span>Exportar</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
