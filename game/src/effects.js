import * as THREE from 'three';

function canvasTexture(size, draw, h = size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, size, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Seeded-ish jitter for texture generation.
const R = (a, b) => a + Math.random() * (b - a);

export const TEX = {};
function buildTextures() {
  if (TEX.smoke) return;
  TEX.smoke = canvasTexture(128, (ctx, s) => {
    for (let i = 0; i < 16; i++) {
      const x = s / 2 + R(-0.18, 0.18) * s, y = s / 2 + R(-0.18, 0.18) * s;
      const r = s * R(0.16, 0.36);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.3)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
  });
  TEX.glow = canvasTexture(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,236,190,0.9)');
    g.addColorStop(0.5, 'rgba(255,160,60,0.35)');
    g.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  // Several front-on flash shapes so consecutive shots never look the same.
  TEX.flashes = [0, 1, 2, 3].map((v) => canvasTexture(256, (ctx, s) => {
    ctx.translate(s / 2, s / 2);
    ctx.globalCompositeOperation = 'lighter';
    const petals = 4 + v + ((Math.random() * 3) | 0);
    for (let i = 0; i < petals; i++) {
      ctx.save();
      ctx.rotate((i / petals) * Math.PI * 2 + R(-0.25, 0.25));
      const len = s * R(0.26, 0.48);
      const w = s * R(0.035, 0.07);
      const pg = ctx.createLinearGradient(0, 0, len, 0);
      pg.addColorStop(0, 'rgba(255,248,225,1)');
      pg.addColorStop(0.35, 'rgba(255,196,96,0.85)');
      pg.addColorStop(1, 'rgba(255,90,10,0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.moveTo(0, -w);
      ctx.quadraticCurveTo(len * 0.45, -w * 1.4, len, 0);
      ctx.quadraticCurveTo(len * 0.45, w * 1.4, 0, w);
      ctx.fill();
      ctx.restore();
    }
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.2);
    g.addColorStop(0, 'rgba(255,255,250,1)');
    g.addColorStop(0.45, 'rgba(255,210,120,0.8)');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2); ctx.fill();
    // Sparks.
    for (let i = 0; i < 14; i++) {
      const a = R(0, Math.PI * 2), d = s * R(0.12, 0.46);
      ctx.fillStyle = `rgba(255,${(200 + Math.random() * 55) | 0},140,${R(0.4, 0.9)})`;
      ctx.fillRect(Math.cos(a) * d, Math.sin(a) * d, 2, 2);
    }
  }));
  TEX.flash = TEX.flashes[0];
  TEX.flashSide = canvasTexture(256, (ctx, w, h) => {
    ctx.globalCompositeOperation = 'lighter';
    for (let layer = 0; layer < 3; layer++) {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,248,230,0.95)');
      g.addColorStop(0.3, 'rgba(255,190,80,0.7)');
      g.addColorStop(1, 'rgba(255,80,10,0)');
      ctx.fillStyle = g;
      const k = 1 - layer * 0.28;
      ctx.beginPath();
      ctx.moveTo(0, h / 2 - h * 0.1 * k);
      ctx.bezierCurveTo(w * 0.3, h / 2 - h * 0.34 * k, w * 0.7, h / 2 - h * 0.18 * k, w * k, h / 2 + R(-6, 6));
      ctx.bezierCurveTo(w * 0.7, h / 2 + h * 0.18 * k, w * 0.3, h / 2 + h * 0.34 * k, 0, h / 2 + h * 0.1 * k);
      ctx.fill();
    }
  }, 128);
  TEX.hole = canvasTexture(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(6,5,4,1)');
    g.addColorStop(0.18, 'rgba(14,11,8,0.98)');
    g.addColorStop(0.3, 'rgba(48,38,28,0.8)');
    g.addColorStop(0.55, 'rgba(70,58,44,0.3)');
    g.addColorStop(1, 'rgba(90,75,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(22,18,14,0.7)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const a = R(0, Math.PI * 2), r = s * R(0.25, 0.46);
      ctx.beginPath(); ctx.moveTo(s / 2 + Math.cos(a) * s * 0.1, s / 2 + Math.sin(a) * s * 0.1);
      ctx.lineTo(s / 2 + Math.cos(a + R(-0.2, 0.2)) * r, s / 2 + Math.sin(a + R(-0.2, 0.2)) * r); ctx.stroke();
    }
    // Chipped rim highlights.
    ctx.fillStyle = 'rgba(210,190,160,0.25)';
    for (let i = 0; i < 10; i++) { const a = R(0, Math.PI * 2), d = s * R(0.14, 0.22); ctx.fillRect(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 2, 2); }
  });
  TEX.blood = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = 'rgba(95,8,8,0.9)';
    for (let i = 0; i < 26; i++) {
      const a = R(0, Math.PI * 2), d = Math.random() ** 2 * s * 0.38;
      const r = s * R(0.02, 0.1) * (1 - d / (s * 0.45));
      ctx.beginPath(); ctx.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, Math.max(1, r), 0, Math.PI * 2); ctx.fill();
    }
  });
  TEX.spark = canvasTexture(32, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,220,1)');
    g.addColorStop(0.3, 'rgba(255,190,80,0.9)');
    g.addColorStop(1, 'rgba(255,100,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  TEX.tracer = canvasTexture(64, (ctx, w, h) => {
    // Soft across the width, bright head at the right end.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,200,120,0)');
    g.addColorStop(0.5, 'rgba(255,240,210,1)');
    g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const f = ctx.createLinearGradient(0, 0, w, 0);
    f.addColorStop(0, 'rgba(0,0,0,1)');
    f.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = f;
    ctx.fillRect(0, 0, w, h);
  }, 16);
}

// CPU particle pool rendered as one Points object per look.
class Particles {
  constructor(scene, tex, max, blending, depthWrite = false) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.ttl = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 800 } },
      vertexShader: `
        attribute float size; attribute vec4 color; varying vec4 vColor; uniform float scale;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform sampler2D map; varying vec4 vColor;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
          if (gl_FragColor.a < 0.004) discard; }`,
      transparent: true, depthWrite, blending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(p, v, { size = 0.2, grow = 0, ttl = 1, color = [1, 1, 1], alpha = 1, drag = 0, gravity = 0 }) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color[0], color[1], color[2], alpha], i * 4);
    this.size[i] = size; this.grow[i] = grow; this.ttl[i] = ttl; this.life[i] = ttl;
    this.drag[i] = drag; this.grav[i] = gravity; this.alpha0[i] = alpha;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.ttl[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] += this.grow[i] * dt;
      // Fade in quickly, fade out over the life.
      const fin = Math.min(1, (1 - k) * 12);
      this.col[i * 4 + 3] = this.alpha0[i] * k * fin;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }
}

// Velocity-stretched spark streaks (hot metal flecks).
class Streaks {
  constructor(scene, max) {
    this.max = max;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.ttl = new Float32Array(max);
    this.pos = new Float32Array(max * 6);
    this.col = new Float32Array(max * 6);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  spawn(p, v, ttl) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.p.set([p.x, p.y, p.z], i * 3);
    this.v.set([v.x, v.y, v.z], i * 3);
    this.life[i] = this.ttl[i] = ttl;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const o = i * 6;
      if (this.life[i] <= 0) { for (let k = 0; k < 6; k++) this.col[o + k] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.ttl[i]);
      this.v[i * 3 + 1] -= 9.8 * dt;
      for (let a = 0; a < 3; a++) this.p[i * 3 + a] += this.v[i * 3 + a] * dt;
      if (this.p[i * 3 + 1] < 0.01) { this.p[i * 3 + 1] = 0.01; this.v[i * 3 + 1] *= -0.4; this.v[i * 3] *= 0.6; this.v[i * 3 + 2] *= 0.6; }
      const len = 0.022;
      for (let a = 0; a < 3; a++) {
        this.pos[o + a] = this.p[i * 3 + a];
        this.pos[o + 3 + a] = this.p[i * 3 + a] - this.v[i * 3 + a] * len;
      }
      const c = k * 1.6;
      this.col[o] = c; this.col[o + 1] = c * 0.78; this.col[o + 2] = c * 0.42;
      this.col[o + 3] = c * 0.6; this.col[o + 4] = c * 0.3; this.col[o + 5] = 0;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
  }
}

class DecalPool {
  constructor(scene, tex, max, size, opts = {}) {
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.95,
      ...opts,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(size, size), mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.max = max;
    this.cursor = 0;
    scene.add(this.mesh);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.z = new THREE.Vector3(0, 0, 1);
  }

  add(point, normal, scale = 1) {
    this.q.setFromUnitVectors(this.z, normal);
    this.q.multiply(new THREE.Quaternion().setFromAxisAngle(this.z, Math.random() * Math.PI * 2));
    this.s.setScalar(scale);
    this.m.compose(point.clone().addScaledVector(normal, 0.012), this.q, this.s);
    this.mesh.setMatrixAt(this.cursor, this.m);
    this.cursor = (this.cursor + 1) % this.max;
    this.mesh.count = Math.min(this.max, this.mesh.count + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() { this.mesh.count = 0; this.cursor = 0; }
}

// Little chunks of stone/wood thrown out by impacts.
class Debris {
  constructor(scene, max) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), max);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.count = max;
    this.items = Array.from({ length: max }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0.01, t: 0 }));
    this.cursor = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.sv = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, c.setRGB(1, 1, 1));
    scene.add(this.mesh);
  }

  spawn(p, v, size, color) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const it = this.items[i];
    it.p.copy(p); it.v.copy(v); it.s = size; it.t = 1.6;
    it.w.set(R(-20, 20), R(-20, 20), R(-20, 20));
    this.mesh.setColorAt(i, new THREE.Color(color[0], color[1], color[2]));
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      if (it.t <= 0) { this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this.m); continue; }
      it.t -= dt;
      it.v.y -= 9.8 * dt;
      it.p.addScaledVector(it.v, dt);
      if (it.p.y < it.s * 0.5) { it.p.y = it.s * 0.5; it.v.y *= -0.3; it.v.x *= 0.5; it.v.z *= 0.5; it.w.multiplyScalar(0.5); }
      it.r.x += it.w.x * dt; it.r.y += it.w.y * dt; it.r.z += it.w.z * dt;
      const s = it.s * Math.min(1, it.t / 0.4);
      this.m.compose(it.p, this.q.setFromEuler(it.r), this.sv.set(s, s * 0.7, s * 0.9));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, camera) {
    buildTextures();
    this.scene = scene;
    this.camera = camera;
    this.smoke = new Particles(scene, TEX.smoke, 320, THREE.NormalBlending);
    this.sparks = new Particles(scene, TEX.spark, 200, THREE.AdditiveBlending);
    this.fire = new Particles(scene, TEX.glow, 160, THREE.AdditiveBlending);
    this.bloodP = new Particles(scene, TEX.smoke, 160, THREE.NormalBlending);
    this.streaks = new Streaks(scene, 220);
    this.debris = new Debris(scene, 90);
    this.holes = new DecalPool(scene, TEX.hole, 260, 0.11);
    this.bloodDecals = new DecalPool(scene, TEX.blood, 60, 0.9, { color: 0xffffff });
    // Fixed pool of lights (adding/removing lights forces shader recompiles).
    this.lights = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(0xffb35a, 0, 9, 2);
      scene.add(l);
      return { light: l, t: 0, peak: 0, dur: 1 };
    });
    // Tracers: camera-facing ribbons (bright core + wide glow) that travel along the shot.
    const ribbon = new THREE.PlaneGeometry(1, 1);
    ribbon.translate(-0.5, 0, 0); // origin at the head
    this.tracers = [];
    for (let i = 0; i < 28; i++) {
      const core = new THREE.Mesh(ribbon, new THREE.MeshBasicMaterial({ map: TEX.tracer, color: 0xfff0d0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const glow = new THREE.Mesh(ribbon, new THREE.MeshBasicMaterial({ map: TEX.tracer, color: 0xff9a40, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      core.visible = glow.visible = false;
      scene.add(core, glow);
      this.tracers.push({ core, glow, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, head: 0, t: 0, speed: 0 });
    }
    // Brass.
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.28 });
    const rifleShell = new THREE.CylinderGeometry(0.005, 0.0058, 0.039, 8);
    const pistolShell = new THREE.CylinderGeometry(0.0048, 0.0048, 0.02, 8);
    this.shells = [];
    for (let i = 0; i < 50; i++) {
      const m = new THREE.Mesh(i % 2 ? rifleShell : pistolShell, shellMat);
      m.visible = false;
      scene.add(m);
      this.shells.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, rifle: i % 2 === 1 });
    }
    this.shellCursor = 0;
    // World muzzle flashes for other soldiers: front star + two side flames along the barrel.
    this.flashes = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const mk = (tex, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      const front = mk(TEX.flashes[i % 4], 0.3, 0.3);
      const s1 = mk(TEX.flashSide, 0.42, 0.16);
      s1.geometry.translate(0.21, 0, 0);
      s1.rotation.y = Math.PI / 2;
      const s2 = s1.clone();
      s2.rotation.set(0, Math.PI / 2, Math.PI / 2);
      g.add(front, s1, s2);
      g.visible = false;
      scene.add(g);
      this.flashes.push({ group: g, front, t: 0 });
    }
    this.mags = [];
  }

  flashLight(pos, intensity = 6, dur = 0.06, color = 0xffb35a, range = 9) {
    const slot = this.lights.find((l) => l.t <= 0) || this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    slot.light.position.copy(pos);
    slot.light.color.set(color);
    slot.light.distance = range;
    slot.t = dur;
    slot.dur = dur;
    slot.peak = intensity;
  }

  // Muzzle flash seen from outside (bots). `dir` is the barrel direction.
  muzzle(pos, dir, big = 1) {
    const f = this.flashes.find((x) => x.t <= 0) || this.flashes[0];
    f.group.position.copy(pos);
    f.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    f.group.rotateZ(Math.random() * Math.PI);
    f.group.scale.setScalar(big * (0.8 + Math.random() * 0.5));
    f.front.lookAt(this.camera.position);
    f.group.visible = true;
    f.t = 0.05;
    this.flashLight(pos, 5 * big, 0.05);
    for (let i = 0; i < 2; i++) this.smoke.spawn(pos, dir.clone().multiplyScalar(1 + Math.random()), { size: 0.1, grow: 0.6, ttl: 0.7, color: [0.78, 0.76, 0.72], alpha: 0.22, drag: 3, gravity: -0.15 });
    this.fire.spawn(pos.clone().addScaledVector(dir, 0.05), dir.clone().multiplyScalar(2), { size: 0.14 * big, ttl: 0.05, color: [1, 0.8, 0.5], alpha: 0.9 });
  }

  // Thin smoke curling off a hot barrel.
  barrelSmoke(pos, amount = 1) {
    this.smoke.spawn(pos, new THREE.Vector3(R(-0.05, 0.05), 0.25 + Math.random() * 0.2, R(-0.05, 0.05)), { size: 0.035, grow: 0.22, ttl: 1.4, color: [0.85, 0.85, 0.85], alpha: 0.16 * amount, drag: 1.2, gravity: -0.05 });
  }

  tracer(from, to, speed = 700) {
    const len = from.distanceTo(to);
    if (len < 1.2) return;
    const t = this.tracers.find((x) => x.t <= 0) || this.tracers[0];
    t.from.copy(from);
    t.dir.subVectors(to, from).divideScalar(len);
    t.len = len;
    t.head = 0;
    t.speed = speed;
    t.t = len / speed + 0.03;
    t.core.visible = t.glow.visible = true;
  }

  updateTracer(t, dt) {
    t.t -= dt;
    t.head = Math.min(t.len, t.head + t.speed * dt);
    const tail = Math.min(3.2, t.head);
    const head = t.from.clone().addScaledVector(t.dir, t.head);
    // Billboard around the travel axis.
    const toCam = this.camera.position.clone().sub(head).normalize();
    const side = new THREE.Vector3().crossVectors(t.dir, toCam).normalize();
    const normal = new THREE.Vector3().crossVectors(t.dir, side);
    const m = new THREE.Matrix4().makeBasis(t.dir, side, normal);
    const fade = t.head >= t.len ? Math.max(0, t.t / 0.03) : 1;
    for (const [mesh, width, op] of [[t.core, 0.022, 0.95], [t.glow, 0.09, 0.3]]) {
      mesh.position.copy(head);
      mesh.quaternion.setFromRotationMatrix(m);
      mesh.scale.set(tail, width, 1);
      mesh.material.opacity = op * fade;
    }
    if (t.t <= 0) t.core.visible = t.glow.visible = false;
  }

  impact(point, normal, mat) {
    const n = normal;
    if (mat !== 'flesh') this.holes.add(point, n, 0.8 + Math.random() * 0.5);
    const dustColor = mat === 'wood' ? [0.55, 0.42, 0.3] : mat === 'metal' ? [0.5, 0.5, 0.5] : mat === 'ground' ? [0.72, 0.62, 0.48] : [0.82, 0.72, 0.56];
    // Directional puff plus a lingering cloud.
    for (let i = 0; i < 5; i++) {
      const v = n.clone().multiplyScalar(0.8 + Math.random() * 1.6).add(new THREE.Vector3(R(-0.5, 0.5), Math.random() * 0.5, R(-0.5, 0.5)));
      this.smoke.spawn(point, v, { size: 0.07 + Math.random() * 0.1, grow: 0.8, ttl: 0.6 + Math.random() * 0.8, color: dustColor, alpha: 0.6, drag: 3, gravity: -0.08 });
    }
    this.smoke.spawn(point.clone().addScaledVector(n, 0.1), n.clone().multiplyScalar(0.25), { size: 0.25, grow: 0.5, ttl: 2.2, color: dustColor, alpha: 0.25, drag: 1, gravity: -0.03 });
    // Chunks.
    const chunk = mat === 'wood' ? [0.45, 0.32, 0.2] : mat === 'metal' ? null : dustColor.map((c) => c * 0.8);
    if (chunk) for (let i = 0; i < 4; i++) {
      const v = n.clone().multiplyScalar(1.5 + Math.random() * 3).add(new THREE.Vector3(R(-1.5, 1.5), Math.random() * 2, R(-1.5, 1.5)));
      this.debris.spawn(point, v, R(0.008, 0.02), chunk);
    }
    // Tiny flash at the point of impact.
    this.fire.spawn(point.clone().addScaledVector(n, 0.02), new THREE.Vector3(), { size: mat === 'metal' ? 0.16 : 0.08, ttl: 0.05, color: [1, 0.85, 0.6], alpha: 0.8 });
    // Sparks: plenty on metal, occasional on stone.
    const ns = mat === 'metal' ? 12 : mat === 'wood' ? 0 : Math.random() < 0.35 ? 4 : 0;
    for (let i = 0; i < ns; i++) {
      const v = n.clone().multiplyScalar(2 + Math.random() * 5).add(new THREE.Vector3(R(-3, 3), Math.random() * 3, R(-3, 3)));
      this.streaks.spawn(point, v, 0.2 + Math.random() * 0.35);
    }
  }

  blood(point, dir, heavy) {
    // Fine mist, then heavier droplets.
    this.bloodP.spawn(point, dir.clone().multiplyScalar(0.6), { size: heavy ? 0.45 : 0.3, grow: 0.8, ttl: 0.5, color: [0.5, 0.03, 0.03], alpha: 0.55, drag: 3 });
    for (let i = 0; i < (heavy ? 14 : 7); i++) {
      const v = dir.clone().multiplyScalar(1 + Math.random() * 2.5).add(new THREE.Vector3(R(-0.8, 0.8), Math.random() * 1.2, R(-0.8, 0.8)));
      this.bloodP.spawn(point, v, { size: 0.03 + Math.random() * 0.06, grow: 0.05, ttl: 0.5 + Math.random() * 0.4, color: [0.4, 0.02, 0.02], alpha: 0.9, drag: 0.8, gravity: 9 });
    }
  }

  bloodSplat(point, normal, scale = 1) { this.bloodDecals.add(point, normal, scale); }

  explosion(pos) {
    this.flashLight(pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 60, 0.35, 0xffa040, 22);
    for (let i = 0; i < 30; i++) {
      const v = new THREE.Vector3(R(-0.5, 0.5), Math.random() * 0.8 + 0.1, R(-0.5, 0.5)).normalize().multiplyScalar(2 + Math.random() * 5);
      this.fire.spawn(pos.clone().add(new THREE.Vector3(0, 0.3, 0)), v, { size: 0.9 + Math.random() * 0.8, grow: 1.5, ttl: 0.25 + Math.random() * 0.3, color: [1, 0.6 + Math.random() * 0.3, 0.25], alpha: 1, drag: 5 });
    }
    for (let i = 0; i < 34; i++) {
      const v = new THREE.Vector3(R(-0.5, 0.5), Math.random() * 0.9, R(-0.5, 0.5)).normalize().multiplyScalar(1 + Math.random() * 4);
      this.smoke.spawn(pos.clone().add(new THREE.Vector3(0, 0.4, 0)), v, { size: 1 + Math.random(), grow: 1.8, ttl: 2 + Math.random() * 2, color: [0.28, 0.26, 0.24], alpha: 0.6, drag: 1.8, gravity: -0.4 });
    }
    for (let i = 0; i < 50; i++) {
      const v = new THREE.Vector3(R(-0.5, 0.5), Math.random(), R(-0.5, 0.5)).normalize().multiplyScalar(6 + Math.random() * 12);
      this.streaks.spawn(pos, v, 0.4 + Math.random() * 0.6);
    }
    for (let i = 0; i < 16; i++) {
      const v = new THREE.Vector3(R(-0.5, 0.5), Math.random() + 0.3, R(-0.5, 0.5)).normalize().multiplyScalar(4 + Math.random() * 6);
      this.debris.spawn(pos.clone().setY(0.1), v, R(0.02, 0.05), [0.35, 0.3, 0.25]);
    }
    this.holes.add(new THREE.Vector3(pos.x, 0.01, pos.z), new THREE.Vector3(0, 1, 0), 18);
  }

  shell(pos, vel, rifle = true) {
    let s = null;
    for (let k = 0; k < this.shells.length; k++) {
      const c = this.shells[(this.shellCursor + k) % this.shells.length];
      if (c.rifle === rifle) { s = c; this.shellCursor = (this.shellCursor + k + 1) % this.shells.length; break; }
    }
    s.mesh.position.copy(pos);
    s.vel.copy(vel);
    s.spin.set(R(10, 30), R(-10, 10), R(10, 30));
    s.mesh.visible = true;
    s.t = 5;
    s.bounced = 0;
  }

  // A released magazine tumbling to the floor (world space copy of the weapon's mag).
  dropMag(mag) {
    mag.updateMatrixWorld(true);
    const copy = mag.clone(true);
    mag.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
    copy.visible = true;
    copy.traverse((o) => { o.visible = true; if (o.isMesh) o.castShadow = true; });
    this.scene.add(copy);
    this.mags.push({ obj: copy, vel: new THREE.Vector3(R(-0.3, 0.3), -0.5, R(-0.3, 0.3)), spin: new THREE.Vector3(R(-4, 4), R(-2, 2), R(-4, 4)), t: 12, rest: false });
    if (this.mags.length > 24) { const old = this.mags.shift(); this.scene.remove(old.obj); }
  }

  update(dt) {
    this.smoke.update(dt);
    this.sparks.update(dt);
    this.fire.update(dt);
    this.bloodP.update(dt);
    this.streaks.update(dt);
    this.debris.update(dt);
    for (const l of this.lights) {
      if (l.t > 0) { l.t -= dt; l.light.intensity = l.peak * Math.max(0, l.t / l.dur); } else l.light.intensity = 0;
    }
    for (const f of this.flashes) { if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.group.visible = false; } }
    for (const t of this.tracers) if (t.t > 0) this.updateTracer(t, dt);
    for (const s of this.shells) {
      if (s.t <= 0) continue;
      s.t -= dt;
      s.vel.y -= 9.8 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.mesh.position.y < 0.006) {
        s.mesh.position.y = 0.006;
        s.vel.y *= -0.35; s.vel.x *= 0.6; s.vel.z *= 0.6;
        s.spin.multiplyScalar(0.5);
        if (!s.bounced && this.onShellBounce) this.onShellBounce(s.mesh.position);
        s.bounced = 1;
        if (Math.abs(s.vel.y) < 0.3) { s.spin.x = 0; s.mesh.rotation.x = Math.PI / 2; }
      }
      s.mesh.rotation.x += s.spin.x * dt; s.mesh.rotation.y += s.spin.y * dt; s.mesh.rotation.z += s.spin.z * dt;
      if (s.t <= 0) s.mesh.visible = false;
    }
    for (let i = this.mags.length - 1; i >= 0; i--) {
      const m = this.mags[i];
      m.t -= dt;
      if (!m.rest) {
        m.vel.y -= 9.8 * dt;
        m.obj.position.addScaledVector(m.vel, dt);
        m.obj.rotation.x += m.spin.x * dt; m.obj.rotation.y += m.spin.y * dt; m.obj.rotation.z += m.spin.z * dt;
        if (m.obj.position.y < 0.03) {
          m.obj.position.y = 0.03;
          if (Math.abs(m.vel.y) < 1.2) { m.rest = true; m.obj.rotation.set(Math.PI / 2, m.obj.rotation.y, 0); if (this.onMagLand) this.onMagLand(m.obj.position); }
          else { m.vel.y *= -0.3; m.vel.x *= 0.5; m.vel.z *= 0.5; m.spin.multiplyScalar(0.4); if (this.onMagLand) this.onMagLand(m.obj.position); }
        }
      }
      if (m.t <= 0) { this.scene.remove(m.obj); this.mags.splice(i, 1); }
    }
  }

  clearRound() {
    this.bloodDecals.clear();
    for (const m of this.mags) this.scene.remove(m.obj);
    this.mags = [];
  }
}
