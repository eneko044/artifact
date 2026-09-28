import * as THREE from 'three';
import { WEAPONS } from './config.js';
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
    const a = this.x.clone().multiplyScalar(-this.k).addScaledVector(this.v, -this.d);
    this.v.addScaledVector(a, dt);
    this.x.addScaledVector(this.v, dt);
  }
}

export class ViewModel {
  constructor(assets, team) {
    this.assets = assets;
    this.scene = new THREE.Scene();
    this.scene.environment = assets.envMap;
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
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
    this.rig = new THREE.Group(); // sway/bob/recoil
    this.camera.add(this.rig);
    this.arms = new FirstPersonArms(assets, team);
    this.camera.add(this.arms.root);
    this.models = {};
    this.current = null;
    this.currentId = null;
    this.kick = new Spring(160, 16);
    this.rotKick = new Spring(140, 13);
    this.sway = new THREE.Vector2();
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.anim = null; // {type, t, dur}
    this.reloadT = null;
    this.reloadDur = 1;
    this.land = 0;
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
      this.models[id] = m;
    }
    const m = this.models[id];
    this.current = m;
    this.currentId = id;
    const h = HOLD[id];
    m.userData.basePos = new THREE.Vector3(...h.pos);
    m.userData.baseRot = new THREE.Euler(...h.rot);
    this.rig.add(m);
    m.add(this.flash);
    this.flash.position.copy(m.userData.muzzle).add(new THREE.Vector3(0, 0, -0.015));
    this.reloadT = null;
    this.startAnim('draw', id === 'awp' ? 0.8 : 0.55);
  }

  startAnim(type, dur) { this.anim = { type, t: 0, dur }; }

  fire(def) {
    const k = def.slot === 1 ? 1 : def.id === 'deagle' ? 1.6 : 0.8;
    this.kick.impulse(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.012 * k, 0.55 * k * (def.id === 'awp' ? 1.8 : 1)));
    this.rotKick.impulse(new THREE.Vector3(0.9 * k * (def.id === 'awp' ? 2 : 1), (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6));
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
  onLand(v) { this.land = Math.min(1, v / 8); }

  // Muzzle position in camera space (for smoke / tracers in the world view).
  muzzleCameraSpace(out = new THREE.Vector3()) {
    if (!this.current) return out.set(0.1, -0.1, -0.6);
    this.current.updateMatrixWorld(true);
    out.copy(this.current.userData.muzzle).applyMatrix4(this.current.matrixWorld);
    return this.camera.worldToLocal(out);
  }

  update(dt, { mouseDX, mouseDY, speed, onGround, crouch, hidden, sunDir }) {
    if (!this.current) return;
    this.rig.visible = !hidden;
    this.arms.root.visible = !hidden;
    this.sway.x += (THREE.MathUtils.clamp(-mouseDX * 0.0009, -0.06, 0.06) - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (THREE.MathUtils.clamp(-mouseDY * 0.0009, -0.05, 0.05) - this.sway.y) * Math.min(1, dt * 10);
    const moving = onGround ? THREE.MathUtils.clamp(speed / 5.5, 0, 1) : 0;
    this.bobAmt += (moving - this.bobAmt) * Math.min(1, dt * 6);
    this.bobPhase += dt * (4 + speed * 1.45);
    const t = performance.now() / 1000;
    const breathe = Math.sin(t * 1.6) * 0.002;
    const bx = Math.sin(this.bobPhase) * 0.011 * this.bobAmt;
    const by = -Math.abs(Math.cos(this.bobPhase)) * 0.012 * this.bobAmt + breathe;
    this.land = Math.max(0, this.land - dt * 3);
    this.kick.update(dt);
    this.rotKick.update(dt);

    const m = this.current;
    const bp = m.userData.basePos, br = m.userData.baseRot;
    const pos = new THREE.Vector3(bp.x + bx + this.sway.x * 0.4, bp.y + by - crouch * 0.012 - this.land * 0.04, bp.z);
    const rot = new THREE.Euler(br.x + this.sway.y, br.y + this.sway.x, br.z + this.sway.x * 0.8 - bx * 2);
    pos.add(new THREE.Vector3(this.kick.x.x, this.kick.x.y * 0.2, this.kick.x.z * 0.08));
    rot.x += this.rotKick.x.x * 0.06;
    rot.y += this.rotKick.x.y * 0.04;
    rot.z += this.rotKick.x.z * 0.04;

    if (this.anim) {
      const a = this.anim;
      a.t += dt;
      const p = Math.min(1, a.t / a.dur);
      const ease = (x) => 1 - Math.pow(1 - x, 3);
      const bell = (x) => Math.sin(Math.PI * x);
      switch (a.type) {
        case 'draw': { const e = 1 - ease(p); pos.y -= e * 0.22; rot.x -= e * 0.9; rot.z += e * 0.3; break; }
        case 'bolt': { const b = bell(Math.min(1, p / 0.7)); rot.z += b * 0.3; pos.y -= b * 0.02; rot.x -= b * 0.06; break; }
        case 'slashL':
        case 'slashR': {
          const s = a.type === 'slashL' ? 1 : -1;
          const b = bell(p);
          rot.y += s * (0.9 - p * 1.8) * b; rot.x -= b * 0.5; rot.z += s * b * 0.7; pos.x -= s * b * 0.12; pos.z -= b * 0.08;
          break;
        }
        case 'stab': { const b = p < 0.3 ? ease(p / 0.3) : 1 - ease((p - 0.3) / 0.7); pos.z -= b * 0.2; pos.y += b * 0.03; rot.x -= b * 0.2; break; }
        case 'throw': { const b = bell(p); rot.x -= b * 1.4; pos.y += b * 0.08; pos.z -= b * 0.12; break; }
      }
      if (p >= 1) this.anim = null;
    }
    // Reload progress drives the arms, the magazine and a tilt toward the support hand.
    let rp = null;
    if (this.reloadT !== null) {
      this.reloadT += dt / this.reloadDur;
      if (this.reloadT >= 1) this.reloadT = null;
    }
    m.position.copy(pos);
    m.rotation.copy(rot);
    // First apply the tilt of the reload pose (computed from the last frame's progress).
    const rpNow = this.reloadT !== null ? this.arms.reload.pose : null;
    if (rpNow && rpNow.tilt) {
      // Bring the gun up and in so the magazine well is in view.
      const e = rpNow.env || 0;
      m.position.y += rpNow.tilt.y + e * 0.05;
      m.position.x -= e * 0.04;
      m.rotateZ(rpNow.tilt.z);
      m.rotateX(rpNow.tilt.x + e * 0.08);
    }
    this.camera.updateMatrixWorld(true);
    m.updateMatrixWorld(true);
    rp = this.arms.pose(dt, hidden ? null : m, this.reloadT);
    updateMagazine(m, rp || {}, !!rp, dt);

    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flashLight.position.copy(this.muzzleCameraSpace());
      if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
    }
    this.smokeT = Math.max(0, this.smokeT - dt);
    if (sunDir) {
      const local = sunDir.clone().applyQuaternion(this.camera.quaternion.clone().invert());
      this.key.position.copy(local);
    }
  }

  get reloading() { return this.reloadT !== null; }
}
