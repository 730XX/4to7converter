import type { OsuBeatmap } from "../../../src/core/osu/types";

interface StatsBarProps {
  source: OsuBeatmap;
  converted: OsuBeatmap;
  targetColumnCounts: number[];
  issueCounts: { errors: number; warnings: number };
}

/**
 * Barra de estadísticas: conteos de notas fuente y destino, cantidad de
 * problemas por severidad y un resumen de barras por columna destino.
 */
export function StatsBar({ source, converted, targetColumnCounts, issueCounts }: StatsBarProps) {
  const maxTargetCount = Math.max(...targetColumnCounts, 1);

  return (
    <section className="stats-bar">
      <div className="stat-card">
        <span className="stat-label">Notas fuente</span>
        <span className="stat-value mono">{source.hitObjects.length}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Notas destino</span>
        <span className="stat-value mono">{converted.hitObjects.length}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Errores</span>
        <span className={`stat-value mono${issueCounts.errors > 0 ? " is-error" : ""}`}>
          {issueCounts.errors}
        </span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Advertencias</span>
        <span className={`stat-value mono${issueCounts.warnings > 0 ? " is-warning" : ""}`}>
          {issueCounts.warnings}
        </span>
      </div>
      <div className="stat-card stat-card--columns">
        <span className="stat-label">Notas por columna destino</span>
        <div
          className="column-bars"
          style={{ gridTemplateColumns: `repeat(${targetColumnCounts.length}, 1fr)` }}
        >
          {targetColumnCounts.map((count, column) => (
            <div key={column} className="column-bar" title={`Carril ${column + 1}: ${count}`}>
              <span className="column-bar-value mono">{count}</span>
              <span className="column-bar-track" aria-hidden="true">
                <span
                  className="column-bar-fill"
                  style={{ height: `${Math.max((count / maxTargetCount) * 100, 4)}%` }}
                />
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
