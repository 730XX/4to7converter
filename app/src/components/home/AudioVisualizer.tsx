import { useEffect, useRef, useState } from "react";

export interface VisualizerPalette {
  centerRgb: [number, number, number];
  edgeRgb: [number, number, number];
}

export const DEFAULT_PALETTE: VisualizerPalette = {
  centerRgb: [255, 255, 255], // White
  edgeRgb: [180, 180, 180],   // Light grey
};

export interface AudioVisualizerProps {
  audioElement?: HTMLAudioElement | null;
  analyserNode?: AnalyserNode | null;
  isPlaying: boolean;
  barCount?: number;
  width?: number;
  height?: number;
  coverImageUrl?: string | null;
  onPaletteChange?: (palette: VisualizerPalette) => void;
}

let globalAudioCtx: AudioContext | null = null;
let globalAnalyser: AnalyserNode | null = null;
let connectedElement: HTMLAudioElement | null = null;

export function AudioVisualizer({
  audioElement,
  analyserNode,
  isPlaying,
  barCount = 26,
  width = 140,
  height = 28,
  coverImageUrl,
  onPaletteChange,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [palette, setPalette] = useState<VisualizerPalette>(DEFAULT_PALETTE);
  const onPaletteChangeRef = useRef(onPaletteChange);

  useEffect(() => {
    onPaletteChangeRef.current = onPaletteChange;
  }, [onPaletteChange]);

  // Extraer el color dominante y vibrante de la imagen del mapa (Jacket)
  useEffect(() => {
    if (!coverImageUrl) {
      setPalette(DEFAULT_PALETTE);
      onPaletteChangeRef.current?.(DEFAULT_PALETTE);
      return;
    }

    let isCancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = coverImageUrl;

    img.onload = () => {
      if (isCancelled) return;
      try {
        const offCanvas = document.createElement("canvas");
        const SAMPLES = 32;
        offCanvas.width = SAMPLES;
        offCanvas.height = SAMPLES;
        const ctx = offCanvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, SAMPLES, SAMPLES);
        const data = ctx.getImageData(0, 0, SAMPLES, SAMPLES).data;

        // Cuantización de matices (24 cubetas de 15 grados en el círculo cromático HSL)
        const NUM_BINS = 24;
        const binWeights = new Float32Array(NUM_BINS);
        const binHues = new Float32Array(NUM_BINS);
        const binSats = new Float32Array(NUM_BINS);
        const binLights = new Float32Array(NUM_BINS);

        for (let i = 0; i < data.length; i += 4) {
          const r = (data[i] ?? 0) / 255;
          const g = (data[i + 1] ?? 0) / 255;
          const b = (data[i + 2] ?? 0) / 255;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const delta = max - min;
          const lightness = (max + min) / 2;

          // Descartar negros profundos, blancos puros
          if (lightness < 0.10 || lightness > 0.95) continue;
          
          const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
          // Reducido de 0.20 a 0.10 para no ignorar colores sepia/marrones
          if (saturation < 0.10) continue; 

          // Calcular Hue (0 - 360)
          let hue = 0;
          if (delta !== 0) {
            if (max === r) {
              hue = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
            } else if (max === g) {
              hue = ((b - r) / delta + 2) * 60;
            } else {
              hue = ((r - g) / delta + 4) * 60;
            }
          }

          const bin = Math.min(NUM_BINS - 1, Math.floor((hue % 360) / (360 / NUM_BINS)));
          
          // Peso moderado para la saturación para evitar que píxeles aislados dominen
          let weight = saturation + 0.1;
          // Mayor peso a tonos bien iluminados
          if (lightness > 0.2 && lightness < 0.8) weight *= 1.5;

          binWeights[bin] = binWeights[bin]! + weight;
          binHues[bin] = binHues[bin]! + hue * weight;
          binSats[bin] = binSats[bin]! + saturation * weight;
          binLights[bin] = binLights[bin]! + lightness * weight;
        }

        // Suavizar el histograma para evitar que clusters de colores similares se dividan
        const smoothedWeights = new Float32Array(NUM_BINS);
        for (let b = 0; b < NUM_BINS; b++) {
          const prev = (b - 1 + NUM_BINS) % NUM_BINS;
          const next = (b + 1) % NUM_BINS;
          smoothedWeights[b] = binWeights[prev]! * 0.25 + binWeights[b]! * 0.5 + binWeights[next]! * 0.25;
        }

        let bestBin = -1;
        let maxWeight = 0;
        for (let b = 0; b < NUM_BINS; b++) {
          if (smoothedWeights[b]! > maxWeight) {
            maxWeight = smoothedWeights[b]!;
            bestBin = b;
          }
        }

        if (bestBin >= 0 && maxWeight > 0) {
          const prev = (bestBin - 1 + NUM_BINS) % NUM_BINS;
          const next = (bestBin + 1) % NUM_BINS;
          
          // Seleccionar el bin representativo del cluster evitando promedios circulares de Hue complejos
          let targetBin = bestBin;
          if (binWeights[bestBin]! === 0) {
            targetBin = binWeights[prev]! > binWeights[next]! ? prev : next;
          }

          const dominantHue = binHues[targetBin]! / binWeights[targetBin]!;
          const dominantSat = binSats[targetBin]! / binWeights[targetBin]!;
          const dominantLight = binLights[targetBin]! / binWeights[targetBin]!;
          
          // Reconstruir asegurando que el visualizador actúe como luz de neón (emisivo).
          // Aunque el mapa sea oscuro, el visualizador debe brillar con intensidad.
          const centerL = Math.max(0.60, Math.min(0.85, dominantLight + 0.15));
          const edgeL = Math.max(0.45, Math.min(0.75, dominantLight));
          const centerS = Math.max(0.65, Math.min(1, dominantSat + 0.25));
          const edgeS = Math.max(0.50, Math.min(1, dominantSat + 0.10));

          const centerRgb = hslToRgb(dominantHue, centerS, centerL);
          const edgeRgb = hslToRgb(dominantHue, edgeS, edgeL);

          const newPalette: VisualizerPalette = { centerRgb, edgeRgb };
          setPalette(newPalette);
          onPaletteChangeRef.current?.(newPalette);
        } else {
          // Si la imagen es puramente monocromática (blanco y negro puro)
          setPalette(DEFAULT_PALETTE);
          onPaletteChangeRef.current?.(DEFAULT_PALETTE);
        }
      } catch {
        setPalette(DEFAULT_PALETTE);
        onPaletteChangeRef.current?.(DEFAULT_PALETTE);
      }
    };

    img.onerror = () => {
      setPalette(DEFAULT_PALETTE);
      onPaletteChangeRef.current?.(DEFAULT_PALETTE);
    };

    return () => {
      isCancelled = true;
    };
  }, [coverImageUrl]);

  function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
    else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
    else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
    else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
    else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }

  useEffect(() => {
    if (!audioElement) return;

    try {
      if (!globalAudioCtx) {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        globalAudioCtx = new AudioContextClass();
      }

      if (!globalAnalyser) {
        globalAnalyser = globalAudioCtx.createAnalyser();
        globalAnalyser.fftSize = 256; // 128 bandas FFT para capturar transientes precisos
        globalAnalyser.smoothingTimeConstant = 0.35; // Respuesta ultrarrápida y viva
        globalAnalyser.minDecibels = -90;
        globalAnalyser.maxDecibels = -15;
      }

      if (connectedElement !== audioElement) {
        const source = globalAudioCtx.createMediaElementSource(audioElement);
        source.connect(globalAnalyser);
        globalAnalyser.connect(globalAudioCtx.destination);
        connectedElement = audioElement;
      }

      if (globalAudioCtx.state === "suspended") {
        void globalAudioCtx.resume();
      }
    } catch (err) {
      console.warn("AudioVisualizer context connect:", err);
    }
  }, [audioElement]);

  useEffect(() => {
    const ctx = analyserNode?.context ?? globalAudioCtx;
    if (isPlaying && ctx && ctx.state === "suspended" && "resume" in ctx) {
      void (ctx as AudioContext).resume();
    }
  }, [isPlaying, analyserNode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const halfCount = Math.floor(barCount / 2);
    const spacing = 2;
    const barWidth = Math.max(2.5, (width - (barCount - 1) * spacing) / barCount);
    const radius = barWidth / 2;

    const analyser = analyserNode ?? globalAnalyser;

    if (!isPlaying || !analyser) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + spacing);
        ctx.beginPath();
        ctx.roundRect(x, height - 2, barWidth, 2, 1);
        ctx.fill();
      }
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const smoothHeights = new Array(halfCount).fill(2);

    function renderFrame() {
      if (!canvas || !ctx || !analyser) return;

      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, width, height);

      // Calcular alturas para cada banda (desde el centro hacia los extremos)
      for (let i = 0; i < halfCount; i++) {
        const normPos = i / (halfCount - 1);
        const binIndex = Math.min(
          bufferLength - 4,
          Math.max(1, Math.floor(Math.pow(normPos, 1.3) * (bufferLength * 0.55) + 1))
        );

        const v1 = dataArray[binIndex] || 0;
        const v2 = dataArray[binIndex + 1] || 0;
        const raw = (v1 * 0.65 + v2 * 0.35) / 255;

        const bandGain = 1.1 + normPos * 0.3;
        const dynamicVal = Math.min(1, raw * bandGain);
        const targetH = Math.max(2, dynamicVal * (height - 2));

        if (targetH > smoothHeights[i]) {
          smoothHeights[i] = targetH;
        } else {
          smoothHeights[i] = smoothHeights[i] * 0.80 + targetH * 0.20;
        }
      }

      const centerX = width / 2;
      const [cR, cG, cB] = palette.centerRgb;
      const [eR, eG, eB] = palette.edgeRgb;

      // Dibujar simétricamente con el color adaptativo del mapa
      for (let i = 0; i < halfCount; i++) {
        const h = Math.round(smoothHeights[i]);
        const y = height - h;

        const norm = i / (halfCount - 1);
        const r = Math.round(cR + norm * (eR - cR));
        const g = Math.round(cG + norm * (eG - cG));
        const b = Math.round(cB + norm * (eB - cB));
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

        // Barra derecha
        const xRight = centerX + (spacing / 2) + i * (barWidth + spacing);
        ctx.beginPath();
        ctx.roundRect(xRight, y, barWidth, h, [radius, radius, 0, 0]);
        ctx.fill();

        // Barra izquierda
        const xLeft = centerX - (spacing / 2) - (i + 1) * (barWidth + spacing) + spacing;
        ctx.beginPath();
        ctx.roundRect(xLeft, y, barWidth, h, [radius, radius, 0, 0]);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(renderFrame);
    }

    animFrameRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, barCount, width, height, palette]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="home-bms-visualizer-canvas"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}
