import { Check, ChevronDown, FilePlus, Search } from "lucide-react";
import type { OsuBeatmap } from "../../../src/core/osu/types";
import type { BeatmapDiffItem } from "../lib/native";

interface BeatmapHeaderCardProps {
  source: OsuBeatmap;
  fileName: string;
  backgroundUrl: string | null;
  audioUrl: string | null;
  sourcePath: string | null;
  difficulties?: BeatmapDiffItem[];
  zeroLn: boolean;
  onToggleZeroLn: (zeroLn: boolean) => void;
  onSelectDifficulty?: (path: string) => void;
  onOpenNewFile: () => void;
  onOpenQuickSearch?: () => void;
}

/**
 * Card superior compacta:
 * Muestra el banner del mapa con background real, selector de dificultades,
 * badges, botón "Nuevo" y los filtros rápidos (0 LN activo, Anti-Jack y Kiai Boost próximamente).
 */
export function BeatmapHeaderCard({
  source,
  fileName,
  backgroundUrl,
  audioUrl,
  sourcePath,
  difficulties = [],
  zeroLn,
  onToggleZeroLn,
  onSelectDifficulty,
  onOpenNewFile,
  onOpenQuickSearch,
}: BeatmapHeaderCardProps) {
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
            style={{ backgroundImage: `url("${backgroundUrl.replace(/"/g, '\\"')}")` }}
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
                onChange={(e) => {
                  e.target.blur();
                  onSelectDifficulty?.(e.target.value);
                }}
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

          <div className="beatmap-banner-actions">
            {onOpenQuickSearch && (
              <button
                type="button"
                className="beatmap-search-btn"
                onClick={onOpenQuickSearch}
                title="Búsqueda rápida en osu! (Ctrl + P)"
              >
                <Search size={13} />
                <span>Buscar</span>
              </button>
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

      {/* Barra horizontal de Filtros (0 LN funcional, otros con estado Próximamente) */}
      <div className="smart-tweaks-toolbar">
        {/* Anti-Jack (Próximamente) */}
        <label
          className="tweak-toolbar-item is-disabled"
          title="Próximamente"
        >
          <input
            type="checkbox"
            disabled
            checked={false}
            className="visually-hidden"
          />
          <span className="tweak-toolbar-indicator" />
          <span className="tweak-toolbar-label">Anti-Jack</span>
        </label>

        <div className="smart-tweaks-divider" aria-hidden="true" />

        {/* 0 LN (Activo y funcional) */}
        <label
          className={`tweak-toolbar-item${zeroLn ? " is-checked" : ""}`}
          title="Convertir todas las Long Notes (LN) en notas simples (Rice)"
        >
          <input
            type="checkbox"
            checked={zeroLn}
            onChange={(e) => onToggleZeroLn(e.target.checked)}
            className="visually-hidden"
          />
          <span className="tweak-toolbar-indicator">
            {zeroLn && <Check size={10} strokeWidth={3} />}
          </span>
          <span className="tweak-toolbar-label">0 LN</span>
        </label>

        <div className="smart-tweaks-divider" aria-hidden="true" />

        {/* Kiai Boost (Próximamente) */}
        <label
          className="tweak-toolbar-item tweak-toolbar-item--kiai is-disabled"
          title="Próximamente"
        >
          <input
            type="checkbox"
            disabled
            checked={false}
            className="visually-hidden"
          />
          <span className="tweak-toolbar-indicator" />
          <span className="tweak-toolbar-label">Kiai Boost</span>
        </label>
      </div>
    </header>
  );
}
