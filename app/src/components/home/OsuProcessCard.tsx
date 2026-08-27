import { Download, Gamepad2, Radar, RefreshCw } from "lucide-react";
import type { OsuDetectedBeatmap } from "../../lib/native";

interface OsuProcessCardProps {
  detectedMap: OsuDetectedBeatmap | null;
  isScanning: boolean;
  onLoadDetected: (path: string) => void;
  onRescan: () => void;
}

export function OsuProcessCard({
  detectedMap,
  isScanning,
  onLoadDetected,
  onRescan,
}: OsuProcessCardProps) {
  return (
    <section className="glass-panel osu-process-card">
      {detectedMap && <span aria-hidden className="osu-process-backdrop" />}
      <div className="osu-process-content">
        <div className="osu-process-left">
          <span
            className={`osu-process-icon-box ${
              detectedMap ? "is-detected" : "is-idle"
            }`}
          >
            {isScanning ? (
              <Radar size={20} className="is-spinning" />
            ) : (
              <Gamepad2 size={20} />
            )}
          </span>

          <div className="osu-process-info">
            <div className="osu-process-status-label">
              {isScanning
                ? "Escaneando procesos…"
                : detectedMap
                ? "osu! detectado en segundo plano"
                : "osu! no está en ejecución"}
            </div>

            {detectedMap ? (
              <>
                <div className="osu-process-title">
                  {detectedMap.artist} — {detectedMap.title || detectedMap.folder_name}
                </div>
                <div className="osu-process-meta mono">
                  [{detectedMap.version || "Normal"}] • 4K • Detectado en tiempo real
                </div>
              </>
            ) : (
              <div className="osu-process-idle-hint">
                Abre osu! o selecciona una canción y vuelve a escanear para cargarla.
              </div>
            )}
          </div>
        </div>

        <div className="osu-process-actions">
          {detectedMap && (
            <button
              type="button"
              onClick={() => onLoadDetected(detectedMap.path)}
              className="osu-process-load-btn bg-osu-gradient"
            >
              <Download size={16} />
              <span>Cargar mapa activo de osu!</span>
            </button>
          )}
          <button
            type="button"
            onClick={onRescan}
            title="Volver a escanear osu!"
            disabled={isScanning}
            className="glass-panel osu-process-refresh-btn"
          >
            <RefreshCw size={15} className={isScanning ? "is-spinning" : ""} />
          </button>
        </div>
      </div>
    </section>
  );
}
