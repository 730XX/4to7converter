import type { HitObject } from "../../../src/core/osu/types";

/** Tolerancia de tiempo (en ms) para registrar un acierto (hit) */
export const HIT_WINDOW_MS = 140;

export interface PlayEngineState {
  combo: number;
  maxCombo: number;
  /** Valor del combo antes del último fallo (para animación de decremento) */
  lastBrokenCombo: number;
  /** Timestamp de performance.now() cuando se rompió el combo */
  comboBreakTime: number;
  /** Timestamp de performance.now() cuando se conectó el último hit (para escala elástica) */
  lastHitTime: number;
  /** Estado booleano de los 7 carriles pulsados actualmente por el usuario */
  activeHeldLanes: boolean[];
  /** Set con los índices de las notas que ya fueron juzgadas (para ocultarlas del render) */
  hitNoteIndices: Set<number>;
  /** Set con los índices de las LNs que están siendo sostenidas activamente */
  holdingLnIndices: Set<number>;
}

/**
 * Motor de juicio de ritmo en tiempo real para el Modo Play (Test Play).
 * Gestiona la detección precisa de notas simples y sostenidas (LN), combo y feedback de carriles.
 */
export class PlayEngine {
  private hitObjects: HitObject[] = [];
  private keyCount: number = 7;
  private judgedMap: Map<number, "hit" | "miss"> = new Map();
  private holdingLnMap: Map<number, number> = new Map(); // laneIndex -> noteIndex
  private activeHeldLanes: boolean[] = [false, false, false, false, false, false, false];
  private combo: number = 0;
  private maxCombo: number = 0;
  private lastBrokenCombo: number = 0;
  private comboBreakTime: number = 0;
  private lastHitTime: number = 0;
  private hitNoteIndices: Set<number> = new Set();

  constructor(hitObjects: HitObject[] = [], keyCount: number = 7) {
    this.init(hitObjects, keyCount);
  }

  public init(hitObjects: HitObject[], keyCount: number = 7): void {
    this.hitObjects = hitObjects;
    this.keyCount = keyCount;
    this.reset();
  }

  public reset(): void {
    this.judgedMap.clear();
    this.holdingLnMap.clear();
    this.hitNoteIndices.clear();
    this.activeHeldLanes = Array(this.keyCount).fill(false);
    this.combo = 0;
    this.lastBrokenCombo = 0;
    this.comboBreakTime = 0;
    this.lastHitTime = 0;
  }

  /**
   * Procesa la pulsación de una tecla asociada a un carril.
   */
  public handleKeyDown(laneIndex: number, currentTimeMs: number, playOffsetMs: number = 0): boolean {
    if (laneIndex < 0 || laneIndex >= this.keyCount) return false;

    this.activeHeldLanes[laneIndex] = true;
    const effectiveTime = currentTimeMs - playOffsetMs;

    // Buscar la nota más cercana no juzgada en este carril
    let bestIndex = -1;
    let minDelta = Infinity;

    for (let i = 0; i < this.hitObjects.length; i++) {
      const note = this.hitObjects[i];
      if (note.column !== laneIndex) continue;
      if (this.judgedMap.has(i)) continue;

      const delta = Math.abs(effectiveTime - note.timeMs);
      if (delta <= HIT_WINDOW_MS && delta < minDelta) {
        minDelta = delta;
        bestIndex = i;
      }
    }

    if (bestIndex !== -1) {
      const note = this.hitObjects[bestIndex];
      this.judgedMap.set(bestIndex, "hit");

      if (note.endTimeMs !== null) {
        // Long Note: NO ocultar aún, dejarla visible mientras se sostiene
        this.holdingLnMap.set(laneIndex, bestIndex);
      } else {
        // Rice note: ocultar de inmediato
        this.hitNoteIndices.add(bestIndex);
      }

      this.combo += 1;
      if (this.combo > this.maxCombo) {
        this.maxCombo = this.combo;
      }
      this.lastHitTime = performance.now();
      return true;
    }

    // Ghost tap permitido: no hay nota cerca, no penaliza el combo (estilo osu!mania vanilla)
    return false;
  }

  /**
   * Procesa la liberación de una tecla.
   */
  public handleKeyUp(laneIndex: number, currentTimeMs: number, playOffsetMs: number = 0): void {
    if (laneIndex < 0 || laneIndex >= this.keyCount) return;

    this.activeHeldLanes[laneIndex] = false;

    // Si había una LN siendo sostenida en este carril
    if (this.holdingLnMap.has(laneIndex)) {
      const noteIndex = this.holdingLnMap.get(laneIndex)!;
      const note = this.hitObjects[noteIndex];
      this.holdingLnMap.delete(laneIndex);

      // Ocultar la LN del render (ya terminó, se soltó)
      this.hitNoteIndices.add(noteIndex);

      if (note && note.endTimeMs !== null) {
        const effectiveTime = currentTimeMs - playOffsetMs;
        // Si se soltó prematuramente antes de la cola de la LN
        if (note.endTimeMs - effectiveTime > HIT_WINDOW_MS) {
          this.triggerMiss();
        }
      }
    }
  }

  /**
   * Evalúa el paso del tiempo para detectar notas que pasaron de largo sin ser pulsadas (Miss)
   * y auto-completar LNs cuya cola ya pasó.
   */
  public update(currentTimeMs: number, playOffsetMs: number = 0): void {
    const effectiveTime = currentTimeMs - playOffsetMs;

    for (let i = 0; i < this.hitObjects.length; i++) {
      const note = this.hitObjects[i];
      if (this.judgedMap.has(i)) continue;

      // Si la nota ya pasó la ventana de golpe sin haber sido tocada
      if (effectiveTime - note.timeMs > HIT_WINDOW_MS) {
        this.judgedMap.set(i, "miss");
        this.hitNoteIndices.add(i); // Ocultar la nota del render
        this.triggerMiss();
      }
    }

    // Auto-completar LNs cuya cola ya pasó mientras están siendo sostenidas
    for (const [lane, noteIndex] of this.holdingLnMap.entries()) {
      const note = this.hitObjects[noteIndex];
      if (note && note.endTimeMs !== null && effectiveTime > note.endTimeMs + HIT_WINDOW_MS) {
        this.holdingLnMap.delete(lane);
        this.hitNoteIndices.add(noteIndex); // LN completada, ocultar
      }
    }
  }

  private triggerMiss(): void {
    if (this.combo > 0) {
      this.lastBrokenCombo = this.combo;
      this.combo = 0;
      this.comboBreakTime = performance.now();
    }
  }

  public getState(): PlayEngineState {
    return {
      combo: this.combo,
      maxCombo: this.maxCombo,
      lastBrokenCombo: this.lastBrokenCombo,
      comboBreakTime: this.comboBreakTime,
      lastHitTime: this.lastHitTime,
      activeHeldLanes: [...this.activeHeldLanes],
      hitNoteIndices: this.hitNoteIndices,
      holdingLnIndices: new Set(this.holdingLnMap.values()),
    };
  }
}
