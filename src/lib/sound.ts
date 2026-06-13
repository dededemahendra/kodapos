// A short, pleasant two-note confirmation chime played on a successful sale.
// Uses the Web Audio API so there's no asset to ship and no <audio> element to
// manage. SSR-safe and fully best-effort: any failure (no AudioContext, an
// autoplay-policy block, a suspended context) is swallowed — a missing sound
// must never interrupt checkout.

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Plays a brief confirmation chime. No-op (and never throws) on failure. */
export function playSaleChime(): void {
  try {
    const audio = getContext();
    if (!audio) return;
    // A user gesture (the pay tap) precedes this, but a context can still be
    // suspended on some browsers — resume best-effort.
    if (audio.state === 'suspended') void audio.resume();

    const now = audio.currentTime;
    const gain = audio.createGain();
    gain.connect(audio.destination);
    // Two ascending notes (C6 → E6) for a rising "done" feel.
    [
      { freq: 1046.5, start: 0, dur: 0.12 },
      { freq: 1318.5, start: 0.1, dur: 0.16 },
    ].forEach(({ freq, start, dur }) => {
      const osc = audio.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = audio.createGain();
      g.gain.setValueAtTime(0.0001, now + start);
      g.gain.exponentialRampToValueAtTime(0.18, now + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(g);
      g.connect(gain);
      osc.start(now + start);
      osc.stop(now + start + dur);
    });
  } catch {
    /* best-effort: a missing chime must never break a sale */
  }
}
