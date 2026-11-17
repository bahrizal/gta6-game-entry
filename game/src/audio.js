// WebAudio synthesis only — no audio files, no network. SFX are short
// oscillator/noise bursts; the music is a tiny scheduled bassline + hats.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      engineOsc.connect(lp);
      lp.connect(engineGain);
      engineOsc.start();
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenGain.connect(master);
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenOsc.connect(sirenGain);
      sirenOsc.start();
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 1.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenLfo.start();
    } catch (e) {
      ctx = null;
      return false;
    }
    return true;
  }

  function noiseBuffer(dur) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    return buf;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq || 1800;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
  }

  // A minor-key bassline with hats, scheduled a bar ahead.
  const BASS = [55, 0, 55, 65.41, 55, 0, 49, 58.27, 55, 0, 55, 65.41, 82.41, 73.42, 65.41, 49];
  function scheduleBar() {
    if (!ctx) return;
    const spb = 60 / 112 / 2; // 112 bpm, eighth notes
    const start = ctx.currentTime + 0.05;
    for (let i = 0; i < 16; i++) {
      const t = start + i * spb;
      const f = BASS[(step * 16 + i) % BASS.length];
      if (f > 0) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + spb * 0.9);
        o.connect(g);
        g.connect(musicGain);
        o.start(t);
        o.stop(t + spb);
      }
      if (i % 2 === 0) {
        const n = ctx.createBufferSource();
        n.buffer = noiseBuffer(0.03);
        const g = ctx.createGain();
        g.gain.value = i % 4 === 2 ? 0.25 : 0.1;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6000;
        n.connect(hp);
        hp.connect(g);
        g.connect(musicGain);
        n.start(t);
      }
    }
    step++;
  }

  return {
    get muted() {
      return muted;
    },
    init() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    startMusic() {
      if (!ensure() || musicTimer) return;
      scheduleBar();
      musicTimer = setInterval(scheduleBar, (60 / 112 / 2) * 16 * 1000);
    },
    stopMusic() {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    setEngine(on, speedRatio) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(on ? 0.05 + speedRatio * 0.06 : 0, t, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + speedRatio * 130, t, 0.1);
    },
    setSiren(on) {
      if (!ensure()) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.2);
    },
    sfx(name) {
      if (!ensure()) return;
      switch (name) {
        case 'shot':
          noise(0.12, 0.5, 3200);
          blip(160, 0.08, 'square', 0.25, 60);
          break;
        case 'shotEnemy':
          noise(0.1, 0.3, 2600);
          break;
        case 'punch':
          noise(0.08, 0.4, 900);
          blip(120, 0.07, 'sine', 0.3, 70);
          break;
        case 'hit':
          blip(220, 0.06, 'sawtooth', 0.2, 140);
          break;
        case 'pickup':
          blip(660, 0.09, 'sine', 0.3);
          setTimeout(() => blip(990, 0.12, 'sine', 0.3), 80);
          break;
        case 'cash':
          blip(880, 0.08, 'sine', 0.3);
          setTimeout(() => blip(1174, 0.1, 'sine', 0.3), 70);
          setTimeout(() => blip(1568, 0.16, 'sine', 0.3), 140);
          break;
        case 'crash':
          noise(0.25, 0.5, 700);
          blip(90, 0.2, 'sawtooth', 0.3, 40);
          break;
        case 'explosion':
          noise(0.7, 0.7, 500);
          blip(70, 0.6, 'sine', 0.5, 30);
          break;
        case 'sirenBlip':
          blip(900, 0.15, 'triangle', 0.15, 700);
          break;
        case 'click':
          blip(700, 0.05, 'square', 0.15);
          break;
        case 'sting':
          blip(220, 0.5, 'triangle', 0.3, 440);
          blip(330, 0.5, 'triangle', 0.2, 660);
          break;
        case 'fail':
          blip(300, 0.4, 'sawtooth', 0.25, 140);
          break;
        case 'reload':
          blip(500, 0.05, 'square', 0.2);
          setTimeout(() => blip(400, 0.05, 'square', 0.2), 120);
          break;
        default:
          break;
      }
    },
  };
}
