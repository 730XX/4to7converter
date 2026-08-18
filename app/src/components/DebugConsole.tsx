import { useEffect, useRef, useState } from "react";
import { Bug, Check, Copy, ChevronDown, ChevronUp, Trash2, Terminal, X } from "lucide-react";
import { appLogger, type LogEntry } from "../lib/logger";

/**
 * Consola de Debugging integrada directamente en la aplicación.
 * Permite monitorear llamadas nativas de Rust, detección de osu!, errores y eventos en tiempo real.
 */
export function DebugConsole() {
  const [isVisible, setIsVisible] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<string>("");
  const endRef = useRef<HTMLDivElement | null>(null);

  // Escuchar atajo secreto Ctrl + Shift + D para habilitar/deshabilitar la consola
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setIsVisible((prev) => {
          const next = !prev;
          if (next) {
            setIsOpen(true);
          }
          return next;
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return appLogger.subscribe((nextLogs) => {
      setLogs(nextLogs);
    });
  }, []);

  useEffect(() => {
    if (isVisible && isOpen) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isOpen, isVisible]);

  function handleCopy(): void {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.source ?? "App"}] [${l.level.toUpperCase()}] ${l.message}`)
      .join("\n");
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filteredLogs = logs.filter(
    (l) =>
      l.message.toLowerCase().includes(filter.toLowerCase()) ||
      (l.source && l.source.toLowerCase().includes(filter.toLowerCase())),
  );

  if (!isVisible) {
    return null;
  }

  return (
    <div className={`debug-console-wrapper${isOpen ? " is-open" : ""}`}>
      {/* Botón flotante para abrir/cerrar consola */}
      <button
        type="button"
        className="debug-console-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Abrir consola de debug in-app"
      >
        <Bug size={14} />
        <span>Debug Logs ({logs.length})</span>
        {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {/* Panel de consola flotante */}
      {isOpen && (
        <div className="debug-console-panel">
          <header className="debug-console-header">
            <div className="debug-console-title">
              <Terminal size={15} />
              <span>Consola de Debug Integrada</span>
              <span className="debug-badge mono">{filteredLogs.length} eventos</span>
            </div>

            <div className="debug-console-actions">
              <input
                type="text"
                className="debug-filter-input"
                placeholder="Filtrar logs..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <button
                type="button"
                className="debug-btn"
                onClick={handleCopy}
                title="Copiar todos los logs"
              >
                {copied ? <Check size={13} color="#22c55e" /> : <Copy size={13} />}
                <span>{copied ? "Copiado" : "Copiar"}</span>
              </button>
              <button
                type="button"
                className="debug-btn"
                onClick={() => appLogger.clear()}
                title="Limpiar logs"
              >
                <Trash2 size={13} />
                <span>Limpiar</span>
              </button>
              <button
                type="button"
                className="debug-btn debug-btn--close"
                onClick={() => setIsOpen(false)}
                title="Cerrar consola y volver a la app"
                aria-label="Cerrar consola"
              >
                <X size={15} />
              </button>
            </div>
          </header>

          <div className="debug-console-body mono">
            {filteredLogs.length === 0 ? (
              <div className="debug-empty">No hay logs registrados aún...</div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className={`debug-log-row debug-log-row--${log.level}`}>
                  <span className="debug-log-time">{log.timestamp}</span>
                  <span className="debug-log-source">[{log.source ?? "App"}]</span>
                  <span className="debug-log-msg">{log.message}</span>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>
        </div>
      )}
    </div>
  );
}
