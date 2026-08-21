import type { TimingPoint } from "../../../src/core/osu/types";

export interface TimingSectionInfo {
  offsetMs: number;
  beatLength: number;
  meter: number;
  bpm: number;
}

export interface KiaiInterval {
  startMs: number;
  endMs: number;
}

/**
 * Extrae y ordena cronológicamente las secciones uninherited (BPM).
 */
export function getTimingSections(timingPoints: TimingPoint[]): TimingSectionInfo[] {
  if (!timingPoints || timingPoints.length === 0) return [];

  return timingPoints
    .filter((tp) => tp.uninherited && tp.beatLength > 0)
    .sort((a, b) => a.offsetMs - b.offsetMs)
    .map((tp) => ({
      offsetMs: tp.offsetMs,
      beatLength: tp.beatLength,
      meter: Math.max(1, tp.meter || 4),
      bpm: Math.round(60000 / tp.beatLength),
    }));
}

/**
 * Extrae los intervalos de Kiai Time continuos [startMs, endMs].
 */
export function getKiaiIntervals(timingPoints: TimingPoint[], durationMs: number = 3600000): KiaiInterval[] {
  if (!timingPoints || timingPoints.length === 0) return [];

  const sorted = [...timingPoints].sort((a, b) => a.offsetMs - b.offsetMs);
  const intervals: KiaiInterval[] = [];
  let currentStart: number | null = null;

  for (const tp of sorted) {
    const isKiai = (tp.effects & 1) === 1;
    if (isKiai && currentStart === null) {
      currentStart = Math.max(0, tp.offsetMs);
    } else if (!isKiai && currentStart !== null) {
      intervals.push({ startMs: currentStart, endMs: Math.max(currentStart, tp.offsetMs) });
      currentStart = null;
    }
  }

  if (currentStart !== null) {
    intervals.push({ startMs: currentStart, endMs: Math.max(currentStart, durationMs) });
  }

  return intervals;
}

/**
 * Estado dinámico continuo del ritmo para animaciones a 60/120 FPS sin saltos.
 */
export interface DynamicRhythmValues {
  currentBpm: number;
  /** Índice del beat activo en el compás (0 = primer beat / downbeat, 1, 2, 3) */
  beatIndex: number;
  /** Índice visual siempre en base-4 (0-3), para los 4 cuadritos del metrónomo */
  beatIndex4: number;
  /** Compás activo (4 para 4/4, 3 para 3/4, etc.) */
  meter: number;
  /** Intensidad del pulso de beat (1.0 en el golpe exacto -> 0.0 suave) */
  beatPulse: number;
  /** Está actualmente dentro de un segmento Kiai */
  isInKiai: boolean;
  /** Factor de oscurecimiento suave 3s antes del Kiai (0.0 a 1.0) */
  buildupDim: number;
  /** Intensidad del destello al entrar al Kiai (1.0 a 0.0 con decay) */
  flashIntensity: number;
  /** Onda continua suave de pulso en Kiai en compás 1/8 (8 beats completos, 0.0 a 1.0) */
  kiaiWave: number;
  /** offsetMs de la sección de BPM activa (para detectar cambios de sección) */
  activeSectionOffsetMs: number;
}

/**
 * Evalúa en tiempo real las intensidades continuas para renderizado fluido.
 */
export function evaluateDynamicRhythm(
  timingSections: TimingSectionInfo[],
  kiaiIntervals: KiaiInterval[],
  currentTimeMs: number,
): DynamicRhythmValues {
  // 1. Obtener sección de BPM activa
  let activeSection: TimingSectionInfo | null = null;
  if (timingSections.length > 0) {
    activeSection = timingSections[0];
    for (let i = 0; i < timingSections.length; i++) {
      if (timingSections[i].offsetMs <= currentTimeMs) {
        activeSection = timingSections[i];
      } else {
        break;
      }
    }
  }

  const currentBpm = activeSection ? activeSection.bpm : 0;
  const meter = activeSection ? activeSection.meter : 4;
  let beatPulse = 0;
  let beatIndex = 0;
  let beatIndex4 = 0;

  if (activeSection && activeSection.beatLength > 0) {
    const elapsedSinceOffset = currentTimeMs - activeSection.offsetMs;
    const totalBeats = Math.floor(elapsedSinceOffset / activeSection.beatLength);
    // beatIndex relativo al meter real (para downbeat)
    beatIndex = ((totalBeats % meter) + meter) % meter;
    // beatIndex4: SIEMPRE base-4, para los 4 cuadritos visuales del metrónomo
    beatIndex4 = ((totalBeats % 4) + 4) % 4;

    const beatPhase = ((elapsedSinceOffset % activeSection.beatLength) + activeSection.beatLength) % activeSection.beatLength;
    const progress = beatPhase / activeSection.beatLength; // 0.0 -> 1.0
    // Attack instantáneo en el milisegundo 0 y decay exponencial suave
    beatPulse = Math.exp(-progress * 3.2);
  }

  // 2. Evaluar Kiai: Buildup suave y transición gradual
  const BUILDUP_DURATION_MS = 3000; // 3.0 segundos de anticipación
  const FLASH_DURATION_MS = 650; // 650ms con curva cúbica ease-out para una disolución suave y pausada

  let isInKiai = false;
  let buildupDim = 0;
  let flashIntensity = 0;
  let kiaiWave = 0;

  for (const interval of kiaiIntervals) {
    // Si estamos dentro del Kiai
    if (currentTimeMs >= interval.startMs && currentTimeMs <= interval.endMs) {
      isInKiai = true;
      const timeInKiai = currentTimeMs - interval.startMs;
      if (timeInKiai < FLASH_DURATION_MS) {
        // Curva Ease-Out Cúbica: salida ultra sedosa y natural sin cortes secos
        const flashProgress = timeInKiai / FLASH_DURATION_MS;
        const remain = 1 - flashProgress;
        flashIntensity = remain * remain * remain; // (1 - t)^3
      }

      // Pulso rítmico constante durante Kiai: 1 destello cada 8 beats
      if (activeSection && activeSection.beatLength > 0) {
        const cycle8 = activeSection.beatLength * 8;
        const elapsed = currentTimeMs - activeSection.offsetMs;
        const phase = ((elapsed % cycle8) + cycle8) % cycle8;
        const p = phase / cycle8; // 0.0 -> 1.0
        // Ataque instantáneo, caída rápida-media: apagado total al 35% del ciclo
        kiaiWave = Math.max(0, 1 - p * 2.8);
      }
      break;
    }

    // Si estamos en la ventana de anticipación (3s antes del Kiai)
    if (
      currentTimeMs >= interval.startMs - BUILDUP_DURATION_MS &&
      currentTimeMs < interval.startMs
    ) {
      const timeUntilKiai = interval.startMs - currentTimeMs;
      const progress = 1 - timeUntilKiai / BUILDUP_DURATION_MS; // 0.0 -> 1.0
      // Progresión suave exponencial: 0.0 al inicio -> 1.0 justo antes del drop
      buildupDim = Math.pow(progress, 1.8);
    }
  }

  return {
    currentBpm,
    beatIndex,
    beatIndex4,
    meter,
    beatPulse,
    isInKiai,
    buildupDim,
    flashIntensity,
    kiaiWave,
    activeSectionOffsetMs: activeSection?.offsetMs ?? -1,
  };
}
