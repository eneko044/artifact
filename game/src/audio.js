// All sound is synthesised at load time into AudioBuffers (no external files needed),
// then played through positional panners, distance/occlusion filtering and a shared reverb.

const SR = 44100;

function makeBuffer(ctx, seconds, fill, channels = 1) {
  const len = Math.max(1, Math.floor(seconds * SR));
  const buf = ctx.createBuffer(channels, len, SR);
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c);
    fill(d, len, c);
  }
  normalize(buf, 0.95);
  return buf;
}

function normalize(buf, peak) {
  let m = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  }
  if (m < 1e-6) return;
  const k = peak / m;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
}

// One-pole low/high pass helpers operating in place.
function lowpass(d, cutoff) {
  const a = Math.exp((-2 * Math.PI * cutoff) / SR);
  let y = 0;
  for (let i = 0; i < d.length; i++) { y = (1 - a) * d[i] + a * y; d[i] = y; }
}
function highpass(d, cutoff) {
  const a = Math.exp((-2 * Math.PI * cutoff) / SR);
  let y = 0, px = 0;
  for (let i = 0; i < d.length; i++) { y = a * (y + d[i] - px); px = d[i]; d[i] = y; }
}
function bandpass(d, lo, hi) { highpass(d, lo); lowpass(d, hi); }
const rnd = () => Math.random() * 2 - 1;

function noise(len) { const d = new Float32Array(len); for (let i = 0; i < len; i++) d[i] = rnd(); return d; }

function gunshot(ctx, p) {
  return makeBuffer(ctx, p.len, (out, len) => {
    const crack = noise(len); highpass(crack, p.crackHP || 1800);
    const body = noise(len); lowpass(body, p.bodyLP);
    const tail = noise(len); lowpass(tail, p.tailLP || 700);
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const f = p.thumpEnd + (p.thumpStart - p.thumpEnd) * Math.exp(-t / 0.03);
      phase += (2 * Math.PI * f) / SR;
      const attack = Math.min(1, t / 0.0008);
      let v = crack[i] * Math.exp(-t / p.crackT) * p.crackA
        + body[i] * Math.exp(-t / p.bodyT) * p.bodyA
        + Math.sin(phase) * Math.exp(-t / p.thumpT) * p.thumpA
        + tail[i] * Math.exp(-t / p.tailT) * p.tailA * Math.min(1, t / 0.02);
      // Mechanical action rattle after the report.
      if (p.mech && t > p.mech[0] && t < p.mech[0] + 0.03) v += rnd() * 0.25 * Math.exp(-(t - p.mech[0]) / 0.006) * p.mech[1];
      out[i] = Math.tanh(v * attack * (p.drive || 1.6));
    }
  });
}

function click(ctx, freq, len = 0.05, noiseAmt = 1, ring = 0.012) {
  return makeBuffer(ctx, len, (d, n) => {
    const nz = noise(n); highpass(nz, 1500);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      d[i] = nz[i] * Math.exp(-t / 0.004) * noiseAmt + Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / ring) * 0.6
        + Math.sin(2 * Math.PI * freq * 1.63 * t) * Math.exp(-t / (ring * 0.7)) * 0.3;
    }
  });
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.enabled = true;
    this.volume = 0.8;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.18;
    this.master.connect(comp).connect(ctx.destination);
    // Outdoor slap/reverb.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeBuffer(ctx, 1.9, (d, n, c) => {
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const slap = (t > 0.06 && t < 0.075) || (t > 0.13 && t < 0.14) ? 0.8 : 0;
        d[i] = rnd() * (Math.exp(-t / 0.45) * 0.6 + slap * Math.exp(-t / 0.2)) * (c ? 0.95 : 1);
      }
      lowpass(d, 3500);
    }, 2);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.32;
    this.reverb.connect(this.reverbGain).connect(this.master);
    this.build();
    this.startAmbience();
  }

  build() {
    const c = this.ctx;
    const B = this.buffers;
    B.ak = gunshot(c, { len: 0.9, crackA: 1.0, crackT: 0.01, bodyLP: 2600, bodyA: 0.9, bodyT: 0.07, thumpStart: 170, thumpEnd: 52, thumpT: 0.07, thumpA: 1.1, tailA: 0.35, tailT: 0.28, mech: [0.05, 1], drive: 2.0 });
    B.m4 = gunshot(c, { len: 0.8, crackA: 1.1, crackT: 0.008, crackHP: 2400, bodyLP: 3200, bodyA: 0.75, bodyT: 0.055, thumpStart: 190, thumpEnd: 60, thumpT: 0.055, thumpA: 0.85, tailA: 0.3, tailT: 0.24, mech: [0.045, 0.8], drive: 1.8 });
    B.smg = gunshot(c, { len: 0.6, crackA: 1.0, crackT: 0.007, crackHP: 2600, bodyLP: 3800, bodyA: 0.6, bodyT: 0.04, thumpStart: 220, thumpEnd: 80, thumpT: 0.04, thumpA: 0.6, tailA: 0.22, tailT: 0.18, mech: [0.035, 0.7], drive: 1.6 });
    B.pistol = gunshot(c, { len: 0.7, crackA: 1.1, crackT: 0.008, crackHP: 2200, bodyLP: 3000, bodyA: 0.7, bodyT: 0.05, thumpStart: 200, thumpEnd: 70, thumpT: 0.05, thumpA: 0.7, tailA: 0.25, tailT: 0.22, drive: 1.7 });
    B.deagle = gunshot(c, { len: 1.1, crackA: 1.0, crackT: 0.012, bodyLP: 2000, bodyA: 1.0, bodyT: 0.09, thumpStart: 140, thumpEnd: 42, thumpT: 0.09, thumpA: 1.3, tailA: 0.45, tailT: 0.38, drive: 2.3 });
    B.awp = gunshot(c, { len: 1.8, crackA: 1.2, crackT: 0.014, bodyLP: 1700, bodyA: 1.1, bodyT: 0.13, thumpStart: 120, thumpEnd: 34, thumpT: 0.14, thumpA: 1.5, tailA: 0.55, tailT: 0.6, tailLP: 500, drive: 2.6 });
    B.usp = makeBuffer(c, 0.35, (d, n) => {
      const nz = noise(n); bandpass(nz, 700, 3200);
      for (let i = 0; i < n; i++) { const t = i / SR; d[i] = nz[i] * Math.exp(-t / 0.022) + Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t / 0.03) * 0.5 + (t > 0.03 && t < 0.045 ? rnd() * 0.3 * Math.exp(-(t - 0.03) / 0.004) : 0); }
    });
    B.knife = makeBuffer(c, 0.32, (d, n) => {
      const nz = noise(n);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const f = 900 + 3200 * Math.sin(Math.PI * Math.min(1, t / 0.28));
        const a = Math.exp((-2 * Math.PI * f) / SR);
        y = (1 - a) * nz[i] + a * y;
        d[i] = (nz[i] - y) * Math.sin(Math.PI * Math.min(1, t / 0.3)) ** 2;
      }
    });
    B.knifeHit = makeBuffer(c, 0.25, (d, n) => {
      const nz = noise(n); lowpass(nz, 900);
      for (let i = 0; i < n; i++) { const t = i / SR; d[i] = nz[i] * Math.exp(-t / 0.05) + Math.sin(2 * Math.PI * 110 * t) * Math.exp(-t / 0.06); }
    });
    B.he = makeBuffer(c, 2.6, (d, n) => {
      const nz = noise(n); lowpass(nz, 420);
      const cr = noise(n); highpass(cr, 1200);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        ph += (2 * Math.PI * (28 + 70 * Math.exp(-t / 0.15))) / SR;
        d[i] = Math.tanh((nz[i] * Math.exp(-t / 0.55) * 2.2 + Math.sin(ph) * Math.exp(-t / 0.35) * 1.4 + cr[i] * Math.exp(-t / 0.03) * 0.8) * 1.8);
      }
    });
    B.bounce = click(c, 900, 0.12, 0.6, 0.03);
    B.pin = click(c, 3200, 0.1, 0.4, 0.03);
    B.dry = click(c, 2400, 0.06, 0.8, 0.008);
    B.magOut = click(c, 1100, 0.12, 1.2, 0.02);
    B.magIn = makeBuffer(c, 0.14, (d, n) => {
      const nz = noise(n); highpass(nz, 800);
      for (let i = 0; i < n; i++) { const t = i / SR; d[i] = nz[i] * (Math.exp(-t / 0.006) + (t > 0.05 ? Math.exp(-(t - 0.05) / 0.008) * 0.9 : 0)) + Math.sin(2 * Math.PI * 1700 * t) * Math.exp(-t / 0.02) * 0.4; }
    });
    B.boltBack = click(c, 1500, 0.12, 1, 0.025);
    B.boltFwd = click(c, 1900, 0.12, 1.2, 0.02);
    B.draw = makeBuffer(c, 0.2, (d, n) => {
      const nz = noise(n); bandpass(nz, 1200, 6000);
      for (let i = 0; i < n; i++) { const t = i / SR; d[i] = nz[i] * Math.sin(Math.PI * t / 0.2) * 0.5 + (t > 0.14 ? rnd() * Math.exp(-(t - 0.14) / 0.005) : 0); }
    });
    B.hit = makeBuffer(c, 0.18, (d, n) => {
      const nz = noise(n); lowpass(nz, 1400);
      for (let i = 0; i < n; i++) { const t = i / SR; d[i] = nz[i] * Math.exp(-t / 0.03) + Math.sin(2 * Math.PI * 95 * t) * Math.exp(-t / 0.05) * 0.8; }
    });
    B.headshot = makeBuffer(c, 0.55, (d, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        d[i] = (Math.sin(2 * Math.PI * 2150 * t) * 0.6 + Math.sin(2 * Math.PI * 3480 * t) * 0.4 + Math.sin(2 * Math.PI * 5270 * t) * 0.25) * Math.exp(-t / 0.09) + rnd() * Math.exp(-t / 0.004) * 0.7;
      }
    });
    B.tick = click(c, 1800, 0.05, 0.3, 0.01);
    B.whiz = makeBuffer(c, 0.2, (d, n) => {
      const nz = noise(n);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const f = 2600 - 1800 * (t / 0.2);
        const a = Math.exp((-2 * Math.PI * f) / SR);
        y = (1 - a) * nz[i] + a * y;
        d[i] = y * Math.exp(-(((t - 0.07) / 0.05) ** 2));
      }
    });
    B.impactStone = makeBuffer(c, 0.25, (d, n) => {
      const nz = noise(n); highpass(nz, 900);
      for (let i = 0; i < n; i++) { const t = i / SR; d[i] = nz[i] * (Math.exp(-t / 0.01) + 0.25 * Math.exp(-t / 0.06) * (Math.random() < 0.02 ? 3 : 1)); }
    });
    B.impactWood = makeBuffer(c, 0.2, (d, n) => {
      const nz = noise(n); lowpass(nz, 1600);
      for (let i = 0; i < n; i++) { const t = i / SR; d[i] = nz[i] * Math.exp(-t / 0.02) + Math.sin(2 * Math.PI * 320 * t) * Math.exp(-t / 0.03) * 0.6; }
    });
    B.impactMetal = makeBuffer(c, 0.5, (d, n) => {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        ph += (2 * Math.PI * (2600 + 1800 * Math.exp(-t / 0.08))) / SR;
        d[i] = Math.sin(ph) * Math.exp(-t / 0.12) * 0.7 + rnd() * Math.exp(-t / 0.005);
      }
    });
    B.steps = [0, 1, 2, 3].map(() => makeBuffer(c, 0.16, (d, n) => {
      const nz = noise(n); lowpass(nz, 1800 + Math.random() * 800);
      const g = noise(n); highpass(g, 3000);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const env = Math.exp(-t / 0.018) + 0.5 * Math.exp(-Math.max(0, t - 0.03) / 0.03) * (t > 0.03 ? 1 : 0);
        d[i] = nz[i] * env + g[i] * env * 0.25 * (Math.random() < 0.3 ? 1 : 0.2);
      }
    }));
    B.land = makeBuffer(c, 0.25, (d, n) => {
      const nz = noise(n); lowpass(nz, 900);
      for (let i = 0; i < n; i++) { const t = i / SR; d[i] = nz[i] * Math.exp(-t / 0.04) + Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t / 0.05); }
    });
    B.beep = makeBuffer(c, 0.35, (d, n) => {
      for (let i = 0; i < n; i++) { const t = i / SR; const on = t < 0.12 || (t > 0.18 && t < 0.3); d[i] = on ? Math.sin(2 * Math.PI * 1320 * t) * 0.5 + Math.sin(2 * Math.PI * 2640 * t) * 0.12 : 0; }
      lowpass(d, 6000);
    });
    B.radio = makeBuffer(c, 0.3, (d, n) => {
      const nz = noise(n); bandpass(nz, 1500, 4000);
      for (let i = 0; i < n; i++) { const t = i / SR; d[i] = nz[i] * 0.4 * (t < 0.08 || t > 0.22 ? 1 : 0.1); }
    });
    B.buy = click(c, 1300, 0.15, 0.6, 0.04);
    B.ui = click(c, 2200, 0.05, 0.2, 0.01);
    const chord = (freqs, len, bright) => makeBuffer(c, len, (d, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        let v = 0;
        freqs.forEach((f, k) => {
          const start = k * 0.09;
          if (t < start) return;
          const tt = t - start;
          for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f * h * tt) / (h ** bright) * Math.exp(-tt / (len * 0.45));
        });
        d[i] = Math.tanh(v * 0.5);
      }
    });
    B.win = chord([220, 277.2, 329.6, 440], 2.2, 1.2);
    B.lose = chord([196, 233.1, 293.7], 2.2, 1.6);
  }

  startAmbience() {
    const c = this.ctx;
    const buf = makeBuffer(c, 6, (d, n, ch) => {
      const nz = noise(n); lowpass(nz, 380); lowpass(nz, 600);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const gust = 0.55 + 0.45 * Math.sin(2 * Math.PI * t / 6 + ch) * Math.sin(2 * Math.PI * t / 2.3);
        d[i] = nz[i] * gust;
      }
      // crossfade loop ends
      const f = Math.floor(SR * 0.3);
      for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
    }, 2);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopEnd = 6 - 0.3;
    const g = c.createGain();
    g.gain.value = 0.06;
    src.connect(g).connect(this.master);
    src.start();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  updateListener(pos, forward, up) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.01); L.positionY.setTargetAtTime(pos.y, t, 0.01); L.positionZ.setTargetAtTime(pos.z, t, 0.01);
      L.forwardX.setTargetAtTime(forward.x, t, 0.01); L.forwardY.setTargetAtTime(forward.y, t, 0.01); L.forwardZ.setTargetAtTime(forward.z, t, 0.01);
      L.upX.setTargetAtTime(up.x, t, 0.01); L.upY.setTargetAtTime(up.y, t, 0.01); L.upZ.setTargetAtTime(up.z, t, 0.01);
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  // opts: { pos, volume, rate, occluded, reverb, delay }
  play(name, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    let buf = this.buffers[name];
    if (Array.isArray(buf)) buf = buf[Math.floor(Math.random() * buf.length)];
    if (!buf) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate || 1) * (1 + (Math.random() - 0.5) * (opts.jitter ?? 0.06));
    const g = c.createGain();
    g.gain.value = opts.volume ?? 1;
    let node = src.connect(g);
    if (opts.pos) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.occluded ? 900 : 16000;
      const p = c.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = opts.ref || 3;
      p.rolloffFactor = opts.rolloff || 1.1;
      p.maxDistance = 200;
      if (p.positionX) { p.positionX.value = opts.pos.x; p.positionY.value = opts.pos.y; p.positionZ.value = opts.pos.z; } else p.setPosition(opts.pos.x, opts.pos.y, opts.pos.z);
      node = node.connect(f).connect(p);
    }
    node.connect(this.master);
    if (opts.reverb) {
      const s = c.createGain();
      s.gain.value = opts.reverb;
      node.connect(s).connect(this.reverb);
    }
    src.start(c.currentTime + (opts.delay || 0));
  }
}
