// Short Web Audio tones for register scanning. No audio asset: a single shared
// AudioContext synthesizes a high blip on a hit and a lower buzz on a miss.
// Mute is in-session only (module state); a persisted per-user setting is a
// deferred fast-follow. Safe on SSR/no-audio: every call is guarded in try/catch.

let muted = false;
let ctx: AudioContext | null = null;

export function isScanMuted(): boolean {
  return muted;
}

export function setScanMuted(next: boolean): void {
  muted = next;
}

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

export function scanBeep(kind: 'hit' | 'miss'): void {
  if (muted) return;
  try {
    const ac = audioContext();
    if (!ac) return;
    // A user gesture (the scan submit) precedes this, so resume is allowed.
    if (ac.state === 'suspended') void ac.resume();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.value = kind === 'hit' ? 880 : 220;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ac.destination);
    const now = ac.currentTime;
    const dur = kind === 'hit' ? 0.06 : 0.18;
    // Quick fade-out to avoid a click at the end of the tone.
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.start(now);
    osc.stop(now + dur);
  } catch {
    // Audio is best-effort; never let a beep break a scan.
  }
}
