import type { HitObject } from "../../../src/core/osu/types";
import {
  getColumnCenterX,
  getHoldEndY,
  getNoteY,
  getVisibleHitObjects,
  isNoteVisible,
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
  } else if (typeof options === "number") {
    approachMs = options;
  }

  const comboPositionPercent =
    typeof options === "object" ? options.comboPositionPercent ?? 55 : 55;
  const debugHitWindows =
    typeof options === "object" ? options.debugHitWindows ?? false : false;

  const hitLineY =
    dir === "down" ? height - PLAYFIELD_HIT_LINE_OFFSET : PLAYFIELD_HIT_LINE_OFFSET;

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

  // Dibujar zonas de debug de ventana de golpe si está activo
  if (debugHitWindows) {
    drawDebugHitWindows(
      ctx,
      hitObjects,
      currentTimeMs,
      metrics,
      keyCount,
      dir,
      hitNoteIndices,
    );
  }

  drawHitLine(
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
  );
  drawNotes(
    ctx,
    hitObjects,
    currentTimeMs,
    metrics,
    keyCount,
    palette,
    dir,
    hitNoteIndices,
    holdingLnIndices,
    isPlayMode,
    noteHeight,
  );

  // Si está en Modo Play, dibujar el HUD de Combo a la altura configurada
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

/** Pinta la línea de golpe y el degradado vertical suave coloreado por carril al golpear notas o pulsar teclas. */
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
  userActiveLanes: boolean[] | null = null,
): void {
  const columnWidth = width / keyCount;
  const BEAM_HEIGHT = 90;

  // 1. Si estamos en Modo Play y el usuario está pulsando teclas, dibujar los rayos de pulsación activa
  if (userActiveLanes && userActiveLanes.length > 0) {
    for (let col = 0; col < keyCount; col++) {
      if (userActiveLanes[col]) {
        const colX = Math.round(col * columnWidth);
        const actualWidth = Math.round((col + 1) * columnWidth) - colX;
        const skin = palette.laneSkins[col] ?? WHITE_SKIN;

        const targetY =
          scrollDirection === "down" ? hitLineY - BEAM_HEIGHT : hitLineY + BEAM_HEIGHT;
        const beamGrad = ctx.createLinearGradient(0, hitLineY, 0, targetY);

        beamGrad.addColorStop(0, hexToRgba(skin.top, 0.95));
        beamGrad.addColorStop(0.35, hexToRgba(skin.mid, 0.5));
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
  } else if (hitGlow) {
    // 2. Modo Preview clásico (Autoplay): evaluamos notas próximas a la línea de golpe
    const ATTACK_MS = 50; // Entrada suave (fade-in)
    const DECAY_MS = 250; // Salida progresiva suave (fade-out)

    for (const ho of hitObjects) {
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
          const targetY =
            scrollDirection === "down" ? hitLineY - BEAM_HEIGHT : hitLineY + BEAM_HEIGHT;
          const beamGrad = ctx.createLinearGradient(0, hitLineY, 0, targetY);

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
  hitNoteIndices: Set<number> | null = null,
  holdingLnIndices: Set<number> | null = null,
  isPlayMode: boolean = false,
  noteHeight: number = 16,
): void {
  const speedPxPerMs =
    scrollDirection === "down"
      ? (metrics.hitLineY - metrics.topPadding) / metrics.approachMs
      : (metrics.height - metrics.topPadding - metrics.hitLineY) / metrics.approachMs;

  const columnWidth = metrics.width / keyCount;
  // Margen de 1px a cada lado para respetar las líneas divisoras
  const noteWidth = Math.max(columnWidth - 2, 2);

  const topBound = -60;
  const bottomBound = metrics.height + 60;

  for (let i = 0; i < hitObjects.length; i++) {
    const hitObject = hitObjects[i];

    // En modo play, si la nota ya fue juzgada y oculta, no dibujarla
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
    );

    // Calcular posición final de la LN si aplica
    const endY =
      hitObject.endTimeMs === null
        ? null
        : getHoldEndY(
            hitObject.endTimeMs,
            currentTimeMs,
            metrics.hitLineY,
            speedPxPerMs,
            scrollDirection,
          );

    // Descarte rápido de notas fuera de pantalla (culling)
    if (!isNoteVisible(noteY, endY, topBound, bottomBound)) {
      continue;
    }

    const centerX = getColumnCenterX(columnIndex, keyCount, metrics.width);
    const skin = palette.laneSkins[columnIndex] ?? WHITE_SKIN;

    if (hitObject.endTimeMs === null) {
      // Nota normal (Rice note)
      const isPassed =
        scrollDirection === "down" ? noteY > metrics.hitLineY : noteY < metrics.hitLineY;
      ctx.globalAlpha = isPassed
        ? RENDER_CONFIG.notes.rice.passedAlpha
        : RENDER_CONFIG.notes.rice.fallingAlpha;
      drawNoteBar(ctx, centerX, noteY, noteWidth, skin, noteHeight);
    } else {
      // Hold Note (LN)
      // En Modo Play: si el usuario la está sosteniendo activamente, forzar estado "holding"
      const isUserHolding = isPlayMode && holdingLnIndices != null && holdingLnIndices.has(i);
      const isFalling = currentTimeMs < hitObject.timeMs;
      const isHolding = isUserHolding ||
        (currentTimeMs >= hitObject.timeMs && currentTimeMs <= hitObject.endTimeMs);

      if (isHolding) {
        // Presionada: Color y brillo configurables, head fija en la hit line
        ctx.globalAlpha = RENDER_CONFIG.notes.ln.holdingAlpha;
        const effectiveHeadY = metrics.hitLineY;
        drawHoldNoteBar(ctx, centerX, effectiveHeadY, endY!, noteWidth, skin, true, noteHeight);
      } else if (isFalling) {
        // Cayendo: Opacidad configurable
        ctx.globalAlpha = RENDER_CONFIG.notes.ln.fallingAlpha;
        drawHoldNoteBar(ctx, centerX, noteY, endY!, noteWidth, skin, false, noteHeight);
      } else {
        // Ya completada / Pasada
        ctx.globalAlpha = RENDER_CONFIG.notes.ln.passedAlpha;
        drawHoldNoteBar(ctx, centerX, noteY, endY!, noteWidth, skin, false, noteHeight);
      }
    }
  }
  ctx.globalAlpha = 1;
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
  // Altura configurable (por defecto 55% del alto, bien visible en zona de lectura)
  const baseY = height * (Math.max(25, Math.min(90, comboPositionPercent)) / 100);
  const now = performance.now();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (combo > 0) {
    // 1. Combo Activo con micro-escala elástica tras conectar nota
    const timeSinceHit = now - lastHitTime;
    let scale = 1.0;
    if (timeSinceHit < 140) {
      const p = timeSinceHit / 140;
      scale = 1.0 + (1 - p) * 0.18; // 1.18 -> 1.0
    }

    ctx.translate(centerX, baseY);
    ctx.scale(scale, scale);

    // Sombra de resplandor sutil estilo mania
    ctx.shadowColor = "rgba(255, 255, 255, 0.4)";
    ctx.shadowBlur = 12;

    // Número del Combo
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 36px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText(String(combo), 0, -8);

    // Etiqueta "COMBO"
    ctx.shadowBlur = 4;
    ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
    ctx.font = "800 11px 'Inter', system-ui, sans-serif";
    ctx.letterSpacing = "3px";
    ctx.fillText("COMBO", 0, 16);
  } else if (lastBrokenCombo > 0 && now - comboBreakTime < 600) {
    // 2. Animación de Combo Roto (decremento y desvanecimiento suave a 0)
    const elapsed = now - comboBreakTime;
    const progress = elapsed / 600; // 0.0 -> 1.0
    const alpha = (1 - progress) * (1 - progress); // fade out cuadrático
    const offsetY = progress * 12; // sutil caída de 12px

    ctx.translate(centerX, baseY + offsetY);

    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(244, 63, 94, 0.5)";
    ctx.shadowBlur = 8;

    // Número anterior desvaneciéndose en color rojo/rosado suave
    ctx.fillStyle = "#f43f5e";
    ctx.font = "900 32px 'Inter', system-ui, -apple-system, sans-serif";
    ctx.fillText(String(lastBrokenCombo), 0, -8);

    ctx.fillStyle = "rgba(244, 63, 94, 0.7)";
    ctx.font = "800 11px 'Inter', system-ui, sans-serif";
    ctx.letterSpacing = "3px";
    ctx.fillText("MISS", 0, 16);
  }

  ctx.restore();
}

/** Dibuja una nota normal con efecto 3D metálico con brillo superior y base más oscura. */
function drawNoteBar(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  y: number,
  noteWidth: number,
  skin: LaneSkinColor,
  noteHeight: number = 16,
): void {
  const x = Math.round(centerX - noteWidth / 2);
  const topY = Math.round(y - noteHeight / 2);

  const grad = ctx.createLinearGradient(0, topY, 0, topY + noteHeight);
  grad.addColorStop(0, skin.top);
  grad.addColorStop(0.35, skin.mid);
  grad.addColorStop(1, skin.bot);

  ctx.fillStyle = grad;
  ctx.fillRect(x, topY, noteWidth, noteHeight);

  // Borde fino superior de brillo
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.fillRect(x, topY, noteWidth, 2);

  // Borde fino inferior de sombra
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(x, topY + noteHeight - 2, noteWidth, 2);
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
  noteHeight: number = 16,
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
  drawNoteBar(ctx, centerX, headY, noteWidth, skin, noteHeight);
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

  for (let i = 0; i < hitObjects.length; i++) {
    // Si la nota ya fue juzgada, no dibujar su zona de hit
    if (hitNoteIndices && hitNoteIndices.has(i)) {
      continue;
    }

    const note = hitObjects[i];
    const columnIndex = Math.min(note.column, keyCount - 1);
    const centerX = getColumnCenterX(columnIndex, keyCount, metrics.width);
    const x = Math.round(centerX - laneWidth / 2);

    // Calcular la posición Y del límite temprano (-140ms) y límite tardío (+140ms)
    const earlyTime = note.timeMs - HIT_WINDOW_MS;
    const lateTime = note.timeMs + HIT_WINDOW_MS;

    const yEarly = getNoteY(earlyTime, currentTimeMs, metrics.hitLineY, speedPxPerMs, scrollDirection);
    const yLate = getNoteY(lateTime, currentTimeMs, metrics.hitLineY, speedPxPerMs, scrollDirection);

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
