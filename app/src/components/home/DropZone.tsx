import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { FileMusic, UploadCloud } from "lucide-react";

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
    <section
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`glass-panel home-dropzone ${isDragging ? "is-dragging" : ""}`}
    >
      <div className="home-dropzone-glow bg-neon-gradient" />
      <div className="home-dropzone-inner">
        <div className="home-dropzone-left">
          <div className="home-dropzone-icon-row">
            <span
              className={`home-dropzone-icon-box bg-neon-gradient ${
                isDragging ? "is-bouncing" : ""
              }`}
            >
              {isDragging ? <UploadCloud size={24} /> : <FileMusic size={24} />}
            </span>
          </div>

          <div className="home-dropzone-text-group">
            <h1 className="home-dropzone-title">Arrastra tu archivo .osu aquí</h1>
            <p className="home-dropzone-desc">
              Convierte beatmaps de 4K a 7K con mapeo por tramos, hitsounds y autoplay en vivo.
            </p>
          </div>
        </div>

        <div className="home-dropzone-actions">
          <button
            type="button"
            onClick={onOpenFilePicker}
            className="home-dropzone-browse-btn"
          >
            Explorar archivos (.osu)
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".osu"
          className="visually-hidden"
          onChange={handleInputChange}
        />
      </div>
    </section>
  );
}
