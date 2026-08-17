import { Bell, CheckCircle2, Gauge, Volume2 } from "lucide-react";

export interface OsdState {
  type: "audio" | "speed" | "export";
  volume?: number; // 0 - 100
  hitsoundVolume?: number; // 0 - 100
  scrollSpeed?: number; // 10 - 40
  activeParam?: "music" | "hitsound" | "scroll";
  title?: string;
  message?: string;
}

interface QuickToastOsdProps {
  osd: OsdState | null;
}

/**
 * Toast flotante HUD unificado tipo cápsula / control center
 * Muestra volumen, velocidad de scroll y confirmaciones de exportación elegantes.
 */
export function QuickToastOsd({ osd }: QuickToastOsdProps) {
  if (!osd) {
    return null;
  }

  if (osd.type === "export") {
    return (
      <div className="osd-pill-toast" role="status" aria-live="polite">
        <div className="osd-icon" style={{ color: "var(--color-success, #22c55e)" }}>
          <CheckCircle2 size={18} />
        </div>
        <div className="osd-content" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <div className="osd-label-row">
            <span className="osd-title" style={{ fontWeight: 700, color: "#fff" }}>
              {osd.title ?? "¡Mapa 7K Guardado!"}
            </span>
          </div>
          {osd.message && (
            <span
              className="osd-value mono"
              style={{
                fontSize: "11px",
                color: "rgba(255, 255, 255, 0.7)",
                maxWidth: "260px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={osd.message}
            >
              {osd.message}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (osd.type === "speed") {
    const speed = osd.scrollSpeed ?? 25;
    const percentage = Math.max(0, Math.min(100, ((speed - 10) / 30) * 100));
    const displayValue = `${(speed / 10).toFixed(1)}x`;

    return (
      <div className="osd-pill-toast" role="status" aria-live="polite">
        <div className="osd-icon">
          <Gauge size={16} />
        </div>
        <div className="osd-content">
          <div className="osd-label-row">
            <span className="osd-title">Scroll</span>
            <span className="osd-value mono">{displayValue}</span>
          </div>
          <div className="osd-bar-track">
            <div className="osd-bar-fill" style={{ width: `${percentage}%` }} />
          </div>
        </div>
      </div>
    );
  }

  // Tipo Audio Unificado: Música + Hitsounds
  const musicPct = Math.max(0, Math.min(100, osd.volume ?? 0));
  const hitPct = Math.max(0, Math.min(100, osd.hitsoundVolume ?? 0));

  return (
    <div className="osd-pill-toast osd-pill-toast--dual" role="status" aria-live="polite">
      {/* Fila de Música */}
      <div className={`osd-dual-row${osd.activeParam === "music" ? " is-active" : ""}`}>
        <div className="osd-icon">
          <Volume2 size={15} />
        </div>
        <div className="osd-content">
          <div className="osd-label-row">
            <span className="osd-title">Música</span>
            <span className="osd-value mono">{Math.round(osd.volume ?? 0)}%</span>
          </div>
          <div className="osd-bar-track">
            <div className="osd-bar-fill" style={{ width: `${musicPct}%` }} />
          </div>
        </div>
      </div>

      <div className="osd-dual-divider" aria-hidden="true" />

      {/* Fila de Hitsounds */}
      <div className={`osd-dual-row${osd.activeParam === "hitsound" ? " is-active" : ""}`}>
        <div className="osd-icon">
          <Bell size={15} />
        </div>
        <div className="osd-content">
          <div className="osd-label-row">
            <span className="osd-title">Hitsound</span>
            <span className="osd-value mono">{Math.round(osd.hitsoundVolume ?? 0)}%</span>
          </div>
          <div className="osd-bar-track">
            <div className="osd-bar-fill osd-bar-fill--hitsound" style={{ width: `${hitPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
