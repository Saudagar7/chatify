const MAX_NOISE_DURATION = 0.35;

class ChatSoundEngine {
  constructor() {
    this.audioContext = null;
    this.supported = typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);
    this.unlockHandler = null;
    this.unlockEvents = ["pointerdown", "keydown", "touchstart"];
    this.unlockRegistered = false;
  }

  ensureContext() {
    if (!this.supported) return null;
    if (!this.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextClass();
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  setupGestureUnlock() {
    if (!this.supported || typeof window === "undefined" || this.unlockRegistered) {
      return;
    }

    const handler = () => {
      const ctx = this.ensureContext();
      if (ctx && ctx.state === "running") {
        this.teardownGestureUnlock();
      }
    };

    this.unlockHandler = handler;
    this.unlockEvents.forEach((eventName) => {
      window.addEventListener(eventName, handler, { passive: true });
    });
    this.unlockRegistered = true;
  }

  teardownGestureUnlock() {
    if (!this.unlockRegistered || typeof window === "undefined") {
      return;
    }
    this.unlockEvents.forEach((eventName) => {
      window.removeEventListener(eventName, this.unlockHandler);
    });
    this.unlockHandler = null;
    this.unlockRegistered = false;
  }

  playOutgoing() {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;

    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0.35, now);
    whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * MAX_NOISE_DURATION, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.value = 1.5;
    noiseSource.connect(filter).connect(whooshGain).connect(ctx.destination);
    noiseSource.start(now);
    noiseSource.stop(now + 0.45);

    const tone = ctx.createOscillator();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(350, now);
    tone.frequency.linearRampToValueAtTime(900, now + 0.22);
    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.22, now);
    toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    tone.connect(toneGain).connect(ctx.destination);
    tone.start(now);
    tone.stop(now + 0.4);
  }

  playIncoming() {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.25, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    const ping = ctx.createOscillator();
    ping.type = "sine";
    ping.frequency.setValueAtTime(680, now);
    ping.frequency.exponentialRampToValueAtTime(540, now + 0.2);
    ping.connect(envelope).connect(ctx.destination);
    ping.start(now);
    ping.stop(now + 0.3);

    const secondGain = ctx.createGain();
    secondGain.gain.setValueAtTime(0.18, now + 0.18);
    secondGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    const secondPing = ctx.createOscillator();
    secondPing.type = "sine";
    secondPing.frequency.setValueAtTime(640, now + 0.18);
    secondPing.frequency.exponentialRampToValueAtTime(520, now + 0.38);
    secondPing.connect(secondGain).connect(ctx.destination);
    secondPing.start(now + 0.18);
    secondPing.stop(now + 0.45);
  }
}

export const chatSoundEngine = new ChatSoundEngine();
