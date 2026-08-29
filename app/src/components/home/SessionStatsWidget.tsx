import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getLibraryStats, rescanSongsLibrary, type LibraryStats } from "../../lib/native";
import { loadSessionMetrics, type SessionMetrics } from "../../lib/session-stats";

interface SessionStatsWidgetProps {
  onRefreshCompleted?: () => void;
}

export function SessionStatsWidget({ onRefreshCompleted }: SessionStatsWidgetProps) {
  const [metrics, setMetrics] = useState<SessionMetrics>(() => loadSessionMetrics());
  const [library, setLibrary] = useState<LibraryStats>({
    mapsets_count: 0,
    songs_dir: null,
    is_indexed: false,
  });
  const [isRescanning, setIsRescanning] = useState(false);

  useEffect(() => {
    void getLibraryStats().then(setLibrary);

    function onStorage() {
      setMetrics(loadSessionMetrics());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function handleRescan() {
    if (isRescanning) return;
    setIsRescanning(true);
    try {
      const updated = await rescanSongsLibrary();
      setLibrary(updated);
      onRefreshCompleted?.();
    } catch (err) {
      console.error("Error al re-escanear canciones:", err);
    } finally {
      setIsRescanning(false);
    }
  }

  return (
    <div className="home-engine-status-bar">
      <div className="home-engine-left">
        <div className="home-engine-header">
          <div className="home-engine-indicator">
            {/* <span className="status-ping-dot">
              <span className="ping-core" />
            </span> */}
            <span className="home-engine-name mono">Resumen</span>
          </div>

          <button
            type="button"
            onClick={() => void handleRescan()}
            disabled={isRescanning}
            className="home-engine-rescan-btn"
            title="Re-escanear índice en paralelo con Rayon"
          >
            <RefreshCw size={11} className={isRescanning ? "is-spinning" : ""} />
            <span>{isRescanning ? "Sincronizando..." : "Re-escanear"}</span>
          </button>
        </div>

        <div className="home-engine-metrics mono">
          <div className="home-engine-metric-item">
            <span className="metric-val">{library.mapsets_count || "---"}</span>
            <span className="metric-lbl">mapas cargados</span>
          </div>

          <span className="metric-separator">•</span>

          <div className="home-engine-metric-item">
            <span className="metric-val">{metrics.totalConverted}</span>
            <span className="metric-lbl">convertidos</span>
          </div>

          {metrics.totalNotesRemapped > 0 && (
            <>
              <span className="metric-separator">•</span>
              <div className="home-engine-metric-item">
                <span className="metric-val">
                  {metrics.totalNotesRemapped >= 1000
                    ? `${(metrics.totalNotesRemapped / 1000).toFixed(1)}k`
                    : metrics.totalNotesRemapped}
                </span>
                <span className="metric-lbl">notas</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
