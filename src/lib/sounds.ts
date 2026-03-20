// Web Audio API sound effects for trading events
const audioCtx = () => {
  if (!(window as any).__tradingAudioCtx) {
    (window as any).__tradingAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return (window as any).__tradingAudioCtx as AudioContext;
};

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.3) {
  try {
    const ctx = audioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

function playSequence(notes: { freq: number; dur: number; delay: number }[], type: OscillatorType = 'sine', volume = 0.3) {
  notes.forEach(n => {
    setTimeout(() => playTone(n.freq, n.dur, type, volume), n.delay * 1000);
  });
}

/** Short click sound when a trade is placed */
export function soundTradeExecuted() {
  playTone(800, 0.1, 'square', 0.15);
}

/** Ascending chime for a winning trade */
export function soundTradeWin() {
  playSequence([
    { freq: 523, dur: 0.15, delay: 0 },
    { freq: 659, dur: 0.15, delay: 0.1 },
    { freq: 784, dur: 0.25, delay: 0.2 },
  ], 'sine', 0.25);
}

/** Descending tone for a losing trade */
export function soundTradeLoss() {
  playSequence([
    { freq: 400, dur: 0.2, delay: 0 },
    { freq: 300, dur: 0.3, delay: 0.15 },
  ], 'triangle', 0.2);
}

/** Triumphant jingle for harvest */
export function soundHarvest() {
  playSequence([
    { freq: 523, dur: 0.12, delay: 0 },
    { freq: 659, dur: 0.12, delay: 0.1 },
    { freq: 784, dur: 0.12, delay: 0.2 },
    { freq: 1047, dur: 0.4, delay: 0.3 },
  ], 'sine', 0.3);
}

/** Low gong for end of session */
export function soundSessionEnd() {
  playSequence([
    { freq: 220, dur: 0.5, delay: 0 },
    { freq: 165, dur: 0.8, delay: 0.4 },
  ], 'sine', 0.35);
}

/** Speak welcome message using Web Speech API */
export function speakWelcome(name: string) {
  try {
    if ('speechSynthesis' in window) {
      // Convert ALL-CAPS or mixed-case names to Title Case for natural pronunciation
      const formatName = (n: string) =>
        n.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

      const fullName = formatName(name);
      const utterance = new SpeechSynthesisUtterance(
        `Welcome, ${fullName}! I wish you a happy and successful trading session.`
      );
      utterance.rate = 0.95;
      utterance.pitch = 1.1;
      utterance.volume = 0.8;
      window.speechSynthesis.speak(utterance);
    }
  } catch {}
}
