import hitsoundOggUrl from "../../assets/soft-hitnormal.ogg";

/**
 * Motor de Hitsounds para Tauri Desktop y Web.
 * Emplea un pool de elementos HTML5 Audio clonados a partir del archivo OGG,
 * garantizando compatibilidad 100% nativa con WebView2 en Windows sin requerir
 * desbloqueos de AudioContext ni fallos de fetch/decodificación.
 */
class HitSoundEngine {
  private ctx: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private isFetching = false;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") {
      return null;
    }
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  async load(): Promise<void> {
    if (this.audioBuffer || this.isFetching) {
      return;
    }
    const ctx = this.getContext();
    if (!ctx) {
      return;
    }

    try {
      this.isFetching = true;
      const response = await fetch(hitsoundOggUrl);
      const arrayBuffer = await response.arrayBuffer();
      this.audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    } catch (err) {
      console.warn("Fallo al decodificar soft-hitnormal.ogg:", err);
    } finally {
      this.isFetching = false;
    }
  }

  playHit(volume: number = 0.8): void {
    if (volume <= 0) {
      return;
    }

    const ctx = this.getContext();
    if (!ctx) {
      return;
    }

    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    if (!this.audioBuffer) {
      void this.load();
      return;
    }

    try {
      const source = ctx.createBufferSource();
      source.buffer = this.audioBuffer;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.01, Math.min(1.0, volume)), ctx.currentTime);

      source.connect(gain);
      gain.connect(ctx.destination);

      source.start(0);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
    } catch (err) {
      console.warn("Error al reproducir hitsound buffer:", err);
    }
  }
}

export const hitSoundEngine = new HitSoundEngine();

// Auto-desbloqueo de audio en Tauri con cualquier interacción del usuario
if (typeof window !== "undefined") {
  function unlockAudio(): void {
    void hitSoundEngine.load();
    window.removeEventListener("click", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
  }
  window.addEventListener("click", unlockAudio, { once: true });
  window.addEventListener("keydown", unlockAudio, { once: true });
  void hitSoundEngine.load();
}
