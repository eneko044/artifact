import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { WEAPONS } from './config.js';
import { TEX } from './effects.js';

// Per-weapon placement of the first-person model (camera space, meters/radians).
const HOLD = {
  knife: { pos: [0.16, -0.17, -0.3], rot: [0.1, 0.15, -0.35] },
  usp: { pos: [0.14, -0.15, -0.42], rot: [0, 0.03, 0] },
  glock: { pos: [0.14, -0.15, -0.42], rot: [0, 0.03, 0] },
  deagle: { pos: [0.14, -0.155, -0.44], rot: [0, 0.03, 0] },
  mp9: { pos: [0.14, -0.155, -0.36], rot: [0, 0.03, 0] },
  ak47: { pos: [0.14, -0.16, -0.32], rot: [0, 0.035, 0] },
  m4a4: { pos: [0.14, -0.16, -0.32], rot: [0, 0.035, 0] },
  awp: { pos: [0.12, -0.16, -0.26], rot: [0, 0.035, 0] },
  he: { pos: [0.15, -0.15, -0.32], rot: [0.2, 0, 0] },
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
    this.fill = new THREE.HemisphereLight(0xcfe1ff, 0x6b5238, 0.7);
    this.scene.add(this.fill);
    this.rig = new THREE.Group(); // sway/bob/recoil
    this.camera.add(this.rig);
    this.models = {};
    this.current = null;
    this.currentId = null;
    this.kick = new Spring(160, 16);
    this.rotKick = new Spring(140, 13);
    this.sway = new THREE.Vector2();
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.drawT = 1;
    this.anim = null; // {type, t, dur}
    this.land = 0;
    this.buildArms(team);
    this.buildFlash();
  }

  buildArms(team) {
    const sleeve = new THREE.MeshStandardMaterial({ color: team === 't' ? 0x8c7650 : 0x3c4a5e, roughness: 0.9 });
    const detail = this.assets.textures.planks.normalMap;
    sleeve.normalMap = detail;
    sleeve.normalScale = new THREE.Vector2(0.4, 0.4);
    const glove = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.62, metalness: 0.05 });
    const cuff = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.8 });
    this.armMats = { sleeve, glove, cuff };
    const makeArm = () => {
      const g = new THREE.Group();
      const hand = new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.055, 0.1, 3, 0.02), glove);
      g.add(hand);
      const fingers = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.04, 0.05, 3, 0.017), glove);
      fingers.position.set(-0.035, -0.02, -0.02);
      fingers.rotation.z = 0.9;
      g.add(fingers);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.04, 4, 8), glove);
      thumb.position.set(0.03, 0.02, -0.03);
      thumb.rotation.x = Math.PI / 2;
      g.add(thumb);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.05, 14), cuff);
      c.rotation.x = Math.PI / 2;
      c.position.z = 0.07;
      g.add(c);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.34, 6, 14), sleeve);
      fore.rotation.x = Math.PI / 2;
      fore.position.z = 0.27;
      g.add(fore);
      g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      return g;
    };
    this.rightArm = makeArm();
    this.leftArm = makeArm();
    this.leftArm.scale.x = -1;
  }

  buildFlash() {
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: TEX.flash, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    const side1 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.1), new THREE.MeshBasicMaterial({ map: TEX.flashSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    side1.rotation.y = Math.PI / 2;
    side1.position.z = -0.1;
    const side2 = side1.clone();
    side2.rotation.z = Math.PI / 2;
    this.flash = new THREE.Group();
    this.flash.add(front, side1, side2);
    this.flash.visible = false;
    this.flashT = 0;
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
    // Attach hands.
    m.add(this.rightArm);
    const def = WEAPONS[id];
    if (id === 'knife') {
      this.rightArm.position.set(0, -0.01, 0.07);
      this.rightArm.rotation.set(0.1, 0, 0);
      if (this.leftArm.parent) this.leftArm.parent.remove(this.leftArm);
    } else if (id === 'he') {
      this.rightArm.position.set(0, -0.03, 0.05);
      this.rightArm.rotation.set(0.35, -0.2, 0);
      if (this.leftArm.parent) this.leftArm.parent.remove(this.leftArm);
    } else {
      this.rightArm.position.set(0.005, -0.045, 0.05);
      this.rightArm.rotation.set(0.35, -0.28, -0.25);
      m.add(this.leftArm);
      if (def.slot === 1) {
        const front = m.userData.front;
        this.leftArm.position.set(-0.01, -0.035, front * 0.52);
        this.leftArm.rotation.set(0.5, 0.55, 0.5);
      } else {
        this.leftArm.position.set(-0.03, -0.05, 0.03);
        this.leftArm.rotation.set(0.45, 0.4, 0.35);
      }
    }
    m.add(this.flash);
    this.flash.position.copy(m.userData.muzzle).add(new THREE.Vector3(0, 0, -0.02));
    this.startAnim('draw', id === 'awp' ? 0.8 : 0.55);
  }

  startAnim(type, dur) { this.anim = { type, t: 0, dur }; }

  fire(def) {
    const k = def.slot === 1 ? 1 : def.id === 'deagle' ? 1.6 : 0.8;
    this.kick.impulse(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.012 * k, 0.55 * k * (def.id === 'awp' ? 1.8 : 1)));
    this.rotKick.impulse(new THREE.Vector3(0.9 * k * (def.id === 'awp' ? 2 : 1), (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6));
    if (!def.suppressed && def.id !== 'knife' && !def.grenade) {
      this.flash.visible = true;
      this.flash.rotation.z = Math.random() * Math.PI;
      const s = def.slot === 1 ? 1.1 + Math.random() * 0.4 : 0.8 + Math.random() * 0.3;
      this.flash.scale.setScalar(s);
      this.flashT = 0.04;
    }
    if (def.id === 'awp') this.startAnim('bolt', 1.3);
  }

  knifeSwing(alt) { this.startAnim(alt ? 'stab' : (Math.random() < 0.5 ? 'slashL' : 'slashR'), alt ? 0.8 : 0.42); }
  reload(dur) { this.startAnim('reload', dur); }
  throwNade() { this.startAnim('throw', 0.6); }

  onLand(v) { this.land = Math.min(1, v / 8); }

  update(dt, { mouseDX, mouseDY, speed, onGround, crouch, hidden, sunDir }) {
    if (!this.current) return;
    this.rig.visible = !hidden;
    // Sway lags behind mouse movement.
    this.sway.x += (THREE.MathUtils.clamp(-mouseDX * 0.0009, -0.06, 0.06) - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (THREE.MathUtils.clamp(-mouseDY * 0.0009, -0.05, 0.05) - this.sway.y) * Math.min(1, dt * 10);
    // Bob.
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

    // Scripted animations.
    if (this.anim) {
      const a = this.anim;
      a.t += dt;
      const p = Math.min(1, a.t / a.dur);
      const ease = (x) => 1 - Math.pow(1 - x, 3);
      const bell = (x) => Math.sin(Math.PI * x);
      switch (a.type) {
        case 'draw': {
          const e = 1 - ease(p);
          pos.y -= e * 0.22; rot.x -= e * 0.9; rot.z += e * 0.3;
          break;
        }
        case 'reload': {
          const dip = p < 0.2 ? ease(p / 0.2) : p > 0.82 ? 1 - ease((p - 0.82) / 0.18) : 1;
          pos.y -= dip * 0.06; pos.x -= dip * 0.02;
          rot.z += dip * 0.55; rot.x += dip * 0.18;
          // Magazine seat bump.
          if (p > 0.55 && p < 0.7) rot.x += bell((p - 0.55) / 0.15) * 0.12;
          break;
        }
        case 'bolt': {
          const b = bell(Math.min(1, p / 0.7));
          rot.z += b * 0.35; pos.y -= b * 0.03; rot.x -= b * 0.08;
          break;
        }
        case 'slashL':
        case 'slashR': {
          const s = a.type === 'slashL' ? 1 : -1;
          const b = bell(p);
          rot.y += s * (0.9 - p * 1.8) * b;
          rot.x -= b * 0.5;
          rot.z += s * b * 0.7;
          pos.x -= s * b * 0.12;
          pos.z -= b * 0.08;
          break;
        }
        case 'stab': {
          const b = p < 0.3 ? ease(p / 0.3) : 1 - ease((p - 0.3) / 0.7);
          pos.z -= b * 0.2; pos.y += b * 0.03; rot.x -= b * 0.2;
          break;
        }
        case 'throw': {
          const b = bell(p);
          rot.x -= b * 1.4; pos.y += b * 0.08; pos.z -= b * 0.12;
          break;
        }
      }
      if (p >= 1) this.anim = null;
    }
    m.position.copy(pos);
    m.rotation.copy(rot);

    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    if (sunDir) {
      // Keep the key light consistent with the world sun as the view turns.
      const local = sunDir.clone().applyQuaternion(this.camera.quaternion.clone().invert());
      this.key.position.copy(local);
    }
  }

  get busy() { return this.anim && (this.anim.type === 'draw'); }
}
