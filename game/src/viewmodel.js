import * as THREE from 'three';
import { TEX } from './effects.js';
import { FirstPersonArms, updateMagazine } from './characters.js';

// Where the right-hand grip sits in camera space (meters) and the weapon's base tilt.
const HOLD = {
  knife: { pos: [0.16, -0.2, -0.38], rot: [0.35, 0.25, 0] },
  usp: { pos: [0.1, -0.175, -0.53], rot: [0.03, 0.06, 0] },
  glock: { pos: [0.1, -0.175, -0.53], rot: [0.03, 0.06, 0] },
  deagle: { pos: [0.1, -0.18, -0.55], rot: [0.03, 0.06, 0] },
  mp9: { pos: [0.14, -0.215, -0.3], rot: [0.02, 0.05, 0] },
  ak47: { pos: [0.15, -0.215, -0.24], rot: [0.02, 0.05, 0] },
  m4a4: { pos: [0.15, -0.21, -0.22], rot: [0.02, 0.05, 0] },
  awp: { pos: [0.15, -0.215, -0.18], rot: [0.02, 0.05, 0] },
  he: { pos: [0.17, -0.2, -0.36], rot: [0.3, 0, 0] },
};

class Spring {
  constructor(k = 120, d = 14) { this.k = k; this.d = d; this.x = new THREE.Vector3(); this.v = new THREE.Vector3(); }
  impulse(v) { this.v.add(v); }
  update(dt) {
    // Sub-step for stability at low frame rates.
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.x.clone().multiplyScalar(-this.k).addScaledVector(this.v, -this.d);
      this.v.addScaledVector(a, h);
      this.x.addScaledVector(this.v, h);
    }
  }
}

const smooth = (x) => x * x * (3 - 2 * x);
const clamp = THREE.MathUtils.clamp;

export class ViewModel {
  constructor(assets, team) {
    this.assets = assets;
    this.scene = new THREE.Scene();
    this.scene.environment = assets.envMap;
    this.baseFov = 58;
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.01, 10);
    this.scene.add(this.camera);
    this.key = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.key.position.set(-0.5, 1, 0.4);
    this.camera.add(this.key);
    this.camera.add(this.key.target);
    this.fill = new THREE.HemisphereLight(0xcfe1ff, 0x6b5238, 0.75);
    this.scene.add(this.fill);
    // Muzzle light: lights the gun and the gloves on every shot.
    this.flashLight = new THREE.PointLight(0xffb060, 0, 1.6, 2);
    this.camera.add(this.flashLight);
    this.rig = new THREE.Group();
    this.camera.add(this.rig);
    this.arms = new FirstPersonArms(assets, team);
    this.camera.add(this.arms.root);
    this.models = {};
    this.current = null;
    this.currentId = null;
    this.kick = new Spring(170, 17);
    this.rotKick = new Spring(150, 14);
    this.inertia = new Spring(90, 12); // lags behind acceleration
    this.sway = new THREE.Vector2();
    this.swayLag = new THREE.Vector2();
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.anim = null; // {type, t, dur}
    this.reloadT = null;
    this.reloadDur = 1;
    this.land = 0;
    this.ads = 0; // 0 hip .. 1 aiming down the sights
    this.block = 0; // weapon pushed back by a nearby wall
    this.prevVel = new THREE.Vector3();
    this.buildFlash();
  }

  buildFlash() {
    const add = (tex, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.flash = new THREE.Group();
    this.flashFront = add(TEX.flashes[0], 0.15, 0.15);
    this.flashCore = add(TEX.glow, 0.09, 0.09);
    this.flashCore.position.z = 0.01;
    const side1 = add(TEX.flashSide, 0.24, 0.1);
    side1.rotation.y = Math.PI / 2;
    side1.position.z = -0.11;
    const side2 = side1.clone();
    side2.rotation.z = Math.PI / 2;
    this.flashSides = [side1, side2];
    this.flash.add(this.flashFront, this.flashCore, side1, side2);
    this.flash.visible = false;
    this.flashT = 0;
    this.smokeT = 0;
  }

  setWeapon(id) {
    if (this.currentId === id) return;
    if (this.current) this.rig.remove(this.current);
    if (!this.models[id]) {
      const m = this.assets.weaponModel(id);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      this.prepareSights(m);
      this.models[id] = m;
    }
    const m = this.models[id];
    this.current = m;
    this.currentId = id;
    const h = HOLD[id];
    m.userData.basePos = new THREE.Vector3(...h.pos);
    m.userData.baseQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...h.rot));
    this.rig.add(m);
    m.add(this.flash);
    this.flash.position.copy(m.userData.muzzle).add(new THREE.Vector3(0, 0, -0.015));
    this.reloadT = null;
    this.startAnim('draw', id === 'awp' ? 0.8 : 0.55);
  }

  // Aim-down-sights pose: rear notch and front post lined up on the view axis.
  prepareSights(m) {
    const s = m.userData.rig.sight;
    if (!s) return;
    const u = s.front.clone().sub(s.rear).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(u, new THREE.Vector3(0, 0, -1));
    m.userData.adsQuat = q;
    m.userData.adsPos = new THREE.Vector3(0, 0, -s.relief).sub(s.rear.clone().applyQuaternion(q));
    m.userData.adsZoom = s.zoom;
    // Tritium dot on the front post, like real night sights.
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 10, 8), new THREE.MeshBasicMaterial({ color: 0x9dff6a, toneMapped: false }));
    dot.position.copy(s.front).add(new THREE.Vector3(0, -0.0022, 0.001));
    m.add(dot);
  }

  get canAds() { return !!(this.current && this.current.userData.adsPos); }
  get adsZoom() { return this.current?.userData.adsZoom ?? 1; }

  startAnim(type, dur) { this.anim = { type, t: 0, dur }; }

  fire(def) {
    const hip = 1 - this.ads;
    const k = (def.slot === 1 ? 1 : def.id === 'deagle' ? 1.6 : 0.8) * (0.55 + hip * 0.45);
    this.kick.impulse(new THREE.Vector3((Math.random() - 0.5) * 0.02 * hip, 0.012 * k, 0.55 * k * (def.id === 'awp' ? 1.8 : 1)));
    this.rotKick.impulse(new THREE.Vector3(0.9 * k * (def.id === 'awp' ? 2 : 1), (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6 * hip));
    if (!def.suppressed && def.id !== 'knife' && !def.grenade) {
      this.flash.visible = true;
      this.flashFront.material.map = TEX.flashes[(Math.random() * TEX.flashes.length) | 0];
      this.flashFront.rotation.z = Math.random() * Math.PI * 2;
      const s = (def.slot === 1 ? 1.5 : 1.1) * (0.8 + Math.random() * 0.45);
      this.flash.scale.setScalar(s);
      for (const sd of this.flashSides) sd.scale.set(0.7 + Math.random() * 0.6, 0.8 + Math.random() * 0.4, 1);
      this.flashT = 0.045;
      this.flashLight.intensity = def.slot === 1 ? 4 : 2.5;
    } else if (def.suppressed) {
      this.flashLight.intensity = 0.4;
      this.flashT = 0.03;
    }
    this.smokeT = Math.min(2.5, this.smokeT + 0.35);
    if (def.id === 'awp') this.startAnim('bolt', 1.3);
  }

  knifeSwing(alt) { this.startAnim(alt ? 'stab' : (Math.random() < 0.5 ? 'slashL' : 'slashR'), alt ? 0.8 : 0.42); }
  reload(dur) { this.reloadT = 0; this.reloadDur = dur; }
  throwNade() { this.startAnim('throw', 0.6); }
  inspect() { if (!this.anim && this.reloadT === null) this.startAnim('inspect', this.currentId === 'knife' ? 2.2 : 3.2); }
  onLand(v) { this.land = Math.min(1, v / 8); this.inertia.impulse(new THREE.Vector3(0, -Math.min(0.6, v * 0.05), 0)); }

  // Muzzle position in camera space (for smoke / tracers in the world view).
  muzzleCameraSpace(out = new THREE.Vector3()) {
    if (!this.current) return out.set(0.1, -0.1, -0.6);
    this.current.updateMatrixWorld(true);
    out.copy(this.current.userData.muzzle).applyMatrix4(this.current.matrixWorld);
    return this.camera.worldToLocal(out);
  }

  // vel: player velocity in camera space (x right, y up, z backward).
  update(dt, { mouseDX, mouseDY, speed, onGround, crouch, hidden, sunDir, ads = false, vel, wallDist = 99 }) {
    if (!this.current) return;
    this.rig.visible = !hidden;
    this.arms.root.visible = !hidden;
    const m = this.current;
    const ud = m.userData;
    const busy = this.reloadT !== null || (this.anim && this.anim.type !== 'bolt');

    // Weapon pushed back when the muzzle would clip into a wall.
    const reach = -ud.front + (-ud.basePos.z) + 0.05;
    const wantBlock = clamp((reach - wallDist) / 0.35, 0, 1);
    this.block += (wantBlock - this.block) * Math.min(1, dt * 10);

    const wantAds = ads && this.canAds && !busy && this.block < 0.3 ? 1 : 0;
    this.ads += (wantAds - this.ads) * Math.min(1, dt * (wantAds ? 11 : 14));
    const a = smooth(clamp(this.ads, 0, 1));
    const hip = 1 - a * 0.8;

    // Mouse sway: the gun trails behind the view, then springs back.
    const tx = clamp(-mouseDX * 0.0009, -0.07, 0.07), ty = clamp(-mouseDY * 0.0009, -0.06, 0.06);
    this.sway.x += (tx - this.sway.x) * Math.min(1, dt * 9);
    this.sway.y += (ty - this.sway.y) * Math.min(1, dt * 9);
    this.swayLag.x += (this.sway.x - this.swayLag.x) * Math.min(1, dt * 5);
    this.swayLag.y += (this.sway.y - this.swayLag.y) * Math.min(1, dt * 5);

    // Inertia from acceleration (starting, stopping, strafing, jumping).
    const v = vel || new THREE.Vector3();
    if (dt > 0) {
      const acc = v.clone().sub(this.prevVel).divideScalar(dt);
      this.inertia.impulse(new THREE.Vector3(-acc.x, -acc.y * 0.6, -acc.z).multiplyScalar(0.0009 * dt * 60));
    }
    this.prevVel.copy(v);
    this.kick.update(dt);
    this.rotKick.update(dt);
    this.inertia.update(dt);

    // Walk cycle: figure-of-eight, slower and smaller when crouched or aiming.
    const moving = onGround ? clamp(speed / 5.5, 0, 1) : 0;
    this.bobAmt += (moving - this.bobAmt) * Math.min(1, dt * 6);
    this.bobPhase += dt * (3.2 + speed * 1.45) * (crouch > 0.5 ? 0.7 : 1);
    const t = performance.now() / 1000;
    const amp = this.bobAmt * (1 - a * 0.75);
    const bx = Math.sin(this.bobPhase) * 0.012 * amp;
    const by = (Math.cos(this.bobPhase * 2) * 0.5 - 0.5) * 0.013 * amp;
    // Breathing / hand tremor (smaller when aiming, a little larger with pistols).
    const br = (1 - a * 0.6) * (ud.rig.kind === 'pistol' ? 1.3 : 1);
    const breatheX = (Math.sin(t * 0.9) * 0.0018 + Math.sin(t * 2.3) * 0.0006) * br;
    const breatheY = (Math.sin(t * 1.6) * 0.0022 + Math.sin(t * 3.1) * 0.0005) * br;

    // Base pose: hip → ADS blend.
    const pos = ud.basePos.clone();
    const quat = ud.baseQuat.clone();
    if (ud.adsPos && a > 0) {
      pos.lerp(ud.adsPos, a);
      quat.slerp(ud.adsQuat, a);
    }
    pos.y -= crouch * 0.012 * hip;
    pos.x += (bx + this.swayLag.x * 0.35 + breatheX) * hip;
    pos.y += (by + breatheY) * hip - this.land * 0.035 * hip;
    pos.x += clamp(this.inertia.x.x, -0.03, 0.03) * hip;
    pos.y += clamp(this.inertia.x.y, -0.03, 0.03) * hip + clamp(-v.y * 0.0035, -0.025, 0.025) * (onGround ? 0 : 1) * hip;
    pos.z += clamp(this.inertia.x.z, -0.03, 0.03) * hip;
    pos.add(new THREE.Vector3(this.kick.x.x, this.kick.x.y * 0.2, this.kick.x.z * (0.08 - a * 0.03)));
    const e = new THREE.Euler(
      (this.swayLag.y + Math.cos(this.bobPhase * 2) * 0.006 * amp) * hip + this.rotKick.x.x * (0.06 - a * 0.025) + breatheY * 0.6,
      this.swayLag.x * hip + this.rotKick.x.y * 0.04 * hip + breatheX * 0.6,
      (this.swayLag.x * 0.8 - bx * 2 - clamp(v.x * 0.012, -0.08, 0.08)) * hip + this.rotKick.x.z * 0.04,
    );

    if (this.anim) {
      const an = this.anim;
      an.t += dt;
      const p = Math.min(1, an.t / an.dur);
      const ease = (x) => 1 - Math.pow(1 - x, 3);
      const bell = (x) => Math.sin(Math.PI * x);
      switch (an.type) {
        case 'draw': { const k = 1 - ease(p); pos.y -= k * 0.22; e.x -= k * 0.9; e.z += k * 0.3; break; }
        case 'bolt': { const b = bell(Math.min(1, p / 0.7)); e.z += b * 0.3; pos.y -= b * 0.02; e.x -= b * 0.06; break; }
        case 'slashL':
        case 'slashR': {
          const s = an.type === 'slashL' ? 1 : -1;
          const b = bell(p);
          e.y += s * (0.9 - p * 1.8) * b; e.x -= b * 0.5; e.z += s * b * 0.7; pos.x -= s * b * 0.12; pos.z -= b * 0.08;
          break;
        }
        case 'stab': { const b = p < 0.3 ? ease(p / 0.3) : 1 - ease((p - 0.3) / 0.7); pos.z -= b * 0.2; pos.y += b * 0.03; e.x -= b * 0.2; break; }
        case 'throw': { const b = bell(p); e.x -= b * 1.4; pos.y += b * 0.08; pos.z -= b * 0.12; break; }
        case 'inspect': {
          // Turn the gun to show the left side, then roll it to look at the ejection port.
          const k1 = smooth(clamp(p / 0.2, 0, 1)) * (1 - smooth(clamp((p - 0.45) / 0.15, 0, 1)));
          const k2 = smooth(clamp((p - 0.45) / 0.15, 0, 1)) * (1 - smooth(clamp((p - 0.8) / 0.2, 0, 1)));
          e.y += k1 * 0.95 - k2 * 0.35;
          e.z += k1 * 0.35 - k2 * 0.9;
          e.x += k1 * 0.1 + k2 * 0.25;
          pos.x -= (k1 * 0.07 + k2 * 0.05);
          pos.y += (k1 * 0.04 + k2 * 0.05);
          pos.z += k1 * 0.05;
          break;
        }
      }
      if (p >= 1) this.anim = null;
    }
    // Pressed against a wall: tuck the muzzle down and in.
    if (this.block > 0.001) {
      const b = smooth(this.block);
      pos.z += b * 0.1; pos.y -= b * 0.05; pos.x -= b * 0.02;
      e.x -= b * 0.7; e.y += b * 0.25;
    }

    if (this.reloadT !== null) {
      this.reloadT += dt / this.reloadDur;
      if (this.reloadT >= 1) this.reloadT = null;
    }
    m.position.copy(pos);
    m.quaternion.setFromEuler(e).multiply(quat);
    // Reload tilt (from last frame's pose): bring the magazine well into view.
    const rpNow = this.reloadT !== null ? this.arms.reload.pose : null;
    if (rpNow && rpNow.tilt) {
      const k = rpNow.env || 0;
      m.position.y += rpNow.tilt.y + k * 0.05;
      m.position.x -= k * 0.04;
      m.rotateZ(rpNow.tilt.z);
      m.rotateX(rpNow.tilt.x + k * 0.08);
    }
    // The viewmodel camera zooms a touch with the world camera so the sights stay crisp.
    const vf = this.baseFov * (1 - a * (1 - this.adsZoom) * 0.9);
    if (Math.abs(this.camera.fov - vf) > 0.01) { this.camera.fov = vf; this.camera.updateProjectionMatrix(); }
    this.camera.updateMatrixWorld(true);
    m.updateMatrixWorld(true);
    const rp = this.arms.pose(dt, hidden ? null : m, this.reloadT);
    updateMagazine(m, rp || {}, !!rp, dt);

    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flashLight.position.copy(this.muzzleCameraSpace());
      if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
    }
    this.smokeT = Math.max(0, this.smokeT - dt);
    this.land = Math.max(0, this.land - dt * 3);
    if (sunDir) {
      const local = sunDir.clone().applyQuaternion(this.camera.quaternion.clone().invert());
      this.key.position.copy(local);
    }
  }

  get reloading() { return this.reloadT !== null; }
}
