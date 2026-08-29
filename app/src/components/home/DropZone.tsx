import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { ArrowUpRight, FileUp, UploadCloud } from "lucide-react";

interface DropZoneProps {
  onOpenFilePicker: () => void;
  onFileSelected: (file: File) => void;
}

export function DropZone({ onOpenFilePicker, onFileSelected }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  }

  function handleDragOver(e: DragEvent<HTMLElement>): void {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(): void {
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLElement>): void {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  }

  return (
    <aside
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`home-side-hub ${isDragging ? "is-dragging" : ""}`}
    >
      <div className="home-hub-inner">
        {/* Zona de Drop Interactiva */}
        <div className="home-hub-drop-target">
          <span
            className={`home-hub-icon-gem ${
              isDragging ? "is-pulsing" : ""
            }`}
          >
            {isDragging ? <UploadCloud size={28} /> : <FileUp size={28} />}
          </span>

          <div className="home-hub-text-block">
            <h2 className="home-hub-title">Arrastra tu beatmap .osu</h2>
            <p className="home-hub-desc">
              Arrastra un archivo aquí o búscalo en tu explorador de archivos.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenFilePicker}
            className="home-hub-browse-btn"
          >
            <span>Explorar archivos</span>
            <ArrowUpRight size={15} />
          </button>
        </div>

        {/* Info y Ayuda Rápida */}
        <div className="home-hub-footer-tips">
          <div className="home-hub-tip-item">
            <span className="home-hub-tip-dot">•</span>
            <span>Divide secciones para cambiar el patron de mapeo con Ctrl + B</span>
          </div>
          <div className="home-hub-tip-item">
            <span className="home-hub-tip-dot">•</span>
            <span>Compara la conversion 4K ⇄ 7K con Tab</span>
          </div>
          <div className="home-hub-tip-item">
            <span className="home-hub-tip-dot">•</span>
            <span>Soporta hitsounds y autoplay</span>
          </div>
          <div className="home-hub-tip-item">
            <span className="home-hub-tip-dot">•</span>
            <span>Carga skins personalizadas para mejorar la preview</span>
          </div>
          <div className="home-hub-tip-item">
            <span className="home-hub-tip-dot">•</span>
            <span>Exporta directo a tu carpeta Songs</span>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".osu"
          className="visually-hidden"
          onChange={handleInputChange}
        />
      </div>
    </aside>
  );
}
