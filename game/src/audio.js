// WebAudio synthesis only: no audio files, no network. SFX + a small music loop.
// Everything is guarded so the game still runs where audio is unavailable.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = null;
  let nextNote = 0;
  let step = 0;

  // A minor-key bassline with hats, 112 BPM, 16 steps a bar.
  const BASS = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 65.41, 0];
  const STEP_DUR = 60 / 112 / 4;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function noiseBurst(dur, freq, vol, type = 'highpass') {
    if (!ensure() || muted) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start();
    } catch { /* ignore */ }
  }

  function tone(freq, dur, vol, type = 'sine', slideTo = null) {
    if (!ensure() || muted) return;
    try {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(ctx.currentTime + dur + 0.02);
    } catch { /* ignore */ }
  }

  function scheduleStep() {
    if (!ctx || muted) return;
    const when = Math.max(ctx.currentTime, nextNote);
    const bass = BASS[step % 16];
    if (bass) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = bass;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + STEP_DUR * 1.8);
      o.connect(g);
      g.connect(musicGain);
      o.start(when);
      o.stop(when + STEP_DUR * 2);
    }
    if (step % 4 === 2) {
      const len = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      src.connect(f);
      f.connect(g);
      g.connect(musicGain);
      src.start(when);
    }
    step += 1;
    nextNote = when + STEP_DUR;
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    startMusic() {
      if (!ensure()) return;
      if (musicTimer) return;
      nextNote = ctx.currentTime + 0.1;
      step = 0;
      musicTimer = setInterval(() => {
        if (!muted && ctx) {
          while (nextNote < ctx.currentTime + 0.25) scheduleStep();
        }
      }, 80);
    },
    stopMusic() {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    shot(kind) {
      if (kind === 'smg') noiseBurst(0.09, 900, 0.5, 'bandpass');
      else noiseBurst(0.16, 500, 0.7, 'bandpass');
      tone(140, 0.08, 0.25, 'square', 60);
    },
    punch() {
      noiseBurst(0.08, 300, 0.6, 'lowpass');
    },
    hit() {
      tone(220, 0.12, 0.3, 'sawtooth', 90);
    },
    pickup() {
      tone(660, 0.09, 0.25);
      setTimeout(() => tone(990, 0.14, 0.25), 70);
    },
    cash() {
      tone(880, 0.08, 0.22);
      setTimeout(() => tone(1174, 0.1, 0.22), 60);
      setTimeout(() => tone(1568, 0.16, 0.22), 120);
    },
    explosion() {
      noiseBurst(0.7, 200, 0.9, 'lowpass');
      tone(70, 0.6, 0.5, 'sine', 30);
    },
    crash() {
      noiseBurst(0.25, 350, 0.7, 'lowpass');
    },
    sting() {
      tone(392, 0.25, 0.3, 'triangle');
      setTimeout(() => tone(523, 0.25, 0.3, 'triangle'), 140);
      setTimeout(() => tone(659, 0.4, 0.3, 'triangle'), 280);
    },
    fail() {
      tone(311, 0.3, 0.3, 'triangle', 233);
      setTimeout(() => tone(233, 0.5, 0.3, 'triangle', 175), 220);
    },
    setEngine(speedFrac, driving) {
      if (!ensure()) return;
      const target = driving ? 0.05 + speedFrac * 0.09 : 0;
      engineGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(46 + speedFrac * 130, ctx.currentTime, 0.08);
    },
    setSiren(on, t) {
      if (!ensure()) return;
      sirenGain.gain.setTargetAtTime(on && !muted ? 0.045 : 0, ctx.currentTime, 0.2);
      if (on) sirenOsc.frequency.setTargetAtTime(t % 1 < 0.5 ? 720 : 960, ctx.currentTime, 0.05);
    },
  };
}
