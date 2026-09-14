import type { HitObject } from "../../../src/core/osu/types";
import {
  getColumnCenterX,
  getHoldEndY,
  getNoteY,
  isNoteVisible,
  findFirstVisibleNoteIndex,
  type PlayfieldMetrics,
} from "./preview-math";
import type { HitErrorEvent, JudgementEvent } from "./play-engine";
import { HIT_WINDOW_MS } from "./play-engine";
import type { SpeedTimeline } from "./speed-timeline";
import { getBeatLinesInRange, type TimingSectionInfo } from "./beat-grid";

/** Espacio vacío en la parte superior del playfield donde aparecen las notas. */
export const PLAYFIELD_TOP_PADDING = 60;

/** Altura de la línea de golpe medida desde el borde inferior del playfield. */
export const PLAYFIELD_HIT_LINE_OFFSET = 40;

/** Tiempo de aproximación: de la aparición de una nota a la línea de golpe. */
export const PLAYFIELD_APPROACH_MS = 1000;

/**
 * Configuración visual centralizada para opacidades y efectos del renderizador.
 * Ajusta los valores aquí para modificar el aspecto global sin tocar la lógica de dibujo.
 */
export const RENDER_CONFIG = {
  notes: {
    rice: {
      fallingAlpha: 0.85,
      passedAlpha: 0.0,
    },
    ln: {
      /** Opacidad global de la LN mientras cae hacia la línea */
      fallingAlpha: 0.75,
      /** Opacidad global de la LN mientras está siendo pulsada/sostenida */
      holdingAlpha: 0.8,
      /** Opacidad global de la LN una vez que ya pasó su cola */
      passedAlpha: 0.0,
      /** Opacidad del relleno del cuerpo mientras se pulsa (0.0 a 1.0) */
      holdingBodyOpacity: 0.5,
      /** Opacidad del contorno lateral del cuerpo mientras se pulsa (0.0 a 1.0) */
      holdingBorderOpacity: 0.6,
      /** Opacidad de la línea de la cola mientras se pulsa (0.0 a 1.0) */
      holdingTailOpacity: 0.7,
    },
  },
  hitLine: {
    beamHeight: 90,
    /** Intensidad del haz de luz vertical cuando una LN está activa en la línea */
    holdingBeamIntensity: 0.55,
  },
};

/** Estructura de colores de una nota por canal */
export interface LaneSkinColor {
  top: string;
  mid: string;
  bot: string;
  border: string;
  holdBody: string;
}

/** Paleta de colores usada para dibujar el playfield. */
export interface PlayfieldPalette {
  laneSkins: LaneSkinColor[];
  hitLineColor: string;
  background: string;
  separatorColor: string;
}

/** Paletas metálicas estilo skin clásico de mania */
const WHITE_SKIN: LaneSkinColor = {
  top: "#ffffff",
  mid: "#c8ccd0",
  bot: "#8a939e",
  border: "rgba(255, 255, 255, 0.4)",
  holdBody: "rgba(200, 204, 208, 0.4)",
};

const PINK_SKIN: LaneSkinColor = {
  top: "#f7b7d2",
  mid: "#d978a3",
  bot: "#9e446d",
  border: "rgba(247, 183, 210, 0.5)",
  holdBody: "rgba(217, 120, 163, 0.4)",
};

const YELLOW_SKIN: LaneSkinColor = {
  top: "#fff385",
  mid: "#ffd700",
  bot: "#b39200",
  border: "rgba(255, 243, 133, 0.6)",
  holdBody: "rgba(255, 215, 0, 0.4)",
};

const BLUE_SKIN: LaneSkinColor = {
  top: "#9ed2ff",
  mid: "#4f98e8",
  bot: "#225aa0",
  border: "rgba(158, 210, 255, 0.5)",
  holdBody: "rgba(79, 152, 232, 0.4)",
};

/**
 * Genera el esquema de colores clásico por columna para mania.
 * Para 7K: [Blanco, Rosa, Blanco, Amarillo (centro), Blanco, Rosa, Blanco]
 * Para 4K: [Blanco, Rosa, Rosa, Blanco]
 */
export function buildLaneSkins(keyCount: number): LaneSkinColor[] {
  if (keyCount === 7) {
    return [WHITE_SKIN, PINK_SKIN, WHITE_SKIN, YELLOW_SKIN, WHITE_SKIN, PINK_SKIN, WHITE_SKIN];
  }
  if (keyCount === 4) {
    return [WHITE_SKIN, PINK_SKIN, PINK_SKIN, WHITE_SKIN];
  }
  if (keyCount === 6) {
    return [WHITE_SKIN, PINK_SKIN, BLUE_SKIN, BLUE_SKIN, PINK_SKIN, WHITE_SKIN];
  }
  if (keyCount === 8) {
    return [
      WHITE_SKIN,
      PINK_SKIN,
      WHITE_SKIN,
      YELLOW_SKIN,
      YELLOW_SKIN,
      WHITE_SKIN,
      PINK_SKIN,
      WHITE_SKIN,
    ];
  }
  return Array.from({ length: keyCount }, (_, i) => (i % 2 === 0 ? WHITE_SKIN : PINK_SKIN));
}

/**
 * Construye la paleta por defecto del playfield.
 */
export function buildPlayfieldPalette(keyCount: number): PlayfieldPalette {
  return {
    laneSkins: buildLaneSkins(keyCount),
    hitLineColor: "#a3ff38",
    background: "#000000",
    separatorColor: "rgba(255, 255, 255, 0.65)",
  };
}

/**
 * Cache centralizado para gradientes de Canvas.
 * Reduce masivamente la presión del Garbage Collector evitando
 * la creación de objetos CanvasGradient en cada frame.
 */
const gradientCache = new Map<string, CanvasGradient>();

function getNoteGradient(
  ctx: CanvasRenderingContext2D,
  skin: LaneSkinColor,
  noteHeight: number,
): CanvasGradient {
  const key = `note-${skin.top}-${skin.mid}-${skin.bot}-${noteHeight}`;
  let grad = gradientCache.get(key);
  if (!grad) {
    grad = ctx.createLinearGradient(0, 0, 0, noteHeight);
    grad.addColorStop(0, skin.top);
    grad.addColorStop(0.35, skin.mid);
    grad.addColorStop(1, skin.bot);
    gradientCache.set(key, grad);
  }
  return grad;
}

function getBeamGradient(
  ctx: CanvasRenderingContext2D,
  skin: LaneSkinColor,
  beamHeight: number,
  intensity: number,
  scrollDirection: "down" | "up",
): CanvasGradient {
  const intensityKey = intensity.toFixed(2);
  const key = `beam-${skin.top}-${skin.mid}-${beamHeight}-${intensityKey}-${scrollDirection}`;
  let grad = gradientCache.get(key);
  if (!grad) {
    const targetY = scrollDirection === "down" ? -beamHeight : beamHeight;
    grad = ctx.createLinearGradient(0, 0, 0, targetY);
    grad.addColorStop(0, hexToRgba(skin.top, intensity * 0.95));
    grad.addColorStop(0.35, hexToRgba(skin.mid, intensity * 0.5));
    grad.addColorStop(1, hexToRgba(skin.bot, 0));
    gradientCache.set(key, grad);
  }
  return grad;
}

import type { LoadedSkinTextures } from "./skin-manager";

export interface PlayfieldFrameOptions {
  approachMs?: number;
  scrollDirection?: "down" | "up";
  hitGlow?: boolean;
  isPlayMode?: boolean;
  userActiveLanes?: boolean[] | null;
  combo?: number;
  lastBrokenCombo?: number;
  comboBreakTime?: number;
  lastHitTime?: number;
  hitNoteIndices?: Set<number> | null;
  holdingLnIndices?: Set<number> | null;
  comboPositionPercent?: number;
  debugHitWindows?: boolean;
  showLaneSeparators?: boolean;
  noteHeight?: number;
  recentHitErrors?: HitErrorEvent[] | null;
  showHitError?: boolean;
  isCompleted?: boolean;
  lastJudgement?: JudgementEvent | null;
  hitPositionOffset?: number;
  receptorOffset?: number;
  customSkinTextures?: LoadedSkinTextures | null;
  speedTimeline?: SpeedTimeline;
  /** Secciones de BPM para dibujar las líneas guía del editor. */
  timingSections?: readonly TimingSectionInfo[];
  /** Líneas guía por beat (1 = beats/medidas, 4 = 1/4, etc.). */
  beatDivisor?: number;
  /** Nota fantasma que sigue el arrastre en el editor (solo vista previa). */
  dragGhost?: { index: number; column: number; timeMs: number; endTimeMs: number | null } | null;
}

/**
 * Dibuja un fotograma completo del playfield: fondo, carriles, línea de golpe,
 * notas visibles y HUD de combo para el Modo Play.
 */
export function drawPlayfieldFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hitObjects: HitObject[],
  currentTimeMs: number,
  keyCount: number,
  palette: PlayfieldPalette,
  options: PlayfieldFrameOptions | number = PLAYFIELD_APPROACH_MS,
  scrollDirection: "down" | "up" = "down",
  hitGlow: boolean = true,
): void {
  // Compatibilidad hacia atrás si options se pasa como approachMs numérico
  let approachMs = PLAYFIELD_APPROACH_MS;
  let dir = scrollDirection;
  let glow = hitGlow;
  let isPlayMode = false;
  let userActiveLanes: boolean[] | null = null;
  let combo = 0;
  let lastBrokenCombo = 0;
  let comboBreakTime = 0;
  let lastHitTime = 0;
  let hitNoteIndices: Set<number> | null = null;
  let holdingLnIndices: Set<number> | null = null;
  let showLaneSeparators = true;
  let noteHeight = 16;
  let recentHitErrors: HitErrorEvent[] | null = null;
  let showHitError = true;
  let isCompleted = false;
  let lastJudgement: JudgementEvent | null = null;
  let hitPositionOffset = PLAYFIELD_HIT_LINE_OFFSET;
  let receptorOffset = 0;
  let customSkinTextures: LoadedSkinTextures | null = null;
  let speedTimeline: SpeedTimeline | undefined;
  let timingSections: readonly TimingSectionInfo[] | undefined;
  let beatDivisor = 1;
  let dragGhost: {
    index: number;
    column: number;
    timeMs: number;
    endTimeMs: number | null;
  } | null = null;

  if (typeof options === "object") {
    approachMs = options.approachMs ?? PLAYFIELD_APPROACH_MS;
    dir = options.scrollDirection ?? "down";
    glow = options.hitGlow ?? true;
    isPlayMode = options.isPlayMode ?? false;
    userActiveLanes = options.userActiveLanes ?? null;
    combo = options.combo ?? 0;
    lastBrokenCombo = options.lastBrokenCombo ?? 0;
    comboBreakTime = options.comboBreakTime ?? 0;
    lastHitTime = options.lastHitTime ?? 0;
    hitNoteIndices = options.hitNoteIndices ?? null;
    holdingLnIndices = options.holdingLnIndices ?? null;
    showLaneSeparators = options.showLaneSeparators ?? true;
    noteHeight = options.noteHeight ?? 16;
    recentHitErrors = options.recentHitErrors ?? null;
    showHitError = options.showHitError ?? true;
    isCompleted = options.isCompleted ?? false;
    lastJudgement = options.lastJudgement ?? null;
    hitPositionOffset = options.hitPositionOffset ?? PLAYFIELD_HIT_LINE_OFFSET;
    receptorOffset = options.receptorOffset ?? 0;
    customSkinTextures = options.customSkinTextures ?? null;
    speedTimeline = options.speedTimeline;
    timingSections = options.timingSections;
    beatDivisor = options.beatDivisor ?? 1;
    dragGhost = options.dragGhost ?? null;
  } else if (typeof options === "number") {
    approachMs = options;
  }

  const comboPositionPercent =
    typeof options === "object" ? (options.comboPositionPercent ?? 55) : 55;
  const debugHitWindows = typeof options === "object" ? (options.debugHitWindows ?? false) : false;

  const hitLineY = dir === "down" ? height - hitPositionOffset : hitPositionOffset;

  const metrics: PlayfieldMetrics = {
    width,
    height,
    hitLineY,
    topPadding: PLAYFIELD_TOP_PADDING,
    approachMs,
  };

  drawBackground(ctx, width, height, palette);
  if (showLaneSeparators) {
    drawLanes(ctx, width, height, keyCount, palette);
  }

  // Líneas guía (medidas/beats/subdivisiones) por debajo de las notas. Solo se
  // dibujan cuando el editor pasa las secciones de timing.
  if (timingSections && timingSections.length > 0) {
    drawBeatLines(ctx, metrics, currentTimeMs, dir, timingSections, beatDivisor, speedTimeline);
  }

  if (debugHitWindows) {
    drawDebugHitWindows(ctx, hitObjects, currentTimeMs, metrics, keyCount, dir, hitNoteIndices);
  }

  drawHitBeams(
    ctx,
    width,
    height,
    metrics.hitLineY,
    keyCount,
    hitObjects,
    currentTimeMs,
    palette,
    glow,
    dir,
    userActiveLanes,
    speedTimeline,
  );
  drawNotes(
    ctx,
    hitObjects,
    currentTimeMs,
    keyCount,
    metrics,
    palette,
    dir,
    isPlayMode,
    hitNoteIndices,
    holdingLnIndices,
    noteHeight,
    customSkinTextures,
    speedTimeline,
    dragGhost?.index ?? -1,
  );
  drawHitLine(
    ctx,
    width,
    metrics.hitLineY,
    keyCount,
    palette,
    dir,
    userActiveLanes,
    customSkinTextures,
    receptorOffset,
  );

  // Nota fantasma del arrastre en el editor, por encima de las notas reales.
  if (dragGhost !== null) {
    drawDragGhost(
      ctx,
      width,
      keyCount,
      metrics,
      dir,
      noteHeight,
      currentTimeMs,
      dragGhost,
      customSkinTextures,
      speedTimeline,
    );
  }

  if (isPlayMode) {
    drawComboHud(
      ctx,
      width,
      height,
      combo,
      lastBrokenCombo,
      comboBreakTime,
      lastHitTime,
      comboPositionPercent,
    );

    if (lastJudgement) {
      drawJudgement(ctx, width, height, lastJudgement, comboPositionPercent, customSkinTextures);
    }

    if (showHitError && recentHitErrors && recentHitErrors.length > 0) {
      drawHitErrorBar(ctx, width, height, recentHitErrors, comboPositionPercent);
    }

    if (isCompleted) {
      drawStageClear(ctx, width, height, comboPositionPercent);
    }
  }
}

/** Pinta el fondo del playfield. */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: PlayfieldPalette,
): void {
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);
}

/** Pinta las líneas divisorias entre carriles como en el juego original. */
function drawLanes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  keyCount: number,
  palette: PlayfieldPalette,
): void {
  const columnWidth = width / keyCount;
  ctx.save();
  ctx.strokeStyle = palette.separatorColor;
  ctx.lineWidth = 1;

  for (let column = 1; column < keyCount; column += 1) {
    const x = Math.round(column * columnWidth) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  ctx.restore();
}

/** Pinta los haces de luz reactivos de fondo cuando se tocan notas o pulsan teclas. */
function drawHitBeams(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hitLineY: number,
  keyCount: number,
  hitObjects: HitObject[],
  currentTimeMs: number,
  palette: PlayfieldPalette,
  hitGlow: boolean = true,
  scrollDirection: "down" | "up" = "down",
  userActiveLanes: boolean[] | null = null,
  speedTimeline?: SpeedTimeline,
): void {
  // Si el usuario desactivó el resplandor / glow en ajustes, no dibujar haces de luz
  if (!hitGlow) {
    return;
  }

  const columnWidth = width / keyCount;
  const BEAM_HEIGHT = Math.min(180, height * 0.15);

  // Iluminación reactiva (Beams)
  if (userActiveLanes && userActiveLanes.length > 0) {
    for (let col = 0; col < keyCount; col++) {
      if (userActiveLanes[col]) {
        const colX = Math.round(col * columnWidth);
        const actualWidth = Math.round((col + 1) * columnWidth) - colX;
        const skin = palette.laneSkins[col] ?? WHITE_SKIN;

        ctx.save();
        ctx.translate(colX + 1, hitLineY);

        ctx.fillStyle = getBeamGradient(ctx, skin, BEAM_HEIGHT, 1.0, scrollDirection);
        ctx.fillRect(
          0,
          scrollDirection === "down" ? -BEAM_HEIGHT : 0,
          actualWidth - 1,
          BEAM_HEIGHT,
        );

        ctx.restore();
      }
    }
  } else {
    const ATTACK_MS = 50;
    const DECAY_MS = 250;

    // Aquí también usamos búsqueda binaria para no iterar el mapa completo.
    // La ventana de efecto de luz es muy pequeña (-50ms a +250ms).
    // Podemos crear una métrica temporal para findFirstVisibleNoteIndex
    const fakeMetrics = { approachMs: 250, hitLineY, width, height, topPadding: 0 };
    const startIndex = findFirstVisibleNoteIndex(
      hitObjects,
      currentTimeMs,
      fakeMetrics,
      scrollDirection,
      speedTimeline,
    );

    for (let i = startIndex; i < hitObjects.length; i++) {
      const ho = hitObjects[i];
      if (!ho) continue;

      // Si la nota está muy en el futuro, rompemos el bucle
      if (ho.timeMs > currentTimeMs + DECAY_MS) {
        break;
      }

      const isHoldActive =
        ho.endTimeMs !== null && currentTimeMs >= ho.timeMs && currentTimeMs <= ho.endTimeMs;

      const timeDiff = currentTimeMs - ho.timeMs;
      const isInWindow = timeDiff >= -ATTACK_MS && timeDiff <= DECAY_MS;

      if (isHoldActive || isInWindow) {
        const col = Math.min(ho.column, keyCount - 1);
        const colX = Math.round(col * columnWidth);
        const actualWidth = Math.round((col + 1) * columnWidth) - colX;
        const skin = palette.laneSkins[col] ?? WHITE_SKIN;

        let intensity: number;
        if (isHoldActive) {
          intensity = RENDER_CONFIG.hitLine.holdingBeamIntensity;
        } else if (timeDiff < 0) {
          const progress = (timeDiff + ATTACK_MS) / ATTACK_MS;
          intensity = progress * progress * 0.75;
        } else {
          const progress = timeDiff / DECAY_MS;
          const decay = 1 - progress;
          intensity = decay * decay * 0.75;
        }

        if (intensity > 0.01) {
          ctx.save();
          ctx.translate(colX + 1, hitLineY);

          ctx.fillStyle = getBeamGradient(ctx, skin, BEAM_HEIGHT, intensity, scrollDirection);
          ctx.fillRect(
            0,
            scrollDirection === "down" ? -BEAM_HEIGHT : 0,
            actualWidth - 1,
            BEAM_HEIGHT,
          );

          ctx.restore();
        }
      }
    }
  }
}

/** Pinta la línea de golpe o los receptores de la skin (siempre por encima de las notas que caen). */
function drawHitLine(
  ctx: CanvasRenderingContext2D,
  width: number,
  hitLineY: number,
  keyCount: number,
  palette: PlayfieldPalette,
  scrollDirection: "down" | "up" = "down",
  userActiveLanes: boolean[] | null = null,
  customSkinTextures: LoadedSkinTextures | null = null,
  receptorOffset: number = 0,
): void {
  const columnWidth = width / keyCount;

  // 1. Si la skin provee imágenes de receptores
  if (customSkinTextures && customSkinTextures.keyImages.length >= keyCount) {
    for (let col = 0; col < keyCount; col++) {
      const isPressed = userActiveLanes ? !!userActiveLanes[col] : false;
      const keyImg = isPressed
        ? (customSkinTextures.keyImagesD[col] ?? customSkinTextures.keyImages[col])
        : customSkinTextures.keyImages[col];

      const colX = Math.round(col * columnWidth);
      const actualWidth = Math.round((col + 1) * columnWidth) - colX;

      if (keyImg && keyImg.complete && keyImg.naturalWidth > 0) {
        const aspect = keyImg.naturalHeight / keyImg.naturalWidth;
        const imgH = actualWidth * aspect;
        // receptorOffset desplaza el sprite hacia arriba o abajo independientemente del juicio
        const baseImgY = scrollDirection === "down" ? hitLineY - imgH : hitLineY;
        const imgY = baseImgY - receptorOffset;
        ctx.drawImage(keyImg, colX, imgY, actualWidth, imgH);
      }
    }
  } else {
    // Línea verde tradicional
    ctx.fillStyle = palette.hitLineColor;
    ctx.fillRect(0, hitLineY - 1, width, 3);
  }
}

/** Convierte color hex (#ffffff, #ffd700, etc.) a formato rgba string con opacidad. */
function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace("#", "");
  let r = 255;
  let g = 255;
  let b = 255;
  if (cleanHex.length === 6) {
    r = parseInt(cleanHex.slice(0, 2), 16);
    g = parseInt(cleanHex.slice(2, 4), 16);
    b = parseInt(cleanHex.slice(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

/**
 * Color de cada línea guía según su nivel de subdivisión (denominador de la
 * fracción de beat): 1/1 blanco, 1/2 rojo, 1/4 azul, 1/8 amarillo, tresillos verde.
 */
const BEAT_LEVEL_COLORS: Record<number, string> = {
  1: "rgba(255, 255, 255, 0.55)",
  2: "rgba(255, 92, 92, 0.6)",
  4: "rgba(96, 156, 255, 0.6)",
  8: "rgba(250, 204, 21, 0.55)",
  3: "rgba(74, 222, 128, 0.55)",
  6: "rgba(251, 146, 60, 0.55)",
  16: "rgba(192, 132, 252, 0.5)",
};
const DEFAULT_BEAT_LINE_COLOR = "rgba(255, 255, 255, 0.22)";

/**
 * Pinta las líneas guía horizontales usando la misma proyección que las notas,
 * por lo que respetan BPM y SV. Se dibujan por debajo de las notas.
 */
function drawBeatLines(
  ctx: CanvasRenderingContext2D,
  metrics: PlayfieldMetrics,
  currentTimeMs: number,
  scrollDirection: "down" | "up",
  timingSections: readonly TimingSectionInfo[],
  beatDivisor: number,
  speedTimeline?: SpeedTimeline,
): void {
  const speedPxPerMs =
    scrollDirection === "down"
      ? (metrics.hitLineY - metrics.topPadding) / metrics.approachMs
      : (metrics.height - metrics.topPadding - metrics.hitLineY) / metrics.approachMs;

  // Ventana generosa: el filtrado real se hace por posición vertical.
  const windowMs = metrics.approachMs * 3 + 2000;
  const lines = getBeatLinesInRange(
    timingSections,
    currentTimeMs - windowMs,
    currentTimeMs + windowMs,
    beatDivisor,
  );

  ctx.save();
  for (const line of lines) {
    const y = getNoteY(
      line.timeMs,
      currentTimeMs,
      metrics.hitLineY,
      speedPxPerMs,
      scrollDirection,
      speedTimeline,
    );
    if (y < -4 || y > metrics.height + 4) continue;

    ctx.lineWidth = 2;
    ctx.strokeStyle = BEAT_LEVEL_COLORS[line.level] ?? DEFAULT_BEAT_LINE_COLOR;

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(metrics.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Pinta las notas visibles con gradientes estilo metal / arcade. */
function drawNotes(
  ctx: CanvasRenderingContext2D,
  hitObjects: HitObject[],
  currentTimeMs: number,
  keyCount: number,
  metrics: PlayfieldMetrics,
  palette: PlayfieldPalette,
  scrollDirection: "down" | "up" = "down",
  isPlayMode: boolean = false,
  hitNoteIndices: Set<number> | null = null,
  holdingLnIndices: Set<number> | null = null,
  noteHeight: number = 16,
  customSkinTextures: LoadedSkinTextures | null = null,
  speedTimeline?: SpeedTimeline,
  skipNoteIndex: number = -1,
): void {
  const speedPxPerMs =
    scrollDirection === "down"
      ? (metrics.hitLineY - metrics.topPadding) / metrics.approachMs
      : (metrics.height - metrics.topPadding - metrics.hitLineY) / metrics.approachMs;

  const columnWidth = metrics.width / keyCount;
  const noteWidth = Math.max(columnWidth - 2, 2);

  const topBound = 0;
  const bottomBound = metrics.height;

  const startIndex = findFirstVisibleNoteIndex(
    hitObjects,
    currentTimeMs,
    metrics,
    scrollDirection,
    speedTimeline,
  );

  for (let i = startIndex; i < hitObjects.length; i++) {
    const hitObject = hitObjects[i];
    if (!hitObject) {
      continue;
    }

    // La nota que se está arrastrando se oculta: el ghost la representa.
    if (i === skipNoteIndex) {
      continue;
    }

    if (isPlayMode && hitNoteIndices && hitNoteIndices.has(i)) {
      continue;
    }

    const columnIndex = Math.min(hitObject.column, keyCount - 1);
    const noteY = getNoteY(
      hitObject.timeMs,
      currentTimeMs,
      metrics.hitLineY,
      speedPxPerMs,
      scrollDirection,
      speedTimeline,
    );

    const endY =
      hitObject.endTimeMs === null
        ? null
        : getHoldEndY(
            hitObject.endTimeMs,
            currentTimeMs,
            metrics.hitLineY,
            speedPxPerMs,
            scrollDirection,
            speedTimeline,
          );

    if (!isNoteVisible(noteY, endY, topBound, bottomBound)) {
      continue;
    }

    const centerX = getColumnCenterX(columnIndex, keyCount, metrics.width);
    const skin = palette.laneSkins[columnIndex] ?? WHITE_SKIN;

    const customNoteImg = customSkinTextures?.noteImages[columnIndex] ?? null;
    const customNoteHImg = customSkinTextures?.noteImagesH[columnIndex] ?? customNoteImg;
    const customNoteLImg = customSkinTextures?.noteImagesL[columnIndex] ?? null;
    const customNoteTImg = customSkinTextures?.noteImagesT[columnIndex] ?? null;

    if (hitObject.endTimeMs === null) {
      const isPassed =
        scrollDirection === "down" ? noteY > metrics.hitLineY : noteY < metrics.hitLineY;
      ctx.globalAlpha = isPassed
        ? RENDER_CONFIG.notes.rice.passedAlpha
        : RENDER_CONFIG.notes.rice.fallingAlpha;

      if (customNoteImg && customNoteImg.complete && customNoteImg.naturalWidth > 0) {
        drawCustomNoteImage(
          ctx,
          customNoteImg,
          centerX,
          noteY,
          noteWidth,
          noteHeight,
          scrollDirection,
        );
      } else {
        drawNoteBar(ctx, centerX, noteY, noteWidth, skin, noteHeight, scrollDirection);
      }
    } else {
      const isUserHolding = isPlayMode && holdingLnIndices != null && holdingLnIndices.has(i);
      const isFalling = currentTimeMs < hitObject.timeMs;
      const isHolding =
        isUserHolding ||
        (currentTimeMs >= hitObject.timeMs && currentTimeMs <= hitObject.endTimeMs);

      ctx.globalAlpha = isHolding
        ? RENDER_CONFIG.notes.ln.holdingAlpha
        : isFalling
          ? RENDER_CONFIG.notes.ln.fallingAlpha
          : RENDER_CONFIG.notes.ln.passedAlpha;

      const effectiveHeadY = isHolding ? metrics.hitLineY : noteY;
      drawHoldNoteWithSkin(
        ctx,
        centerX,
        effectiveHeadY,
        endY!,
        noteWidth,
        skin,
        isHolding,
        noteHeight,
        scrollDirection,
        customNoteHImg,
        customNoteLImg,
        customNoteTImg,
      );
    }
  }
  ctx.globalAlpha = 1;
}

/** Skin sintética holograma (violeta) para la nota fantasma del arrastre. */
const GHOST_SKIN: LaneSkinColor = {
  top: "#e9d5ff",
  mid: "#a855f7",
  bot: "#7c3aed",
  border: "rgba(233, 213, 255, 0.85)",
  holdBody: "rgba(168, 85, 247, 0.45)",
};

/** Tinte holograma (violeta) que se aplica sobre el asset de la skin al arrastrar. */
const HOLOGRAM_TINT = "rgba(168, 85, 247, 0.6)";

/**
 * Dibuja la nota fantasma que sigue al puntero durante un arrastre en el editor.
 * Usa la misma geometría que una nota real para que el ajuste al beat sea visible.
 */
function drawDragGhost(
  ctx: CanvasRenderingContext2D,
  width: number,
  keyCount: number,
  metrics: PlayfieldMetrics,
  scrollDirection: "down" | "up",
  noteHeight: number,
  currentTimeMs: number,
  ghost: { column: number; timeMs: number; endTimeMs: number | null },
  customSkinTextures: LoadedSkinTextures | null,
  speedTimeline?: SpeedTimeline,
): void {
  const speedPxPerMs =
    scrollDirection === "down"
      ? (metrics.hitLineY - metrics.topPadding) / metrics.approachMs
      : (metrics.height - metrics.topPadding - metrics.hitLineY) / metrics.approachMs;

  const columnIndex = Math.max(0, Math.min(keyCount - 1, ghost.column));
  const centerX = getColumnCenterX(columnIndex, keyCount, width);
  const noteWidth = Math.max(width / keyCount - 2, 2);
  const noteY = getNoteY(
    ghost.timeMs,
    currentTimeMs,
    metrics.hitLineY,
    speedPxPerMs,
    scrollDirection,
    speedTimeline,
  );

  const customNoteImg = customSkinTextures?.noteImages[columnIndex] ?? null;

  ctx.save();
  ctx.globalAlpha = 0.72;
  if (ghost.endTimeMs === null) {
    if (customNoteImg && customNoteImg.complete && customNoteImg.naturalWidth > 0) {
      drawHologramNoteImage(
        ctx,
        customNoteImg,
        centerX,
        noteY,
        noteWidth,
        noteHeight,
        scrollDirection,
      );
    } else {
      drawNoteBar(ctx, centerX, noteY, noteWidth, GHOST_SKIN, noteHeight, scrollDirection);
    }
  } else {
    const endY = getHoldEndY(
      ghost.endTimeMs,
      currentTimeMs,
      metrics.hitLineY,
      speedPxPerMs,
      scrollDirection,
      speedTimeline,
    );
    drawHoldNoteWithSkin(
      ctx,
      centerX,
      noteY,
      endY,
      noteWidth,
      GHOST_SKIN,
      false,
      noteHeight,
      scrollDirection,
      null,
      null,
      null,
    );
  }
  ctx.restore();

  // Línea guía sutil en el Y ajustado para confirmar el snap al beat.
  ctx.save();
  ctx.strokeStyle = "rgba(125, 211, 252, 0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(noteY) + 0.5);
  ctx.lineTo(width, Math.round(noteY) + 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawCustomNoteImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  centerX: number,
  y: number,
  width: number,
  noteHeight: number,
  scrollDirection: "down" | "up",
): void {
  const x = Math.round(centerX - width / 2);
  const aspect = img.naturalHeight / img.naturalWidth;
  const calculatedHeight = Math.max(noteHeight, Math.round(width * aspect));
  const topY = scrollDirection === "down" ? Math.round(y - calculatedHeight) : Math.round(y);
  ctx.drawImage(img, x, topY, width, calculatedHeight);
}

/** Canvas offscreen reutilizable para teñir el asset del ghost sin tocar el fondo. */
let hologramScratchCanvas: HTMLCanvasElement | null = null;

/**
 * Dibuja el asset de la skin de la nota fantasma con un tinte holograma, para
 * distinguirla de las notas reales mientras se arrastra en el editor.
 */
function drawHologramNoteImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  centerX: number,
  y: number,
  width: number,
  noteHeight: number,
  scrollDirection: "down" | "up",
): void {
  const aspect = img.naturalHeight / img.naturalWidth;
  const calculatedHeight = Math.max(noteHeight, Math.round(width * aspect));
  const x = Math.round(centerX - width / 2);
  const topY = scrollDirection === "down" ? Math.round(y - calculatedHeight) : Math.round(y);

  // Se tiñe en un canvas offscreen para que el `source-atop` afecte solo a los
  // píxeles del asset y no al fondo del playfield.
  if (hologramScratchCanvas === null) {
    hologramScratchCanvas = document.createElement("canvas");
  }
  const scratch = hologramScratchCanvas;
  if (scratch.width !== width || scratch.height !== calculatedHeight) {
    scratch.width = width;
    scratch.height = calculatedHeight;
  }
  const scratchCtx = scratch.getContext("2d");
  if (scratchCtx === null) {
    ctx.drawImage(img, x, topY, width, calculatedHeight);
    return;
  }

  scratchCtx.globalCompositeOperation = "source-over";
  scratchCtx.clearRect(0, 0, width, calculatedHeight);
  scratchCtx.drawImage(img, 0, 0, width, calculatedHeight);
  scratchCtx.globalCompositeOperation = "source-atop";
  scratchCtx.fillStyle = HOLOGRAM_TINT;
  scratchCtx.fillRect(0, 0, width, calculatedHeight);

  ctx.drawImage(scratch, x, topY, width, calculatedHeight);
}

function drawHoldNoteWithSkin(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  headY: number,
  tailY: number,
  noteWidth: number,
  skin: LaneSkinColor,
  isHolding: boolean,
  noteHeight: number,
  scrollDirection: "down" | "up",
  headImg: HTMLImageElement | null,
  bodyImg: HTMLImageElement | null,
  tailImg: HTMLImageElement | null,
): void {
  const isCustomHead = headImg && headImg.complete && headImg.naturalWidth > 0;
  const headAspect = isCustomHead ? headImg.naturalHeight / headImg.naturalWidth : 0;
  const headCalculatedHeight = isCustomHead
    ? Math.max(noteHeight, Math.round(noteWidth * headAspect))
    : noteHeight;

  // En osu! mania, el cuerpo de la LN se extiende desde la cola hasta el centro geométrico de la cabeza.
  // La cabeza se renderiza por encima tapando el cuerpo.
  const headCenterY = isCustomHead
    ? scrollDirection === "down"
      ? headY - headCalculatedHeight / 2
      : headY + headCalculatedHeight / 2
    : headY;

  const headBodyEdgeY = headCenterY;

  const isCustomTail = tailImg && tailImg.complete && tailImg.naturalWidth > 0;
  const tailAspect = isCustomTail ? tailImg.naturalHeight / tailImg.naturalWidth : 0;
  const tailCalculatedHeight = isCustomTail
    ? Math.max(noteHeight, Math.round(noteWidth * tailAspect))
    : 2;
  const tailBodyEdgeY = isCustomTail ? (scrollDirection === "down" ? tailY : tailY) : tailY;

  // El cuerpo conecta limpiamente entre la cola y la cabeza
  const bodyTop = Math.min(headBodyEdgeY, tailBodyEdgeY);
  const bodyBottom = Math.max(headBodyEdgeY, tailBodyEdgeY);
  const bodyHeight = Math.max(bodyBottom - bodyTop, 0);
  const x = Math.round(centerX - noteWidth / 2);

  // 1. DIBUJAR CUERPO (Emulación del renderizado de texturas de osu! mania / Percy LN)
  if (bodyHeight > 0) {
    if (bodyImg && bodyImg.complete && bodyImg.naturalWidth > 0) {
      // En osu! mania, si el sprite es más alto que la LN física (ej. Percy LN de 16384px):
      // osu! no estira toda la textura en el espacio pequeño, sino que corta/muestra solo la porción
      // superior o mapea la textura en UV continuo a escala 1:1.
      const srcWidth = bodyImg.naturalWidth;
      const srcHeight = bodyImg.naturalHeight;
      const scale = noteWidth / srcWidth;
      const targetSourceHeight = Math.min(srcHeight, bodyHeight / scale);

      if (scrollDirection === "down") {
        // En downscroll: la parte visible superior de la textura (el remate/borde redondo de Percy)
        // se sitúa en la cola de la LN (arriba)
        ctx.drawImage(
          bodyImg,
          0,
          0,
          srcWidth,
          targetSourceHeight,
          x,
          bodyTop,
          noteWidth,
          bodyHeight,
        );
      } else {
        // En upscroll: se toma desde la base
        const srcY = Math.max(0, srcHeight - targetSourceHeight);
        ctx.drawImage(
          bodyImg,
          0,
          srcY,
          srcWidth,
          targetSourceHeight,
          x,
          bodyTop,
          noteWidth,
          bodyHeight,
        );
      }
    } else {
      ctx.fillStyle = isHolding
        ? hexToRgba(skin.mid, RENDER_CONFIG.notes.ln.holdingBodyOpacity)
        : skin.holdBody;
      ctx.fillRect(x + 2, bodyTop, noteWidth - 4, bodyHeight);

      ctx.fillStyle = isHolding
        ? hexToRgba(skin.top, RENDER_CONFIG.notes.ln.holdingBorderOpacity)
        : skin.border;
      ctx.fillRect(x + 1, bodyTop, 2, bodyHeight);
      ctx.fillRect(x + noteWidth - 3, bodyTop, 2, bodyHeight);
    }
  }

  // 2. DIBUJAR COLA (TAIL)
  if (isCustomTail) {
    const tailYPos = scrollDirection === "down" ? tailY - tailCalculatedHeight : tailY;
    ctx.drawImage(tailImg, x, tailYPos, noteWidth, tailCalculatedHeight);
  } else {
    ctx.fillStyle = isHolding
      ? hexToRgba(skin.top, RENDER_CONFIG.notes.ln.holdingTailOpacity)
      : skin.border;
    ctx.fillRect(x + 1, tailY - 1, noteWidth - 2, 2);
  }

  // 3. DIBUJAR CABEZA (HEAD)
  // Guardamos el contexto para dibujar la cabeza siempre opaca y nítida
  ctx.save();
  ctx.globalAlpha = 1.0;
  if (isCustomHead) {
    drawCustomNoteImage(ctx, headImg, centerX, headY, noteWidth, noteHeight, scrollDirection);
  } else {
    drawNoteBar(ctx, centerX, headY, noteWidth, skin, noteHeight, scrollDirection);
  }
  ctx.restore();
}

/**
 * Dibuja el HUD de combo centrado horizontalmente a la altura configurada del canvas.
 */
function drawComboHud(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  combo: number,
  lastBrokenCombo: number,
  comboBreakTime: number,
  lastHitTime: number,
  comboPositionPercent: number = 55,
): void {
  const centerX = width / 2;
  const baseY = height * (Math.max(25, Math.min(90, comboPositionPercent)) / 100);
  const now = performance.now();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (combo > 0) {
    const timeSinceHit = now - lastHitTime;
    let scale = 1.0;
    if (timeSinceHit < 140) {
      const p = timeSinceHit / 140;
      scale = 1.0 + (1 - p) * 0.18;
    }

    ctx.translate(centerX, baseY);
    ctx.scale(scale, scale);
    ctx.shadowColor = "rgba(255, 255, 255, 0.4)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 36px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText(String(combo), 0, 0);
  } else if (lastBrokenCombo > 0 && now - comboBreakTime < 600) {
    const elapsed = now - comboBreakTime;
    const progress = elapsed / 600;
    const alpha = (1 - progress) * (1 - progress);
    const offsetY = progress * 12;

    ctx.translate(centerX, baseY + offsetY);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(244, 63, 94, 0.5)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#f43f5e";
    ctx.font = "900 32px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText(String(lastBrokenCombo), 0, 0);
  }

  ctx.restore();
}

/**
 * Dibuja el texto flotante de juicio (MAX, PERFECT, GREAT, GOOD, MISS)
 * con micro-animación elástica de impacto y desvanecimiento suave.
 */
function drawJudgement(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  judgement: JudgementEvent,
  comboPositionPercent: number = 55,
  _customSkinTextures: LoadedSkinTextures | null = null,
): void {
  const now = performance.now();
  const elapsed = now - judgement.timestamp;
  const DURATION_MS = 500;

  if (elapsed >= DURATION_MS) {
    return;
  }

  const centerX = width / 2;
  const baseY = height * (Math.max(25, Math.min(90, comboPositionPercent)) / 100) + 32;

  let scale = 1.0;
  if (elapsed < 100) {
    const p = elapsed / 100;
    scale = 1.25 - p * 0.25;
  }

  const progress = elapsed / DURATION_MS;
  const alpha = Math.max(0, 1 - progress * progress);

  let offsetY = -progress * 8;
  let offsetX = 0;
  if (judgement.tier === "MISS") {
    offsetY = progress * 6;
    if (elapsed < 150) {
      offsetX = Math.sin(elapsed * 0.1) * 3 * (1 - elapsed / 150);
    }
  }

  ctx.save();
  ctx.translate(centerX + offsetX, baseY + offsetY);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;

  // Por el momento, usar el MAX / Judge tipográfico por defecto de nuestro proyecto
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let textColor = "#38bdf8";
  let glowColor = "rgba(56, 189, 248, 0.8)";
  const label = judgement.tier;

  switch (judgement.tier) {
    case "MAX":
      textColor = "#38bdf8";
      glowColor = "rgba(56, 189, 248, 0.85)";
      break;
    case "PERFECT":
      textColor = "#fbbf24";
      glowColor = "rgba(251, 191, 36, 0.85)";
      break;
    case "GREAT":
      textColor = "#34d399";
      glowColor = "rgba(52, 211, 153, 0.75)";
      break;
    case "GOOD":
      textColor = "#818cf8";
      glowColor = "rgba(129, 140, 248, 0.75)";
      break;
    case "MISS":
      textColor = "#f43f5e";
      glowColor = "rgba(244, 63, 94, 0.75)";
      break;
  }

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = elapsed < 120 ? 14 : 6;
  ctx.fillStyle = textColor;
  ctx.font = "900 15px 'Inter', system-ui, -apple-system, sans-serif";
  ctx.letterSpacing = "2px";
  ctx.fillText(label, 0, 0);

  ctx.restore();
}

/**
 * Dibuja la barra dinámica y transparente de precisión (Hit Error Bar)
 * anclada debajo del combo. En reposo es 100% invisible; al pulsar teclas
 * dibuja ticks efímeros que indican el desvío exacto en ms (early/late).
 */
function drawHitErrorBar(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  recentHitErrors: HitErrorEvent[],
  comboPositionPercent: number = 55,
): void {
  const now = performance.now();
  const FADE_DURATION_MS = 1200;

  // Filtrar eventos que no hayan expirado
  const activeHits = recentHitErrors.filter((hit) => now - hit.timestamp < FADE_DURATION_MS);
  if (activeHits.length === 0) {
    return;
  }

  const centerX = width / 2;
  const baseY = height * (Math.max(25, Math.min(90, comboPositionPercent)) / 100) + 56;

  const barWidth = 170;
  const halfBar = barWidth / 2;
  const barHeight = 4;

  // Opacidad global de la barra basada en la frescura del hit más reciente
  const mostRecentTime = Math.max(...activeHits.map((h) => h.timestamp));
  const timeSinceLastHit = now - mostRecentTime;
  const baseBarAlpha = Math.max(0, Math.min(1, 1 - timeSinceLastHit / FADE_DURATION_MS));

  ctx.save();

  // 1. Línea base sutil de la barra con degradado suave
  const barGrad = ctx.createLinearGradient(centerX - halfBar, 0, centerX + halfBar, 0);
  barGrad.addColorStop(0, "rgba(56, 189, 248, 0)"); // azul transparente en los extremos
  barGrad.addColorStop(0.2, `rgba(56, 189, 248, ${0.35 * baseBarAlpha})`); // Early
  barGrad.addColorStop(0.5, `rgba(255, 255, 255, ${0.65 * baseBarAlpha})`); // Center
  barGrad.addColorStop(0.8, `rgba(249, 115, 22, ${0.35 * baseBarAlpha})`); // Late
  barGrad.addColorStop(1, "rgba(249, 115, 22, 0)"); // naranja transparente en los extremos

  ctx.fillStyle = barGrad;
  ctx.fillRect(centerX - halfBar, baseY - barHeight / 2, barWidth, barHeight);

  // 2. Marca guía central (0ms / Perfect)
  ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * baseBarAlpha})`;
  ctx.fillRect(centerX - 1, baseY - 6, 2, 12);

  // 3. Ticks de los hits recientes
  for (let i = 0; i < activeHits.length; i++) {
    const hit = activeHits[i];
    if (!hit) {
      continue;
    }
    const age = now - hit.timestamp;
    const progress = age / FADE_DURATION_MS;
    const alpha = Math.max(0, 1 - progress);

    // Clampear el error dentro de la ventana de hit
    const clampedError = Math.max(-HIT_WINDOW_MS, Math.min(HIT_WINDOW_MS, hit.errorMs));
    const ratio = clampedError / HIT_WINDOW_MS; // -1.0 a +1.0
    const tickX = Math.round(centerX + ratio * (halfBar - 4));

    // Determinar color según precisión
    const absError = Math.abs(hit.errorMs);
    let tickColor: string;
    let glowColor: string;

    if (absError <= 22) {
      // Perfect / Exacto: Dorado brillante
      tickColor = `rgba(251, 191, 36, ${alpha})`;
      glowColor = "rgba(251, 191, 36, 0.6)";
    } else if (hit.errorMs < 0) {
      // Early / Temprano: Azul cian
      tickColor = `rgba(56, 189, 248, ${alpha})`;
      glowColor = "rgba(56, 189, 248, 0.5)";
    } else {
      // Late / Tarde: Naranja / Rojo suave
      tickColor = `rgba(249, 115, 22, ${alpha})`;
      glowColor = "rgba(249, 115, 22, 0.5)";
    }

    ctx.fillStyle = tickColor;
    if (age < 200) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 6;
    } else {
      ctx.shadowBlur = 0;
    }

    // Tick vertical nítido de 2px de ancho
    ctx.fillRect(tickX - 1, baseY - 5, 2, 10);
  }

  ctx.restore();
}

/**
 * Dibuja un banner flotante y estilizado de "STAGE CLEAR" / "MAPA COMPLETADO"
 * cuando la canción finaliza mientras se está en Modo Play.
 */
function drawStageClear(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  comboPositionPercent: number = 55,
): void {
  const centerX = width / 2;
  // Subir el banner significativamente para que quede despejado arriba del combo (-95px)
  const baseY = height * (Math.max(25, Math.min(90, comboPositionPercent)) / 100) - 95;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Sombra brillante en tono esmeralda / dorado
  ctx.shadowColor = "rgba(16, 185, 129, 0.6)";
  ctx.shadowBlur = 20;

  // Texto principal
  ctx.fillStyle = "#10b981";
  ctx.font = "900 30px 'Inter', system-ui, -apple-system, sans-serif";
  ctx.fillText("STAGE CLEAR", centerX, baseY);

  // Subtexto instructivo
  ctx.shadowBlur = 6;
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = "700 12px 'Inter', system-ui, sans-serif";
  ctx.letterSpacing = "2px";
  ctx.fillText("Esc para salir", centerX, baseY + 28);

  ctx.restore();
}

/** Dibuja la barra rectangular metálica de una nota con borde iluminado. */
function drawNoteBar(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  y: number,
  noteWidth: number,
  skin: LaneSkinColor,
  noteHeight: number = 16,
  scrollDirection: "down" | "up" = "down",
): void {
  const x = Math.round(centerX - noteWidth / 2);
  const topY = scrollDirection === "down" ? Math.round(y - noteHeight) : Math.round(y);

  ctx.save();
  ctx.translate(x, topY);

  ctx.fillStyle = getNoteGradient(ctx, skin, noteHeight);
  ctx.fillRect(0, 0, noteWidth, noteHeight);

  // Borde fino superior de brillo
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.fillRect(0, 0, noteWidth, 2);

  // Borde fino inferior de sombra
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(0, noteHeight - 2, noteWidth, 2);

  ctx.restore();
}

/**
 * Dibuja rectángulos rojos semitransparentes en cada carril indicando la zona
 * donde pulsar una tecla es VÁLIDO (±140ms de cada nota).
 * Cualquier pulsación FUERA de estos rectángulos se penaliza como miss por ghost tap.
 */
function drawDebugHitWindows(
  ctx: CanvasRenderingContext2D,
  hitObjects: HitObject[],
  currentTimeMs: number,
  metrics: PlayfieldMetrics,
  keyCount: number,
  scrollDirection: "down" | "up",
  hitNoteIndices: Set<number> | null,
): void {
  const speedPxPerMs =
    scrollDirection === "down"
      ? (metrics.hitLineY - metrics.topPadding) / metrics.approachMs
      : (metrics.height - metrics.topPadding - metrics.hitLineY) / metrics.approachMs;

  const columnWidth = metrics.width / keyCount;
  const laneWidth = Math.max(columnWidth - 2, 2);
  const HIT_WINDOW_MS = 140;

  ctx.save();

  const startIndex = findFirstVisibleNoteIndex(hitObjects, currentTimeMs, metrics, scrollDirection);

  for (let i = startIndex; i < hitObjects.length; i++) {
    // Si la nota ya fue juzgada, no dibujar su zona de hit
    if (hitNoteIndices && hitNoteIndices.has(i)) {
      continue;
    }

    const note = hitObjects[i];
    if (!note) {
      continue;
    }

    // Si la nota está muy en el futuro, no será visible
    if (note.timeMs > currentTimeMs + metrics.approachMs + HIT_WINDOW_MS + 2000) {
      break;
    }
    const columnIndex = Math.min(note.column, keyCount - 1);
    const centerX = getColumnCenterX(columnIndex, keyCount, metrics.width);
    const x = Math.round(centerX - laneWidth / 2);

    // Calcular la posición Y del límite temprano (-140ms) y límite tardío (+140ms)
    const earlyTime = note.timeMs - HIT_WINDOW_MS;
    const lateTime = note.timeMs + HIT_WINDOW_MS;

    const yEarly = getNoteY(
      earlyTime,
      currentTimeMs,
      metrics.hitLineY,
      speedPxPerMs,
      scrollDirection,
    );
    const yLate = getNoteY(
      lateTime,
      currentTimeMs,
      metrics.hitLineY,
      speedPxPerMs,
      scrollDirection,
    );

    const top = Math.min(yEarly, yLate);
    const bottom = Math.max(yEarly, yLate);
    const height = Math.max(bottom - top, 2);

    // Descarte si está completamente fuera de pantalla
    if (bottom < -60 || top > metrics.height + 60) {
      continue;
    }

    // Rectángulo rojo semitransparente con borde nítido
    ctx.fillStyle = "rgba(239, 68, 68, 0.18)";
    ctx.fillRect(x, top, laneWidth, height);

    ctx.strokeStyle = "rgba(239, 68, 68, 0.65)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, top + 0.5, laneWidth - 1, height - 1);
  }

  ctx.restore();
}
