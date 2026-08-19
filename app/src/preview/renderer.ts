import type { HitObject } from "../../../src/core/osu/types";
import {
  getColumnCenterX,
  getHoldEndY,
  getNoteY,
  getVisibleHitObjects,
  type PlayfieldMetrics,
} from "./preview-math";

/** Espacio vacío en la parte superior del playfield donde aparecen las notas. */
export const PLAYFIELD_TOP_PADDING = 60;

/** Altura de la línea de golpe medida desde el borde inferior del playfield. */
export const PLAYFIELD_HIT_LINE_OFFSET = 40;

/** Tiempo de aproximación: de la aparición de una nota a la línea de golpe. */
export const PLAYFIELD_APPROACH_MS = 1000;

/** Altura de una nota normal dibujada en píxeles. */
const NOTE_HEIGHT = 16;

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
      holdingAlpha: 0.80,
      /** Opacidad global de la LN una vez que ya pasó su cola */
      passedAlpha: 0.0,
      /** Opacidad del relleno del cuerpo mientras se pulsa (0.0 a 1.0) */
      holdingBodyOpacity: 0.50,
      /** Opacidad del contorno lateral del cuerpo mientras se pulsa (0.0 a 1.0) */
      holdingBorderOpacity: 0.60,
      /** Opacidad de la línea de la cola mientras se pulsa (0.0 a 1.0) */
      holdingTailOpacity: 0.70,
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
 * Dibuja un fotograma completo del playfield: fondo, carriles, línea de golpe
 * y notas visibles en el instante actual.
 */
export function drawPlayfieldFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hitObjects: HitObject[],
  currentTimeMs: number,
  keyCount: number,
  palette: PlayfieldPalette,
  approachMs: number = PLAYFIELD_APPROACH_MS,
  scrollDirection: "down" | "up" = "down",
  hitGlow: boolean = true,
): void {
  const hitLineY =
    scrollDirection === "down" ? height - PLAYFIELD_HIT_LINE_OFFSET : PLAYFIELD_HIT_LINE_OFFSET;

  const metrics: PlayfieldMetrics = {
    width,
    height,
    hitLineY,
    topPadding: PLAYFIELD_TOP_PADDING,
    approachMs,
  };
  drawBackground(ctx, width, height, palette);
  drawLanes(ctx, width, height, keyCount, palette);
  drawHitLine(
    ctx,
    width,
    height,
    metrics.hitLineY,
    keyCount,
    hitObjects,
    currentTimeMs,
    palette,
    hitGlow,
    scrollDirection,
  );
  drawNotes(ctx, hitObjects, currentTimeMs, metrics, keyCount, palette, scrollDirection);
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
  ctx.strokeStyle = palette.separatorColor;
  ctx.lineWidth = 1;

  for (let column = 0; column <= keyCount; column += 1) {
    const x = Math.round(column * columnWidth) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}

/** Pinta la línea de golpe y el degradado vertical suave coloreado por carril al golpear notas. */
function drawHitLine(
  ctx: CanvasRenderingContext2D,
  width: number,
  _height: number,
  hitLineY: number,
  keyCount: number,
  hitObjects: HitObject[],
  currentTimeMs: number,
  palette: PlayfieldPalette,
  hitGlow: boolean = true,
  scrollDirection: "down" | "up" = "down",
): void {
  const columnWidth = width / keyCount;

  // Si hitGlow está activado, dibujamos el degradado suave y fluido por carril
  if (hitGlow) {
    const ATTACK_MS = 50; // Entrada suave (fade-in)
    const DECAY_MS = 250; // Salida progresiva suave (fade-out)
    const BEAM_HEIGHT = 90;

    for (const ho of hitObjects) {
      const isHoldActive =
        ho.endTimeMs !== null && currentTimeMs >= ho.timeMs && currentTimeMs <= ho.endTimeMs;

      // Evaluamos notas desde un poco antes de la línea para entrada anticipada suave
      const timeDiff = currentTimeMs - ho.timeMs;
      const isInWindow = timeDiff >= -ATTACK_MS && timeDiff <= DECAY_MS;

      if (isHoldActive || isInWindow) {
        const col = Math.min(ho.column, keyCount - 1);
        const colX = Math.round(col * columnWidth);
        const actualWidth = Math.round((col + 1) * columnWidth) - colX;
        const skin = palette.laneSkins[col] ?? WHITE_SKIN;

        let intensity: number;
        if (isHoldActive) {
          // Durante la hold note se mantiene estable con brillo suave configurable
          intensity = RENDER_CONFIG.hitLine.holdingBeamIntensity;
        } else if (timeDiff < 0) {
          // Fase 1: Fade-in suave al aproximarse a la línea
          const progress = (timeDiff + ATTACK_MS) / ATTACK_MS;
          intensity = progress * progress * 0.75;
        } else {
          // Fase 2: Fade-out cuadrático suave al alejarse
          const progress = timeDiff / DECAY_MS;
          const decay = 1 - progress;
          intensity = decay * decay * 0.75;
        }

        if (intensity > 0.01) {
          const targetY =
            scrollDirection === "down" ? hitLineY - BEAM_HEIGHT : hitLineY + BEAM_HEIGHT;
          const beamGrad = ctx.createLinearGradient(0, hitLineY, 0, targetY);

          // Degradado recto usando el color del carril
          beamGrad.addColorStop(0, hexToRgba(skin.top, intensity * 0.95));
          beamGrad.addColorStop(0.35, hexToRgba(skin.mid, intensity * 0.5));
          beamGrad.addColorStop(1, hexToRgba(skin.bot, 0));

          ctx.fillStyle = beamGrad;
          ctx.fillRect(
            colX + 1,
            scrollDirection === "down" ? hitLineY - BEAM_HEIGHT : hitLineY,
            actualWidth - 1,
            BEAM_HEIGHT,
          );
        }
      }
    }

    // Glow base verde sutil de la línea
    ctx.fillStyle = "rgba(163, 255, 56, 0.25)";
    ctx.fillRect(0, hitLineY - 4, width, 9);
  }

  // Línea principal
  ctx.fillStyle = palette.hitLineColor;
  ctx.fillRect(0, hitLineY - 1, width, 3);
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

/** Pinta las notas visibles con gradientes estilo metal / arcade. */
function drawNotes(
  ctx: CanvasRenderingContext2D,
  hitObjects: HitObject[],
  currentTimeMs: number,
  metrics: PlayfieldMetrics,
  keyCount: number,
  palette: PlayfieldPalette,
  scrollDirection: "down" | "up" = "down",
): void {
  const speedPxPerMs =
    scrollDirection === "down"
      ? (metrics.hitLineY - metrics.topPadding) / metrics.approachMs
      : (metrics.height - metrics.topPadding - metrics.hitLineY) / metrics.approachMs;

  const visible = getVisibleHitObjects(hitObjects, currentTimeMs, metrics, scrollDirection);
  const columnWidth = metrics.width / keyCount;
  // Margen de 1px a cada lado para respetar las líneas divisoras
  const noteWidth = Math.max(columnWidth - 2, 2);

  for (const hitObject of visible) {
    const columnIndex = Math.min(hitObject.column, keyCount - 1);
    const centerX = getColumnCenterX(columnIndex, keyCount, metrics.width);
    const noteY = getNoteY(
      hitObject.timeMs,
      currentTimeMs,
      metrics.hitLineY,
      speedPxPerMs,
      scrollDirection,
    );
    const skin = palette.laneSkins[columnIndex] ?? WHITE_SKIN;

    if (hitObject.endTimeMs === null) {
      // Nota normal (Rice note)
      const isPassed =
        scrollDirection === "down" ? noteY > metrics.hitLineY : noteY < metrics.hitLineY;
      ctx.globalAlpha = isPassed
        ? RENDER_CONFIG.notes.rice.passedAlpha
        : RENDER_CONFIG.notes.rice.fallingAlpha;
      drawNoteBar(ctx, centerX, noteY, noteWidth, skin);
    } else {
      // Hold Note (LN)
      const isFalling = currentTimeMs < hitObject.timeMs;
      const isHolding =
        currentTimeMs >= hitObject.timeMs && currentTimeMs <= hitObject.endTimeMs;

      const endY = getHoldEndY(
        hitObject.endTimeMs,
        currentTimeMs,
        metrics.hitLineY,
        speedPxPerMs,
        scrollDirection,
      );

      if (isHolding) {
        // Presionada: Color y brillo configurables
        ctx.globalAlpha = RENDER_CONFIG.notes.ln.holdingAlpha;
        const effectiveHeadY = metrics.hitLineY;
        drawHoldNoteBar(ctx, centerX, effectiveHeadY, endY, noteWidth, skin, true);
      } else if (isFalling) {
        // Cayendo: Opacidad configurable
        ctx.globalAlpha = RENDER_CONFIG.notes.ln.fallingAlpha;
        drawHoldNoteBar(ctx, centerX, noteY, endY, noteWidth, skin, false);
      } else {
        // Ya completada / Pasada
        ctx.globalAlpha = RENDER_CONFIG.notes.ln.passedAlpha;
        drawHoldNoteBar(ctx, centerX, noteY, endY, noteWidth, skin, false);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** Dibuja una nota normal con efecto 3D metálico con brillo superior y base más oscura. */
function drawNoteBar(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  y: number,
  noteWidth: number,
  skin: LaneSkinColor,
): void {
  const x = Math.round(centerX - noteWidth / 2);
  const topY = Math.round(y - NOTE_HEIGHT / 2);

  const grad = ctx.createLinearGradient(0, topY, 0, topY + NOTE_HEIGHT);
  grad.addColorStop(0, skin.top);
  grad.addColorStop(0.35, skin.mid);
  grad.addColorStop(1, skin.bot);

  ctx.fillStyle = grad;
  ctx.fillRect(x, topY, noteWidth, NOTE_HEIGHT);

  // Borde fino superior de brillo
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.fillRect(x, topY, noteWidth, 2);

  // Borde fino inferior de sombra
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(x, topY + NOTE_HEIGHT - 2, noteWidth, 2);
}

/** Dibuja una hold note con cuerpo translúcido y cabeza metálica. */
function drawHoldNoteBar(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  headY: number,
  tailY: number,
  noteWidth: number,
  skin: LaneSkinColor,
  isHolding: boolean = false,
): void {
  const x = Math.round(centerX - noteWidth / 2);
  const top = Math.min(headY, tailY);
  const bottom = Math.max(headY, tailY);
  const height = Math.max(bottom - top, 1);

  // Cuerpo de la hold note
  ctx.fillStyle = isHolding
    ? hexToRgba(skin.mid, RENDER_CONFIG.notes.ln.holdingBodyOpacity)
    : skin.holdBody;
  ctx.fillRect(x + 2, top, noteWidth - 4, height);

  // Bordes laterales sutiles del cuerpo
  ctx.fillStyle = isHolding
    ? hexToRgba(skin.top, RENDER_CONFIG.notes.ln.holdingBorderOpacity)
    : skin.border;
  ctx.fillRect(x + 1, top, 2, height);
  ctx.fillRect(x + noteWidth - 3, top, 2, height);

  // Cola sutil de la hold note
  ctx.fillStyle = isHolding
    ? hexToRgba(skin.top, RENDER_CONFIG.notes.ln.holdingTailOpacity)
    : skin.border;
  ctx.fillRect(x + 1, tailY - 1, noteWidth - 2, 2);

  // Cabeza de la nota
  drawNoteBar(ctx, centerX, headY, noteWidth, skin);
}
