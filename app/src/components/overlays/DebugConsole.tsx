import { useEffect, useRef, useState } from "react";
import { Bug, Check, Copy, ChevronDown, ChevronUp, Trash2, Terminal, X } from "lucide-react";
import { appLogger, type LogEntry } from "../../lib/logger";

/**
 * Consola de Debugging integrada directamente en la aplicación.
 * Permite monitorear llamadas nativas de Rust, detección de osu!, errores y eventos en tiempo real.
 */
function useFps(enabled: boolean) {
  const [fpsData, setFpsData] = useState({ fps: 60, avgFps: 60, frameTime: 16.6, minFps: 60 });
  const frameCountRef = useRef(0);
  const totalFramesRef = useRef(0);
  const startTimeRef = useRef(performance.now());
  const lastTimeRef = useRef(performance.now());
  const lastUpdateRef = useRef(performance.now());
  const frameTimesRef = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let animId: number;
    const loop = (now: number) => {
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;
      frameCountRef.current++;
      totalFramesRef.current++;
      if (delta > 0) {
        frameTimesRef.current.push(delta);
        if (frameTimesRef.current.length > 60) frameTimesRef.current.shift();
      }

      // Actualizar métricas cada 250ms para no saturar renders
      if (now - lastUpdateRef.current >= 250) {
        const elapsed = (now - lastUpdateRef.current) / 1000;
        const currentFps = Math.round(frameCountRef.current / elapsed);
        const totalElapsed = (now - startTimeRef.current) / 1000;
        const avgFps = totalElapsed > 0.5 ? Math.round(totalFramesRef.current / totalElapsed) : currentFps;

        const avgFrameTime =
          frameTimesRef.current.length > 0
            ? frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length
            : 16.6;
        const worstDelta = Math.max(...frameTimesRef.current, 16.6);
        const minFps = Math.max(1, Math.round(1000 / worstDelta));

        setFpsData({
          fps: currentFps,
          avgFps,
          frameTime: Number(avgFrameTime.toFixed(1)),
          minFps: Math.min(currentFps, minFps),
        });

        frameCountRef.current = 0;
        lastUpdateRef.current = now;
      }

      animId = requestAnimationFrame(loop);
    };

    const now = performance.now();
    startTimeRef.current = now;
    lastTimeRef.current = now;
    lastUpdateRef.current = now;
    frameCountRef.current = 0;
    totalFramesRef.current = 0;
    frameTimesRef.current = [];
    animId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animId);
  }, [enabled]);

  return fpsData;
}

export function DebugConsole() {
  const [isVisible, setIsVisible] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<string>("");
  const endRef = useRef<HTMLDivElement | null>(null);

  // Monitoreo de FPS solo cuando el modo debug está activo
  const { fps, avgFps, frameTime, minFps } = useFps(isVisible);

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

  const fpsColor =
    fps >= 55 ? "#22c55e" : fps >= 30 ? "#eab308" : "#ef4444";

  return (
    <div className={`debug-console-wrapper${isOpen ? " is-open" : ""}`}>
      {/* Botón flotante para abrir/cerrar consola */}
      <button
        type="button"
        className="debug-console-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Abrir consola de debug in-app (Ctrl + Shift + D para ocultar)"
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            fontFamily: "monospace",
            fontWeight: 800,
            fontSize: "0.82rem",
            color: fpsColor,
          }}
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: fpsColor,
              boxShadow: `0 0 6px ${fpsColor}`,
            }}
          />
          {fps} FPS <span style={{ opacity: 0.7, fontWeight: 500, fontSize: "0.72rem" }}>(avg {avgFps})</span>
        </span>
        <span style={{ opacity: 0.4 }}>|</span>
        <span style={{ fontSize: "0.72rem", opacity: 0.85, fontFamily: "monospace" }}>{frameTime}ms</span>
        <span style={{ opacity: 0.4 }}>|</span>
        <Bug size={13} />
        <span>Logs ({logs.length})</span>
        {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {/* Panel de consola flotante */}
      {isOpen && (
        <div className="debug-console-panel">
          <header className="debug-console-header">
            <div className="debug-console-title">
              <Terminal size={15} />
              <span>Consola de Debug</span>
              <span
                className="debug-badge mono"
                style={{
                  color: fpsColor,
                  borderColor: `${fpsColor}44`,
                  background: `${fpsColor}15`,
                  fontWeight: 700,
                }}
              >
                {fps} FPS • Avg: {avgFps} • Min: {minFps} • {frameTime}ms
              </span>
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
