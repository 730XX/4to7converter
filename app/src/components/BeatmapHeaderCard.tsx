import { Check, ChevronDown, Cpu, FilePlus } from "lucide-react";
import { useState } from "react";
import type { OsuBeatmap } from "../../../src/core/osu/types";
import type { BeatmapDiffItem } from "../lib/native";

interface BeatmapHeaderCardProps {
  source: OsuBeatmap;
  fileName: string;
  backgroundUrl: string | null;
  audioUrl: string | null;
  sourcePath: string | null;
  difficulties?: BeatmapDiffItem[];
  onSelectDifficulty?: (path: string) => void;
  onOpenNewFile: () => void;
}

/**
 * Card superior compacta:
 * Muestra el banner del mapa con background real, selector de dificultades,
 * badges, botón "Nuevo" y los filtros rápidos con líneas divisorias.
 */
export function BeatmapHeaderCard({
  source,
  fileName,
  backgroundUrl,
  audioUrl,
  sourcePath,
  difficulties = [],
  onSelectDifficulty,
  onOpenNewFile,
}: BeatmapHeaderCardProps) {
  // Estado local para los filtros de conversión
  const [antiJack, setAntiJack] = useState<boolean>(true);
  const [zeroLn, setZeroLn] = useState<boolean>(false);
  const [kiaiBoost, setKiaiBoost] = useState<boolean>(false);

  const title = source.title || fileName.replace(/\.osu$/i, "");
  const artist = source.artist || "Artista desconocido";
  const diffName = source.version || "Normal";

  return (
    <header className="beatmap-header-card">
      {/* Banner con imagen de fondo y metadatos */}
      <div className="beatmap-banner">
        {backgroundUrl ? (
          <div
            className="beatmap-banner-bg"
            style={{ backgroundImage: `url(${backgroundUrl})` }}
            aria-hidden="true"
          />
        ) : (
          <div className="beatmap-banner-bg-placeholder" aria-hidden="true" />
        )}
        <div className="beatmap-banner-overlay" />

        <div className="beatmap-banner-top">
          {difficulties.length > 1 ? (
            <div className="beatmap-diff-dropdown">
              <select
                className="beatmap-diff-select mono"
                value={sourcePath ?? ""}
                onChange={(e) => onSelectDifficulty?.(e.target.value)}
                title="Cambiar dificultad del beatmap"
              >
                {difficulties.map((diff) => (
                  <option key={diff.path} value={diff.path} className="beatmap-diff-option">
                    [{diff.version}]{diff.key_count !== source.keyCount ? ` (${diff.key_count}K)` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="beatmap-diff-chevron" aria-hidden="true" />
            </div>
          ) : (
            <span className="beatmap-diff-badge mono">[{diffName}]</span>
          )}

          <button
            type="button"
            className="beatmap-new-btn"
            onClick={onOpenNewFile}
            title="Cargar otro beatmap"
          >
            <FilePlus size={13} />
            <span>Nuevo</span>
          </button>
        </div>

        <div className="beatmap-banner-bottom">
          <div className="beatmap-title-wrap">
            <h1 className="beatmap-title" title={title}>
              {title}
            </h1>
            <p className="beatmap-artist" title={artist}>
              {artist}
            </p>
          </div>
          <div className="beatmap-badges-wrap">
            <span className="beatmap-key-badge">{source.keyCount}k</span>
            {sourcePath !== null && (
              <span
                className={`beatmap-audio-pill${audioUrl === null ? " is-missing" : ""}`}
                title={
                  audioUrl === null
                    ? "Audio no encontrado en la carpeta"
                    : "Audio sincronizado"
                }
              >
                {audioUrl === null ? "Sin audio" : "Audio OK"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Barra horizontal premium de Filtros con divisores */}
      <div className="smart-tweaks-toolbar">
        <label
          className={`tweak-toolbar-item${antiJack ? " is-checked" : ""}`}
          title="Prevenir notas consecutivas en el mismo carril a intervalos muy cortos"
        >
          <input
            type="checkbox"
            checked={antiJack}
            onChange={(e) => setAntiJack(e.target.checked)}
            className="visually-hidden"
          />
          <span className="tweak-toolbar-indicator">
            {antiJack && <Check size={10} strokeWidth={3} />}
          </span>
          <span className="tweak-toolbar-label">Anti-Jack</span>
        </label>

        <div className="smart-tweaks-divider" aria-hidden="true" />

        <label
          className={`tweak-toolbar-item${zeroLn ? " is-checked" : ""}`}
          title="Convertir todas las Long Notes (LN) en notas simples (Rice)"
        >
          <input
            type="checkbox"
            checked={zeroLn}
            onChange={(e) => setZeroLn(e.target.checked)}
            className="visually-hidden"
          />
          <span className="tweak-toolbar-indicator">
            {zeroLn && <Check size={10} strokeWidth={3} />}
          </span>
          <span className="tweak-toolbar-label">0 LN</span>
        </label>

        <div className="smart-tweaks-divider" aria-hidden="true" />

        <label
          className={`tweak-toolbar-item tweak-toolbar-item--kiai${kiaiBoost ? " is-checked" : ""}`}
          title="Aumentar la densidad de mapeo durante las secciones de Kiai"
        >
          <input
            type="checkbox"
            checked={kiaiBoost}
            onChange={(e) => setKiaiBoost(e.target.checked)}
            className="visually-hidden"
          />
          <span className="tweak-toolbar-indicator">
            {kiaiBoost && <Check size={10} strokeWidth={3} />}
          </span>
          <span className="tweak-toolbar-label">Kiai Boost</span>
        </label>
      </div>
    </header>
  );
}
