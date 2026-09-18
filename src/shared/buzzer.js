// A short, synthesized alert tone — no audio asset ships with the app, this
// is generated on the fly with the Web Audio API. Used to accompany a new
// unaccepted-emergency notification wherever one appears (hospital console,
// driver dashboard, nearby-bystander alert) so it's noticed even if the tab
// isn't in focus.
let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  // Browsers suspend a freshly-created context until a user gesture has
  // occurred somewhere on the page — by the time any dashboard is visible
  // the person has already signed in (a gesture), so this just re-arms it
  // if the browser paused it for some other reason.
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone(ctx, startTime, freq, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// Plays a two-note chime, repeated `times` times. Silently no-ops if the
// browser has no usable AudioContext — this is an attention cue on top of
// a visible alert, never something the feature depends on to function.
export function playBuzzer(times = 2) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  for (let i = 0; i < times; i++) {
    const base = now + i * 0.5;
    tone(ctx, base, 880, 0.18);
    tone(ctx, base + 0.2, 660, 0.2);
  }
}
