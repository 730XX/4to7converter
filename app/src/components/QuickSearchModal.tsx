import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, X, CornerDownLeft, Layers } from "lucide-react";
import { searchBeatmaps, type BeatmapSearchItem } from "../lib/native";

interface QuickSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBeatmap: (path: string) => void;
  currentBeatmapPath?: string | null;
}

/**
 * Modal flotante de búsqueda rápida estilo PowerToys Run / Spotlight.
 * Agrupa los resultados por Mapset / Canción para máxima velocidad y claridad.
 */
export function QuickSearchModal({
  isOpen,
  onClose,
  onSelectBeatmap,
  currentBeatmapPath,
}: QuickSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BeatmapSearchItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const [isClosing, setIsClosing] = useState(false);
  const [renderedOpen, setRenderedOpen] = useState(isOpen);
  const closeTimeoutRef = useRef<number | null>(null);

  // Manejo de montaje / desmontaje animado
  useEffect(() => {
    if (isOpen) {
      if (closeTimeoutRef.current !== null) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      setRenderedOpen(true);
      setIsClosing(false);
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 40);
    } else if (renderedOpen && !isClosing) {
      setIsClosing(true);
      closeTimeoutRef.current = window.setTimeout(() => {
        setRenderedOpen(false);
        setIsClosing(false);
        closeTimeoutRef.current = null;
      }, 140);
    }
  }, [isOpen, renderedOpen, isClosing]);

  function handleRequestClose(): void {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      onClose();
      setIsClosing(false);
      setRenderedOpen(false);
      closeTimeoutRef.current = null;
    }, 140);
  }

  // Búsqueda con debounce para fluidez total al escribir
  useEffect(() => {
    if (!renderedOpen || isClosing) return;

    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }

    const cleanQuery = query.trim();
    if (!cleanQuery) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceTimerRef.current = window.setTimeout(async () => {
      try {
        const found = await searchBeatmaps(cleanQuery, currentBeatmapPath);
        setResults(found);
        setSelectedIndex(0);
      } catch (err) {
        console.error("Error en búsqueda rápida:", err);
      } finally {
        setIsLoading(false);
      }
    }, 30);

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, renderedOpen, isClosing, currentBeatmapPath]);

  // Manejo de teclado (Flechas, Enter, Escape)
  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      handleRequestClose();
      return;
    }

    if (results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => {
        const next = prev < results.length - 1 ? prev + 1 : 0;
        scrollToItem(next);
        return next;
      });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : results.length - 1;
        scrollToItem(next);
        return next;
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = results[selectedIndex];
      if (selected) {
        onSelectBeatmap(selected.path);
        handleRequestClose();
      }
    }
  }

  function scrollToItem(index: number): void {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[index] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  if (!renderedOpen) {
    return null;
  }

  const closingClass = isClosing ? " is-closing" : "";

  return (
    <div
      className={`quick-search-overlay${closingClass}`}
      onClick={handleRequestClose}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        className={`quick-search-dialog${closingClass}`}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda rápida de beatmaps"
      >
        {/* Barra de Búsqueda Superior */}
        <div className="quick-search-bar">
          <Search size={20} className="quick-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="quick-search-input"
            placeholder="Buscar por canción, pack, artista o creador..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {isLoading ? (
            <div className="quick-search-spinner" />
          ) : query ? (
            <button
              type="button"
              className="quick-search-clear-btn"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              title="Borrar búsqueda"
            >
              <X size={16} />
            </button>
          ) : (
            <div className="quick-search-shortcut-badge">
              <kbd className="mono">ESC</kbd>
            </div>
          )}
        </div>

        {/* Lista de Resultados Agrupados por Mapset */}
        <div
          className="quick-search-results"
          ref={listRef}
          onWheel={(e) => e.stopPropagation()}
        >
          {results.length > 0 ? (
            results.map((item, index) => {
              const isSelected = index === selectedIndex;
              const titleDisplay = item.title || item.folder_name || "Sin título";

              return (
                <div
                  key={`${item.path}-${index}`}
                  className={`quick-search-card${isSelected ? " is-selected" : ""}`}
                  onClick={() => {
                    onSelectBeatmap(item.path);
                    handleRequestClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="quick-search-card-left">
                    <div className="quick-search-card-avatar is-mania">
                      <Layers size={18} />
                    </div>
                    <div className="quick-search-card-details">
                      <div className="quick-search-card-title-row">
                        <span className="quick-search-card-title" title={titleDisplay}>
                          {titleDisplay}
                        </span>
                        {item.artist && (
                          <span className="quick-search-card-artist" title={item.artist}>
                            {item.artist}
                          </span>
                        )}
                      </div>
                      <div className="quick-search-card-sub-row">
                        <span className="quick-search-card-diff">
                          {item.diff_count} {item.diff_count === 1 ? "dificultad" : "dificultades"}
                        </span>
                        {item.creator && (
                          <span className="quick-search-card-creator">
                            • mapeado por {item.creator}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="quick-search-card-right">
                    <div className="quick-search-modes-group">
                      {item.key_modes.map((mode) => (
                        <span
                          key={mode}
                          className={`quick-search-key-badge ${
                            mode === "4K" ? "is-4k" : mode === "7K" ? "is-7k" : ""
                          }`}
                        >
                          {mode}
                        </span>
                      ))}
                    </div>
                    {isSelected && (
                      <div className="quick-search-select-hint">
                        <CornerDownLeft size={14} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : query.trim() && !isLoading ? (
            <div className="quick-search-empty">
              <Sparkles size={24} className="text-muted" />
              <p>No se encontraron paquetes o canciones que coincidan con "{query}"</p>
            </div>
          ) : (
            <div className="quick-search-hint-footer">
              <div className="quick-search-hint-item">
                <kbd className="mono">↑</kbd> <kbd className="mono">↓</kbd> Navegar
              </div>
              <div className="quick-search-hint-item">
                <kbd className="mono">Enter</kbd> Cargar mapa
              </div>
              <div className="quick-search-hint-item">
                <kbd className="mono">Esc</kbd> Cerrar
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
