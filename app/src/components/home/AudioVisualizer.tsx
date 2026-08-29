import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  barCount?: number;
  width?: number;
  height?: number;
}

let globalAudioCtx: AudioContext | null = null;
let globalAnalyser: AnalyserNode | null = null;
let connectedElement: HTMLAudioElement | null = null;

export function AudioVisualizer({
  audioElement,
  isPlaying,
  barCount = 26,
  width = 140,
  height = 28,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

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
    if (isPlaying && globalAudioCtx && globalAudioCtx.state === "suspended") {
      void globalAudioCtx.resume();
    }
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const halfCount = Math.floor(barCount / 2);
    const spacing = 2;
    const barWidth = Math.max(2.5, (width - (barCount - 1) * spacing) / barCount);
    const radius = barWidth / 2;

    if (!isPlaying || !globalAnalyser) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      const centerY = height / 2;
      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + spacing);
        ctx.beginPath();
        ctx.roundRect(x, centerY - 1, barWidth, 2, 1);
        ctx.fill();
      }
      return;
    }

    const analyser = globalAnalyser;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const smoothHeights = new Array(halfCount).fill(2);

    function renderFrame() {
      if (!canvas || !ctx || !analyser) return;

      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, width, height);

      // Calcular alturas para cada una de las barras desde el centro hacia afuera
      for (let i = 0; i < halfCount; i++) {
        // Distribución logarítmica suave de frecuencias
        const normPos = i / (halfCount - 1);
        const binIndex = Math.min(
          bufferLength - 4,
          Math.max(1, Math.floor(Math.pow(normPos, 1.4) * (bufferLength * 0.55) + 1))
        );

        // Promedio de 2 bins adyacentes para respuesta limpia
        const v1 = dataArray[binIndex] || 0;
        const v2 = dataArray[binIndex + 1] || 0;
        const raw = (v1 * 0.65 + v2 * 0.35) / 255;

        // Ganancia equilibrada y natural (sin saturar)
        const bandGain = 1.05 + normPos * 0.35;
        const dynamicVal = Math.min(1, raw * bandGain);

        // Altura proporcional
        const targetH = Math.max(2, dynamicVal * (height - 3));

        // Rebote suave: subida rápida, caída natural
        if (targetH > smoothHeights[i]) {
          smoothHeights[i] = targetH;
        } else {
          smoothHeights[i] = smoothHeights[i] * 0.78 + targetH * 0.22;
        }
      }

      const centerY = height / 2;
      const centerX = width / 2;

      // Dibujar simétricamente desde el centro hacia los extremos
      for (let i = 0; i < halfCount; i++) {
        const h = smoothHeights[i];
        const halfH = h / 2;

        // Gradiente: centro cian brillante (#38bdf8) -> medios (#818cf8) -> extremos magenta/violeta (#c084fc)
        const norm = i / (halfCount - 1);
        const r = Math.round(56 + norm * 136);
        const g = Math.round(189 - norm * 57);
        const b = Math.round(248 + norm * 4);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

        // Barra derecha (desde el centro hacia la derecha)
        const xRight = centerX + (spacing / 2) + i * (barWidth + spacing);
        ctx.beginPath();
        ctx.roundRect(xRight, centerY - halfH, barWidth, h, radius);
        ctx.fill();

        // Barra izquierda (desde el centro hacia la izquierda)
        const xLeft = centerX - (spacing / 2) - (i + 1) * (barWidth + spacing) + spacing;
        ctx.beginPath();
        ctx.roundRect(xLeft, centerY - halfH, barWidth, h, radius);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(renderFrame);
    }

    animFrameRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isPlaying, barCount, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="home-bms-visualizer-canvas"
    />
  );
}
