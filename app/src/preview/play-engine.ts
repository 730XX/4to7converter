import type { HitObject } from "../../../src/core/osu/types";

/** Tolerancia de tiempo (en ms) para registrar un acierto (hit) */
export const HIT_WINDOW_MS = 140;

export type JudgementTier = "MAX" | "PERFECT" | "GREAT" | "GOOD" | "MISS";

export interface JudgementEvent {
  tier: JudgementTier;
  /** Timestamp de performance.now() cuando ocurrió el juicio */
  timestamp: number;
}

/**
 * Determina el tier de juicio basado en el desvío absoluto en milisegundos.
 */
export function getJudgementTier(errorMs: number): JudgementTier {
  const abs = Math.abs(errorMs);
  if (abs <= 16) return "MAX";
  if (abs <= 40) return "PERFECT";
  if (abs <= 75) return "GREAT";
  if (abs <= 110) return "GOOD";
  return "MISS";
}

export interface HitErrorEvent {
  /** Desvío en ms (negativo: early/temprano, positivo: late/tarde) */
  errorMs: number;
  /** Timestamp de performance.now() cuando ocurrió el impacto */
  timestamp: number;
}

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
  /** Historial reciente de desvíos de tiempo (Hit Errors) */
  recentHitErrors: HitErrorEvent[];
  /** Último juicio registrado para feedback visual flotante */
  lastJudgement: JudgementEvent | null;
}

/**
 * Motor de juicio de ritmo en tiempo real para el Modo Play (Test Play).
 * Gestiona la detección precisa de notas simples y sostenidas (LN), combo, feedback de carriles, timing error y juicios.
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
  private recentHitErrors: HitErrorEvent[] = [];
  private nextUnjudgedIndex: number = 0;
  private lastJudgement: JudgementEvent | null = null;

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
    this.holdingLnMap.clear();
    this.recentHitErrors = [];
    this.nextUnjudgedIndex = 0;
    this.lastJudgement = null;
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
      if (!note || note.column !== laneIndex) continue;
      if (this.judgedMap.has(i)) continue;

      const delta = Math.abs(effectiveTime - note.timeMs);
      if (delta <= HIT_WINDOW_MS && delta < minDelta) {
        minDelta = delta;
        bestIndex = i;
      }
    }

    if (bestIndex !== -1) {
      const note = this.hitObjects[bestIndex];
      if (!note) return false;
      this.judgedMap.set(bestIndex, "hit");

      // Calcular desvío de tiempo exacto (ms) y determinar el juicio
      const errorMs = effectiveTime - note.timeMs;
      const now = performance.now();
      const tier = getJudgementTier(errorMs);

      this.lastJudgement = { tier, timestamp: now };
      this.recentHitErrors.push({ errorMs, timestamp: now });
      // Mantener solo los últimos 20 impactos
      if (this.recentHitErrors.length > 20) {
        this.recentHitErrors.shift();
      }

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
      this.lastHitTime = now;
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
   * Sembra el cursor de Autoplay en un tiempo dado para que las notas anteriores
   * a ese momento NO vuelvan a juzgarse ni a disparar hitsounds. Útil al cambiar
   * de mapa/reiniciar en mitad de la canción. El array de notas está ordenado por tiempo.
   */
  public seedAutoplayCursor(atTimeMs: number): void {
    let lo = 0;
    let hi = this.hitObjects.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const note = this.hitObjects[mid];
      if (note && note.timeMs < atTimeMs) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    this.nextUnjudgedIndex = lo;
  }

  /**
   * Ejecuta la lógica de Autoplay perfecta (0ms de error, MAX score, hitsounds e iluminación de carril).
   */
  public updateAutoplay(    currentTimeMs: number,
    onHitSound?: (effectiveVol: number) => void,
    hitsoundVolume: number = 20,
  ): void {
    const now = performance.now();
    let hitCount = 0;

    for (let i = this.nextUnjudgedIndex; i < this.hitObjects.length; i++) {
      const note = this.hitObjects[i];
      if (!note) continue;

      // Si la nota está muy en el futuro, podemos detener el bucle
      if (note.timeMs > currentTimeMs + 100) {
        break;
      }

      if (this.judgedMap.has(i)) continue;

      // Al alcanzar el tiempo exacto de la nota
      if (currentTimeMs >= note.timeMs) {
        this.judgedMap.set(i, "hit");
        this.lastJudgement = { tier: "MAX", timestamp: now };
        this.recentHitErrors.push({ errorMs: 0, timestamp: now });
        if (this.recentHitErrors.length > 20) {
          this.recentHitErrors.shift();
        }

        this.combo += 1;
        if (this.combo > this.maxCombo) {
          this.maxCombo = this.combo;
        }
        this.lastHitTime = now;
        this.activeHeldLanes[note.column] = true;
        hitCount++;

        if (note.endTimeMs !== null) {
          // LN: mantener presionada hasta el final
          this.holdingLnMap.set(note.column, i);
        } else {
          // Rice note: ocultar de inmediato
          this.hitNoteIndices.add(i);
        }
      }
    }

    // Reproducir hitsound con escalamiento de acorde
    if (hitCount > 0 && onHitSound) {
      const baseVol = hitsoundVolume / 100;
      const chordMultiplier = 1 + Math.min(hitCount - 1, 6) * 0.30;
      onHitSound(baseVol * chordMultiplier);
    }

    // Liberar carriles para rice notes tras un instante (80ms) o cuando termine la LN
    for (let col = 0; col < this.keyCount; col++) {
      if (this.holdingLnMap.has(col)) {
        const noteIndex = this.holdingLnMap.get(col)!;
        const note = this.hitObjects[noteIndex];
        if (note && note.endTimeMs !== null && currentTimeMs >= note.endTimeMs) {
          this.holdingLnMap.delete(col);
          this.hitNoteIndices.add(noteIndex);
          this.activeHeldLanes[col] = false;
        } else {
          this.activeHeldLanes[col] = true;
        }
      } else if (now - this.lastHitTime > 80) {
        this.activeHeldLanes[col] = false;
      }
    }

    // Avanzar el puntero de notas no juzgadas
    while (
      this.nextUnjudgedIndex < this.hitObjects.length &&
      this.judgedMap.has(this.nextUnjudgedIndex)
    ) {
      this.nextUnjudgedIndex++;
    }
  }

  /**
   * Evalúa el paso del tiempo para detectar notas que pasaron de largo sin ser pulsadas (Miss)
   * y auto-completar LNs cuya cola ya pasó.
   */
  public update(currentTimeMs: number, playOffsetMs: number = 0): void {
    const effectiveTime = currentTimeMs - playOffsetMs;

    for (let i = this.nextUnjudgedIndex; i < this.hitObjects.length; i++) {
      const note = this.hitObjects[i];
      if (!note) continue;

      // Si la nota ni siquiera ha entrado en la ventana de error, no puede ser Miss aún
      // Detenemos el bucle porque el array está ordenado cronológicamente.
      if (effectiveTime - note.timeMs <= HIT_WINDOW_MS) {
        break;
      }

      if (this.judgedMap.has(i)) continue;

      // Si la nota ya pasó la ventana de golpe sin haber sido tocada:
      // Se registra el MISS (se rompe combo), pero NO se oculta prematuramente,
      // permitiendo que la nota continúe su trayectoria hasta salir del canvas.
      this.judgedMap.set(i, "miss");
      this.triggerMiss();
    }

    // Auto-completar LNs cuya cola ya pasó mientras están siendo sostenidas
    for (const [lane, noteIndex] of this.holdingLnMap.entries()) {
      const note = this.hitObjects[noteIndex];
      if (note && note.endTimeMs !== null && effectiveTime > note.endTimeMs + HIT_WINDOW_MS) {
        this.holdingLnMap.delete(lane);
        this.hitNoteIndices.add(noteIndex); // LN completada y soltada/terminada, ocultar
      }
    }

    // Avanzar el puntero de notas no juzgadas
    while (
      this.nextUnjudgedIndex < this.hitObjects.length &&
      this.judgedMap.has(this.nextUnjudgedIndex)
    ) {
      this.nextUnjudgedIndex++;
    }
  }

  private triggerMiss(): void {
    const now = performance.now();
    this.lastJudgement = { tier: "MISS", timestamp: now };
    if (this.combo > 0) {
      this.lastBrokenCombo = this.combo;
      this.combo = 0;
      this.comboBreakTime = now;
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
      recentHitErrors: [...this.recentHitErrors],
      lastJudgement: this.lastJudgement,
    };
  }
}
