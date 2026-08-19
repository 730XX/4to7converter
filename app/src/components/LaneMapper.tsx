import { RotateCcw, Shuffle } from "lucide-react";
import { useMemo } from "react";
import type { CSSProperties } from "react";
import {
  createDefaultLaneMapState,
  generateRandomLaneMapState,
  getTargetColumnCounts,
  hasTargetColumn,
  toggleTargetColumn,
  type LaneMapState,
} from "../lib/lane-map-state";
import type { LanePreset } from "../lib/lane-presets";
import { PresetSelector } from "./PresetSelector";

interface LaneMapperProps {
  state: LaneMapState;
  sourceKeyCount: number;
  targetKeyCount: number;
  onChange: (nextState: LaneMapState) => void;
  presets?: readonly LanePreset[];
  onSavePreset?: (name: string) => void;
  onDeletePreset?: (id: string) => void;
  onApplyPreset?: (preset: LanePreset) => void;
}

/**
 * Editor visual del mapeo de carriles con presets integrados.
 */
export function LaneMapper({
  state,
  sourceKeyCount,
  targetKeyCount,
  onChange,
  presets,
  onSavePreset,
  onDeletePreset,
  onApplyPreset,
}: LaneMapperProps) {
  const targetColumnCounts = useMemo(
    () => getTargetColumnCounts(state, targetKeyCount),
    [state, targetKeyCount],
  );

  const sourceColumns = Array.from({ length: sourceKeyCount }, (_, index) => index);
  const targetColumns = Array.from({ length: targetKeyCount }, (_, index) => index);

  const gridStyle = {
    "--target-column-count": String(targetKeyCount),
  } as CSSProperties;

  function handleToggle(sourceColumn: number, targetColumn: number): void {
    const nextState = toggleTargetColumn(state, sourceColumn, targetColumn);
    if (nextState !== state) {
      onChange(nextState);
    }
  }

  function handleShuffle(): void {
    const randomState = generateRandomLaneMapState(sourceKeyCount, targetKeyCount);
    onChange(randomState);
  }

  function handleResetDefault(): void {
    onChange(createDefaultLaneMapState());
  }

  return (
    <section className="lane-mapper" style={gridStyle}>
      <div className="lane-mapper-header">
        <h2>Estilo de converción</h2>
        <div className="lane-mapper-actions">
          <button
            type="button"
            className="lane-action-btn"
            onClick={handleShuffle}
            title="Generar mapeo aleatorio (Shuffle)"
          >
            <Shuffle size={13} />
          </button>
          <button
            type="button"
            className="lane-action-btn"
            onClick={handleResetDefault}
            title="Restablecer mapeo estándar"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {presets && onSavePreset && onDeletePreset && onApplyPreset && (
        <PresetSelector
          presets={presets}
          currentState={state}
          onSave={onSavePreset}
          onDelete={onDeletePreset}
          onApply={onApplyPreset}
        />
      )}

      <div className="lane-legend">
        <span className="lane-legend-source">4k</span>
        <span className="lane-legend-target">7k</span>
      </div>
      <div className="lane-grid">
        <div className="lane-row lane-row--header">
          <span className="lane-source-label" />
          {targetColumns.map((targetColumn) => (
            <span key={targetColumn} className="lane-column-label mono">
              {targetColumn + 1}
            </span>
          ))}
        </div>
        {sourceColumns.map((sourceColumn) => {
          const sourceTargets = state[sourceColumn] ?? [];
          const canTurnOff = sourceTargets.length > 1;
          return (
            <div key={sourceColumn} className="lane-row">
              <span className="lane-source-label">Carril {sourceColumn + 1}</span>
              {targetColumns.map((targetColumn) => {
                const isOn = hasTargetColumn(state, sourceColumn, targetColumn);
                const collisionCount = targetColumnCounts[targetColumn] ?? 0;
                const hasCollision = collisionCount >= 2;
                return (
                  <button
                    key={targetColumn}
                    type="button"
                    className={`lane-chip${isOn ? " is-on" : ""}${!canTurnOff && isOn ? " is-locked" : ""}`}
                    aria-pressed={isOn}
                    aria-label={`Carril ${sourceColumn + 1} → Carril ${targetColumn + 1}`}
                    onClick={() => handleToggle(sourceColumn, targetColumn)}
                  >
                    {isOn && <span className="chip-dot" aria-hidden="true" />}
                    {hasCollision && <span className="chip-badge">{collisionCount} fuentes</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {/* 
      <div className="lane-hint-region" aria-live="polite">
        {hintRow !== null && (
          <p className="lane-hint">Cada carril fuente necesita al menos un destino</p>
        )}
      </div>*/}
    </section>
  );
}
