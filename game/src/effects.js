import * as THREE from 'three';

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const TEX = {};
function buildTextures() {
  if (TEX.smoke) return;
  TEX.smoke = canvasTexture(128, (ctx, s) => {
    for (let i = 0; i < 14; i++) {
      const x = s / 2 + (Math.random() - 0.5) * s * 0.35, y = s / 2 + (Math.random() - 0.5) * s * 0.35;
      const r = s * (0.18 + Math.random() * 0.2);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
  });
  TEX.glow = canvasTexture(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,220,160,0.8)');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  TEX.flash = canvasTexture(256, (ctx, s) => {
    ctx.translate(s / 2, s / 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.22);
    g.addColorStop(0, 'rgba(255,255,240,1)');
    g.addColorStop(0.4, 'rgba(255,200,90,0.9)');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 7; i++) {
      ctx.rotate((Math.PI * 2) / 7 + Math.random() * 0.3);
      const len = s * (0.3 + Math.random() * 0.18);
      const pg = ctx.createLinearGradient(0, 0, len, 0);
      pg.addColorStop(0, 'rgba(255,230,160,0.95)');
      pg.addColorStop(1, 'rgba(255,120,20,0)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.moveTo(0, -s * 0.03); ctx.lineTo(len, 0); ctx.lineTo(0, s * 0.03); ctx.fill();
    }
  });
  TEX.flashSide = canvasTexture(256, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, 'rgba(255,245,220,1)');
    g.addColorStop(0.35, 'rgba(255,190,80,0.85)');
    g.addColorStop(1, 'rgba(255,100,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, s / 2 - s * 0.14);
    ctx.quadraticCurveTo(s * 0.6, s / 2 - s * 0.2, s, s / 2);
    ctx.quadraticCurveTo(s * 0.6, s / 2 + s * 0.2, 0, s / 2 + s * 0.14);
    ctx.fill();
  });
  TEX.hole = canvasTexture(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(10,8,6,1)');
    g.addColorStop(0.22, 'rgba(20,16,12,0.95)');
    g.addColorStop(0.32, 'rgba(60,48,36,0.7)');
    g.addColorStop(0.6, 'rgba(90,75,60,0.25)');
    g.addColorStop(1, 'rgba(90,75,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(25,20,15,0.6)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, r = s * (0.28 + Math.random() * 0.15);
      ctx.beginPath(); ctx.moveTo(s / 2 + Math.cos(a) * s * 0.12, s / 2 + Math.sin(a) * s * 0.12); ctx.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r); ctx.stroke();
    }
  });
  TEX.blood = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = 'rgba(95,8,8,0.9)';
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() ** 2 * s * 0.38;
      const r = s * (0.02 + Math.random() * 0.08) * (1 - d / (s * 0.45));
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
      this.col[i * 4 + 3] = this.alpha0[i] * k * (k < 1 ? 1 : 0);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
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
    const spin = new THREE.Quaternion().setFromAxisAngle(this.z, Math.random() * Math.PI * 2);
    this.q.multiply(spin);
    this.s.setScalar(scale);
    const p = point.clone().addScaledVector(normal, 0.012);
    this.m.compose(p, this.q, this.s);
    this.mesh.setMatrixAt(this.cursor, this.m);
    this.cursor = (this.cursor + 1) % this.max;
    this.mesh.count = Math.min(this.max, this.mesh.count + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() { this.mesh.count = 0; this.cursor = 0; }
}

export class Effects {
  constructor(scene) {
    buildTextures();
    this.scene = scene;
    this.smoke = new Particles(scene, TEX.smoke, 260, THREE.NormalBlending);
    this.sparks = new Particles(scene, TEX.spark, 200, THREE.AdditiveBlending);
    this.fire = new Particles(scene, TEX.glow, 120, THREE.AdditiveBlending);
    this.bloodP = new Particles(scene, TEX.smoke, 140, THREE.NormalBlending);
    this.holes = new DecalPool(scene, TEX.hole, 220, 0.11);
    this.bloodDecals = new DecalPool(scene, TEX.blood, 60, 0.9, { color: 0xffffff });
    // Fixed pool of lights (adding/removing lights forces shader recompiles).
    this.lights = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(0xffb35a, 0, 9, 2);
      scene.add(l);
      return { light: l, t: 0, peak: 0 };
    });
    this.flashes = [];
    this.tracers = [];
    const tg = new THREE.CylinderGeometry(0.008, 0.008, 1, 4, 1, true);
    tg.rotateX(Math.PI / 2);
    tg.translate(0, 0, -0.5);
    this.tracerGeo = tg;
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(tg, this.tracerMat.clone());
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, t: 0 });
    }
    // Brass.
    const shellGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 8);
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 });
    this.shells = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(shellGeo, shellMat);
      m.visible = false;
      m.castShadow = false;
      scene.add(m);
      this.shells.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0 });
    }
    this.shellCursor = 0;
    // World muzzle flash sprites (for bots).
    this.flashMat = new THREE.SpriteMaterial({ map: TEX.flash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(this.flashMat);
      s.visible = false;
      scene.add(s);
      this.flashes.push({ sprite: s, t: 0 });
    }
  }

  flashLight(pos, intensity = 6, dur = 0.06, color = 0xffb35a, range = 9) {
    let slot = this.lights.find((l) => l.t <= 0) || this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    slot.light.position.copy(pos);
    slot.light.color.set(color);
    slot.light.distance = range;
    slot.t = dur;
    slot.dur = dur;
    slot.peak = intensity;
  }

  muzzle(pos, dir) {
    const f = this.flashes.find((x) => x.t <= 0) || this.flashes[0];
    f.sprite.position.copy(pos).addScaledVector(dir, 0.05);
    f.sprite.scale.setScalar(0.35 + Math.random() * 0.15);
    f.sprite.material.rotation = Math.random() * Math.PI;
    f.sprite.visible = true;
    f.t = 0.045;
    this.flashLight(pos, 5, 0.05);
    this.smoke.spawn(pos, dir.clone().multiplyScalar(1.2), { size: 0.12, grow: 0.5, ttl: 0.5, color: [0.8, 0.8, 0.8], alpha: 0.25, drag: 3 });
  }

  tracer(from, to) {
    const t = this.tracers.find((x) => x.t <= 0) || this.tracers[0];
    const len = from.distanceTo(to);
    if (len < 1.5) return;
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, len);
    t.mesh.visible = true;
    t.mesh.material.opacity = 0.75;
    t.t = 0.07;
  }

  impact(point, normal, mat) {
    const n = normal;
    if (mat !== 'flesh') this.holes.add(point, n, 0.8 + Math.random() * 0.5);
    const dustColor = mat === 'wood' ? [0.55, 0.42, 0.3] : mat === 'metal' ? [0.5, 0.5, 0.5] : mat === 'ground' ? [0.72, 0.62, 0.48] : [0.82, 0.72, 0.56];
    for (let i = 0; i < 4; i++) {
      const v = n.clone().multiplyScalar(0.6 + Math.random() * 1.2).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8));
      this.smoke.spawn(point, v, { size: 0.08 + Math.random() * 0.1, grow: 0.7, ttl: 0.7 + Math.random() * 0.6, color: dustColor, alpha: 0.55, drag: 2.5, gravity: -0.1 });
    }
    for (let i = 0; i < 5; i++) {
      const v = n.clone().multiplyScalar(2 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3));
      this.smoke.spawn(point, v, { size: 0.025, ttl: 0.5, color: dustColor.map((c) => c * 0.6), alpha: 0.9, gravity: 9.8, drag: 0.5 });
    }
    if (mat === 'metal' || Math.random() < 0.25) {
      for (let i = 0; i < (mat === 'metal' ? 8 : 3); i++) {
        const v = n.clone().multiplyScalar(2 + Math.random() * 4).add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4));
        this.sparks.spawn(point, v, { size: 0.03, ttl: 0.15 + Math.random() * 0.25, color: [1, 0.75, 0.4], alpha: 1, gravity: 9.8 });
      }
    }
  }

  blood(point, dir, heavy) {
    for (let i = 0; i < (heavy ? 12 : 6); i++) {
      const v = dir.clone().multiplyScalar(1 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5));
      this.bloodP.spawn(point, v, { size: 0.06 + Math.random() * 0.1, grow: 0.3, ttl: 0.4 + Math.random() * 0.4, color: [0.45, 0.02, 0.02], alpha: 0.85, drag: 2, gravity: 4 });
    }
  }

  bloodSplat(point, normal, scale = 1) { this.bloodDecals.add(point, normal, scale); }

  explosion(pos) {
    this.flashLight(pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 60, 0.35, 0xffa040, 22);
    for (let i = 0; i < 26; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8 + 0.1, (Math.random() - 0.5)).normalize().multiplyScalar(2 + Math.random() * 5);
      this.fire.spawn(pos.clone().add(new THREE.Vector3(0, 0.3, 0)), v, { size: 0.9 + Math.random() * 0.8, grow: 1.5, ttl: 0.25 + Math.random() * 0.3, color: [1, 0.6 + Math.random() * 0.3, 0.25], alpha: 1, drag: 5 });
    }
    for (let i = 0; i < 30; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.9, (Math.random() - 0.5)).normalize().multiplyScalar(1 + Math.random() * 4);
      this.smoke.spawn(pos.clone().add(new THREE.Vector3(0, 0.4, 0)), v, { size: 1 + Math.random(), grow: 1.8, ttl: 2 + Math.random() * 2, color: [0.28, 0.26, 0.24], alpha: 0.6, drag: 1.8, gravity: -0.4 });
    }
    for (let i = 0; i < 40; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random(), (Math.random() - 0.5)).normalize().multiplyScalar(6 + Math.random() * 10);
      this.sparks.spawn(pos, v, { size: 0.05, ttl: 0.4 + Math.random() * 0.6, color: [1, 0.7, 0.3], alpha: 1, gravity: 9.8 });
    }
    this.holes.add(new THREE.Vector3(pos.x, 0.01, pos.z), new THREE.Vector3(0, 1, 0), 18);
  }

  shell(pos, vel) {
    const s = this.shells[this.shellCursor];
    this.shellCursor = (this.shellCursor + 1) % this.shells.length;
    s.mesh.position.copy(pos);
    s.vel.copy(vel);
    s.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    s.mesh.visible = true;
    s.t = 4;
    s.bounced = 0;
  }

  update(dt) {
    this.smoke.update(dt);
    this.sparks.update(dt);
    this.fire.update(dt);
    this.bloodP.update(dt);
    for (const l of this.lights) {
      if (l.t > 0) { l.t -= dt; l.light.intensity = l.peak * Math.max(0, l.t / l.dur); } else l.light.intensity = 0;
    }
    for (const f of this.flashes) { if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.sprite.visible = false; } }
    for (const t of this.tracers) {
      if (t.t > 0) { t.t -= dt; t.mesh.material.opacity = Math.max(0, t.t / 0.07) * 0.75; if (t.t <= 0) t.mesh.visible = false; }
    }
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
      }
      s.mesh.rotation.x += s.spin.x * dt; s.mesh.rotation.y += s.spin.y * dt; s.mesh.rotation.z += s.spin.z * dt;
      if (s.t <= 0) s.mesh.visible = false;
    }
  }

  clearRound() {
    this.bloodDecals.clear();
  }
}
