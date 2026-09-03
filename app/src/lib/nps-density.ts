/**
 * Módulo para cálculo de densidad de notas (Notes Per Second - NPS)
 * y generación de siluetas de ondas SVG suaves estilo YouTube.
 */

export interface NpsDensityData {
  /** Puntos de densidad normalizados (0.0 a 1.0) para renderizado visual */
  normalizedPoints: number[];
  /** Valores reales de NPS correspondientes a cada muestra */
  rawNpsPoints: number[];
  /** Pico máximo de NPS registrado en el beatmap */
  peakNps: number;
  /** Duración de cada cubeta/muestra en segundos */
  sampleDurationSec: number;
}

/**
 * Extrae de forma eficiente los tiempos (en milisegundos) de cada nota
 * a partir del texto plano de un archivo .osu.
 */
export function extractHitObjectTimes(osuContent: string): number[] {
  const times: number[] = [];
  const lines = osuContent.split(/\r?\n/);
  let inHitObjects = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      if (inHitObjects) break;
      inHitObjects = line.toLowerCase() === "[hitobjects]";
      continue;
    }

    if (inHitObjects) {
      const commaIndex1 = line.indexOf(",");
      if (commaIndex1 === -1) continue;
      const commaIndex2 = line.indexOf(",", commaIndex1 + 1);
      if (commaIndex2 === -1) continue;
      const commaIndex3 = line.indexOf(",", commaIndex2 + 1);

      const timeStr =
        commaIndex3 === -1
          ? line.substring(commaIndex2 + 1)
          : line.substring(commaIndex2 + 1, commaIndex3);

      const timeMs = Number(timeStr);
      if (Number.isFinite(timeMs) && timeMs >= 0) {
        times.push(timeMs);
      }
    }
  }

  return times.sort((a, b) => a - b);
}

/**
 * Calcula la curva de densidad NPS a lo largo de toda la duración del beatmap.
 * @param hitObjectTimes Array ordenado con los tiempos (ms) de cada nota.
 * @param durationSec Duración total en segundos.
 * @param sampleCount Cantidad de puntos de muestreo (por defecto 80 para una curva suave).
 */
export function calculateNpsDensity(
  hitObjectTimes: number[],
  durationSec: number,
  sampleCount = 80,
): NpsDensityData {
  if (durationSec <= 0 || hitObjectTimes.length === 0 || sampleCount <= 1) {
    return {
      normalizedPoints: new Array(sampleCount).fill(0),
      rawNpsPoints: new Array(sampleCount).fill(0),
      peakNps: 0,
      sampleDurationSec: 0,
    };
  }

  const sampleDurationSec = durationSec / sampleCount;
  const sampleDurationMs = sampleDurationSec * 1000;
  const rawNpsPoints: number[] = new Array(sampleCount).fill(0);

  // Conteo por ventanas de tiempo
  let noteIndex = 0;
  for (let s = 0; s < sampleCount; s++) {
    const windowStart = s * sampleDurationMs;
    const windowEnd = (s + 1) * sampleDurationMs;

    let notesInWindow = 0;
    while (noteIndex < hitObjectTimes.length && hitObjectTimes[noteIndex]! < windowEnd) {
      if (hitObjectTimes[noteIndex]! >= windowStart) {
        notesInWindow++;
      }
      noteIndex++;
    }

    // NPS en esta cubeta
    rawNpsPoints[s] = Math.round((notesInWindow / Math.max(0.1, sampleDurationSec)) * 10) / 10;
  }

  // Suavizado gaussiano de 3 puntos para que la curva fluya orgánicamente sin dientes de sierra
  const smoothedNps: number[] = new Array(sampleCount).fill(0);
  for (let s = 0; s < sampleCount; s++) {
    const prev = rawNpsPoints[Math.max(0, s - 1)] ?? 0;
    const curr = rawNpsPoints[s] ?? 0;
    const next = rawNpsPoints[Math.min(sampleCount - 1, s + 1)] ?? 0;
    smoothedNps[s] = prev * 0.22 + curr * 0.56 + next * 0.22;
  }

  let peakNps = 0;
  for (let s = 0; s < sampleCount; s++) {
    if (smoothedNps[s]! > peakNps) {
      peakNps = smoothedNps[s]!;
    }
  }

  // Normalizar entre 0.0 y 1.0
  const normalizedPoints = smoothedNps.map((val) => {
    if (peakNps <= 0) return 0;
    return Math.min(1, Math.max(0, val / peakNps));
  });

  return {
    normalizedPoints,
    rawNpsPoints,
    peakNps: Math.round(peakNps * 10) / 10,
    sampleDurationSec,
  };
}

/**
 * Genera trayectorias SVG continuas y suaves (Cubic Bézier) para representar la curva de densidad.
 * @param normalizedPoints Puntos entre 0.0 y 1.0.
 * @param width Ancho del viewBox SVG.
 * @param height Altura máxima de la curva.
 */
export function generateSmoothSvgPath(
  normalizedPoints: number[],
  width = 1000,
  height = 24,
): { fillPath: string; strokePath: string } {
  const n = normalizedPoints.length;
  if (n < 2) {
    return { fillPath: "", strokePath: "" };
  }

  // Convertir puntos normalizados a coordenadas Cartesianas SVG
  // En SVG: Y=0 es arriba, Y=height es la base inferior
  const coords: Array<{ x: number; y: number }> = normalizedPoints.map((val, idx) => {
    const x = (idx / (n - 1)) * width;
    // val=1 -> pico más alto (y = 2px desde arriba); val=0 -> base (y = height)
    const y = height - val * (height - 2);
    return { x, y };
  });

  // Construir Spline cúbica continua
  let strokePath = `M ${coords[0]!.x.toFixed(1)} ${coords[0]!.y.toFixed(1)}`;

  for (let i = 0; i < n - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)]!;
    const p1 = coords[i]!;
    const p2 = coords[i + 1]!;
    const p3 = coords[Math.min(n - 1, i + 2)]!;

    // Puntos de control Catmull-Rom convertidos a Bézier
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    strokePath += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  // Cerrar el polígono de relleno hacia la base inferior
  const lastX = coords[n - 1]!.x.toFixed(1);
  const firstX = coords[0]!.x.toFixed(1);
  const bottomY = height.toFixed(1);

  const fillPath = `${strokePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

  return { fillPath, strokePath };
}
