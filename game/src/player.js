import * as THREE from 'three';
import { WEAPONS } from './config.js';

export class PlayerController {
  constructor(game) {
    this.game = game;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.vmDX = 0;
    this.vmDY = 0;
    this.locked = false;
    this.noLock = false;
    this.firstPerson = true;
    this.landKick = 0;
    this.fovKick = 0;
    this.jumpBuffer = 0;
    this.deathT = 0;
    this.spectating = null;
    this.buyOpen = false;
    this.canvas = game.renderer.domElement;
    this.bind();
  }

  get c() { return this.game.player; }

  bind() {
    const doc = document;
    doc.addEventListener('pointerlockchange', () => {
      this.locked = doc.pointerLockElement === this.canvas;
      if (this.locked) { this.game.paused = false; this.game.hud.showPause(false); }
      else if (this.game.phase !== 'menu' && this.game.phase !== 'matchover' && !this.buyOpen && !this.noLock) {
        this.game.paused = true;
        this.game.hud.showPause(true);
        this.keys.clear();
        if (this.c) { this.c.trigger = false; this.c.triggerAlt = false; }
      }
    });
    doc.addEventListener('pointerlockerror', () => { this.enableNoLock(); });
    doc.addEventListener('mousemove', (e) => {
      if (!this.active()) return;
      const dx = e.movementX || 0, dy = e.movementY || 0;
      // Browsers occasionally report a bogus jump right after (un)locking.
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400 || (this.noLock && this.skipMoves-- > 0)) return;
      this.mouseDX += dx;
      this.mouseDY += dy;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.game.phase === 'menu' || this.game.phase === 'matchover') return;
      if (!this.locked && !this.noLock) { this.lock(); return; }
      if (!this.active()) return;
      if (!this.c.alive) { if (e.button === 0) this.nextSpectate(1); return; }
      if (e.button === 0) this.c.trigger = true;
      if (e.button === 2) this.c.triggerAlt = true;
    });
    doc.addEventListener('mouseup', (e) => {
      if (!this.c) return;
      if (e.button === 0) this.c.trigger = false;
      if (e.button === 2) this.c.triggerAlt = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    doc.addEventListener('wheel', (e) => {
      if (!this.active() || !this.c.alive) return;
      const order = [1, 2, 3, 4].filter((s) => s === 3 || (s === 4 ? this.c.slots[4] : this.c.slots[s]));
      const i = order.indexOf(this.c.slot);
      const next = order[(i + (e.deltaY > 0 ? 1 : -1) + order.length) % order.length];
      this.game.switchSlot(this.c, next);
    }, { passive: true });
    doc.addEventListener('keydown', (e) => this.onKey(e, true));
    doc.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); if (this.c) this.c.trigger = false; });
  }

  enableNoLock() {
    // Pointer lock refused by the host: fall back to free mouse look over the canvas.
    this.noLock = true;
    this.skipMoves = 2;
    this.game.paused = false;
    this.game.hud.showPause(false);
    this.game.hud.toast('Tu navegador no permite capturar el ratón aquí: modo de ratón libre activado.');
    document.body.classList.add('nolock');
  }

  lock() {
    if (this.noLock) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => {
        try {
          const p2 = this.canvas.requestPointerLock();
          if (p2 && p2.catch) p2.catch(() => this.enableNoLock());
        } catch { this.enableNoLock(); }
      });
    } catch { this.enableNoLock(); }
  }

  release() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  active() {
    return this.c && (this.locked || this.noLock) && !this.game.paused && !this.buyOpen && this.game.phase !== 'menu';
  }

  onKey(e, down) {
    const g = this.game;
    if (g.phase === 'menu' || !this.c) return;
    const k = e.code;
    if (k === 'Tab') { e.preventDefault(); g.hud.showScoreboard(down, g); return; }
    if (down && k === 'KeyB' && g.phase !== 'matchover') { this.toggleBuy(); e.preventDefault(); return; }
    if (this.buyOpen) {
      if (down && k === 'Escape') this.toggleBuy(false);
      if (down && /^Digit[1-9]$/.test(k)) g.hud.buyByIndex(parseInt(k.slice(5), 10) - 1, g);
      return;
    }
    if (!this.active()) return;
    if (['Space', 'ControlLeft', 'ControlRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(k)) e.preventDefault();
    if (down) {
      if (this.keys.has(k)) return;
      this.keys.add(k);
      const c = this.c;
      if (!c.alive) { if (k === 'Space') this.nextSpectate(1); return; }
      switch (k) {
        case 'Digit1': g.switchSlot(c, 1); break;
        case 'Digit2': g.switchSlot(c, 2); break;
        case 'Digit3': g.switchSlot(c, 3); break;
        case 'Digit4': g.switchSlot(c, 4); break;
        case 'KeyQ': g.switchSlot(c, c.slots[c.lastSlot] || c.lastSlot === 3 || (c.lastSlot === 4 && c.slots[4]) ? c.lastSlot : 3); break;
        case 'KeyR': c.wantReload = true; break;
        case 'Space': this.jumpBuffer = 0.12; break;
        case 'KeyG': if (c.slot === 1 || c.slot === 2) g.dropWeapon(c, c.slot, true); break;
        case 'KeyF': if (!c.reloading) g.vm.inspect(); break;
        case 'KeyE': {
          const i = g.nearestDrop(c);
          if (i !== null) g.pickup(c, i);
          break;
        }
      }
    } else this.keys.delete(k);
  }

  toggleBuy(force) {
    const g = this.game;
    const open = force ?? !this.buyOpen;
    if (open && !g.canBuy(this.c)) { g.hud.toast(this.c.alive ? 'El tiempo de compra ha terminado' : 'No puedes comprar mientras estás muerto'); return; }
    this.buyOpen = open;
    g.hud.showBuy(open, g);
    if (open) {
      this.keys.clear();
      this.c.trigger = false;
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (!this.noLock) this.lock();
  }

  onRoundStart() {
    this.firstPerson = true;
    this.spectating = null;
    this.deathT = 0;
    this.game.hud.showDeath(null);
    if (this.buyOpen) this.toggleBuy(false);
  }

  onDeath(killer, weapon, headshot) {
    this.firstPerson = false;
    this.deathT = 0;
    this.killer = killer;
    this.deathPos = this.c.eyePos();
    this.deathYaw = this.c.yaw;
    this.game.hud.showDeath({ killer, weapon, headshot, player: this.c });
    if (this.buyOpen) this.toggleBuy(false);
  }

  nextSpectate(dir) {
    const mates = this.game.combatants.filter((c) => c.alive && c !== this.c && (c.team === this.c.team || !this.game.combatants.some((m) => m.team === this.c.team && m.alive && m !== this.c)));
    if (!mates.length) return;
    const i = mates.indexOf(this.spectating);
    this.spectating = mates[(i + dir + mates.length) % mates.length];
    this.game.hud.spectating(this.spectating);
  }

  update(dt) {
    const c = this.c;
    const g = this.game;
    // Mouse look.
    const def = WEAPONS[c.weaponId()];
    // Sensitivity follows the zoom so the aim feels the same through sights and scopes.
    const zoom = c.scope && def.scope ? def.scope[c.scope - 1] / g.settings.fov : 1 - g.vm.ads * (1 - g.vm.adsZoom);
    const sens = 0.0022 * g.settings.sens * zoom;
    if (c.alive) {
      c.yaw -= this.mouseDX * sens;
      c.pitch -= this.mouseDY * sens * (g.settings.invertY ? -1 : 1);
      c.pitch = THREE.MathUtils.clamp(c.pitch, -1.53, 1.53);
    }
    this.vmDX = this.mouseDX; this.vmDY = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;

    if (!c.alive) {
      this.deathT += dt;
      if (this.deathT > 2.6 && !this.spectating?.alive) this.nextSpectate(1);
      return;
    }
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const fwd = new THREE.Vector3(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
    const right = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    const dir = fwd.multiplyScalar(f).add(right.multiplyScalar(s));
    if (dir.lengthSq() > 0) { c.moveDir.copy(dir.normalize()); c.moveSpeedMul = 1; } else c.moveSpeedMul = 0;
    c.wantWalk = k.has('ShiftLeft') || k.has('ShiftRight');
    c.wantCrouch = k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC');
    if (this.jumpBuffer > 0) {
      this.jumpBuffer -= dt;
      if (c.onGround) { c.wantJump = true; this.jumpBuffer = 0; }
    }
    // Pickup hint.
    const i = g.nearestDrop(c);
    g.hud.pickupHint(i !== null ? WEAPONS[g.drops[i].id].name : null);
  }

  updateCamera(dt) {
    const g = this.game;
    const cam = g.camera;
    const c = this.c;
    const def = WEAPONS[c.weaponId()];
    let fov = g.settings.fov;
    this.landKick = Math.max(0, this.landKick - dt * 0.5);
    // Aim down the sights while the right button is held (scopes and the knife use it themselves).
    const adsWanted = c.alive && c.triggerAlt && !def.scope && def.id !== 'knife' && !def.grenade;
    c.adsAmount = g.vm.ads;
    if (c.alive) {
      c.eyePos(cam.position);
      cam.position.y -= this.landKick;
      // Head motion: a soft step bob and a slight lean into strafes, damped while aiming.
      const sp = Math.hypot(c.velocity.x, c.velocity.z);
      const calm = 1 - g.vm.ads * 0.85;
      this.headBob = (this.headBob || 0) + dt * (3.2 + sp * 1.45) * (c.crouch > 0.5 ? 0.7 : 1);
      const bobAmt = c.onGround ? THREE.MathUtils.clamp(sp / 5.5, 0, 1) * (g.settings.headBob ?? 1) * calm : 0;
      this.bobSmooth = (this.bobSmooth || 0) + (bobAmt - (this.bobSmooth || 0)) * Math.min(1, dt * 6);
      const right = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
      const lateral = c.velocity.dot(right);
      this.roll = (this.roll || 0) + ((-lateral * 0.0045) * calm - (this.roll || 0)) * Math.min(1, dt * 7);
      cam.position.y += (Math.cos(this.headBob * 2) * 0.5 - 0.5) * 0.022 * this.bobSmooth;
      cam.position.addScaledVector(right, Math.sin(this.headBob) * 0.012 * this.bobSmooth);
      this.hitShake = Math.max(0, (this.hitShake || 0) - dt * 3);
      const hs = this.hitShake * this.hitShake;
      const t = performance.now() / 1000;
      cam.rotation.set(
        c.pitch + c.punch.x * 0.5 + Math.sin(t * 37) * 0.012 * hs,
        c.yaw + c.punch.y * 0.5 + Math.sin(t * 29 + 1) * 0.012 * hs,
        this.roll + Math.sin(this.headBob) * 0.004 * this.bobSmooth + Math.sin(t * 23) * 0.02 * hs,
      );
      if (c.scope && def.scope) fov = def.scope[c.scope - 1];
      else fov *= 1 - g.vm.ads * (1 - g.vm.adsZoom);
      g.hud.scope(c.scope > 0 && !!def.scope);
      this.firstPerson = true;
    } else if (this.deathT < 2.6 || !this.spectating) {
      // Death cam: pull back and look at the killer.
      this.firstPerson = false;
      g.hud.scope(false);
      const t = Math.min(1, this.deathT / 1.2);
      const p = this.deathPos.clone();
      const back = new THREE.Vector3(Math.sin(this.deathYaw), 0, Math.cos(this.deathYaw));
      const want = p.clone().addScaledVector(back, 2.2 * t).add(new THREE.Vector3(0, 1.3 * t, 0));
      const hit = g.world.raycast(p, want.clone().sub(p).normalize(), want.distanceTo(p) + 0.3);
      if (hit) want.copy(hit.point).addScaledVector(want.clone().sub(p).normalize(), -0.3);
      cam.position.copy(want);
      const look = this.killer && this.killer !== c ? this.killer.pos.clone().setY(this.killer.pos.y + 1.4) : p.clone().setY(p.y - 1.4);
      const m = new THREE.Matrix4().lookAt(cam.position, look, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      cam.quaternion.slerp(q, Math.min(1, dt * 4));
    } else {
      // Over-the-shoulder spectator.
      const t = this.spectating;
      g.hud.scope(false);
      const eye = t.eyePos();
      const dir = t.aimDir(new THREE.Vector3(), false);
      const right = new THREE.Vector3(Math.cos(t.yaw), 0, -Math.sin(t.yaw));
      const want = eye.clone().addScaledVector(dir, -2.4).addScaledVector(right, 0.55).add(new THREE.Vector3(0, 0.35, 0));
      const d = want.clone().sub(eye);
      const hit = g.world.raycast(eye, d.clone().normalize(), d.length() + 0.25);
      if (hit) want.copy(eye).addScaledVector(d.normalize(), Math.max(0.3, hit.dist - 0.25));
      cam.position.lerp(want, Math.min(1, dt * 12));
      const look = eye.clone().addScaledVector(dir, 10);
      const m = new THREE.Matrix4().lookAt(cam.position, look, new THREE.Vector3(0, 1, 0));
      cam.quaternion.setFromRotationMatrix(m);
    }
    this.fovKick = Math.max(0, this.fovKick - dt * this.fovKick * 12 - dt);
    const want = fov + (c.scope ? 0 : this.fovKick);
    if (Math.abs(cam.fov - want) > 0.01) {
      cam.fov = c.scope ? want : THREE.MathUtils.lerp(cam.fov, want, Math.min(1, dt * 30));
      cam.updateProjectionMatrix();
    }
    // Viewmodel.
    const sp = Math.hypot(c.velocity.x, c.velocity.z);
    g.vm.camera.quaternion.copy(cam.quaternion);
    const vel = c.velocity.clone().applyQuaternion(cam.quaternion.clone().invert());
    // Distance to whatever is right in front of the gun, to tuck it in against walls.
    let wallDist = 99;
    if (c.alive) {
      const hit = g.world.raycast(cam.position, c.aimDir(new THREE.Vector3(), false), 1.4);
      if (hit) wallDist = hit.dist;
    }
    g.vm.update(dt, { mouseDX: this.vmDX, mouseDY: this.vmDY, speed: sp, onGround: c.onGround, crouch: c.crouch, hidden: c.scope > 0, sunDir: g.sunDir, ads: adsWanted, vel, wallDist });
  }
}
