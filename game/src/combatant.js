import * as THREE from 'three';
import { WEAPONS, PLAYER } from './config.js';

let NEXT_ID = 1;

// Shared state for the human player and every bot.
export class Combatant {
  constructor({ name, team, isBot }) {
    this.id = NEXT_ID++;
    this.name = name;
    this.team = team;
    this.isBot = isBot;
    this.pos = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.crouch = 0; // 0..1 smoothed
    this.money = 800;
    this.kills = 0;
    this.deaths = 0;
    this.assists = 0;
    this.headshots = 0;
    this.damageDealt = 0;
    this.mvps = 0;
    this.punch = new THREE.Vector2(); // x: pitch, y: yaw (radians)
    this.moveDir = new THREE.Vector3();
    this.moveSpeedMul = 0;
    this.body = null;
    this.brain = null;
    this.resetLife();
    this.slots = { 1: null, 2: null, 3: { id: 'knife', mag: 0, reserve: 0 }, 4: 0 };
    this.armor = 0;
    this.helmet = false;
  }

  resetLife() {
    this.alive = true;
    this.hp = 100;
    this.slot = 2;
    this.lastSlot = 3;
    this.nextFire = 0;
    this.reloading = false;
    this.reloadEnd = 0;
    this.drawEnd = 0;
    this.trigger = false;
    this.triggerAlt = false;
    this.triggerHeld = false;
    this.wantReload = false;
    this.wantCrouch = false;
    this.wantWalk = false;
    this.wantJump = false;
    this.shotsFired = 0;
    this.lastShotT = -10;
    this.punch?.set(0, 0);
    this.velocity?.set(0, 0, 0);
    this.damageFrom = new Map();
    this.scope = 0;
    this.spottedUntil = 0;
    this.justFired = false;
    this.lastHitT = -10;
  }

  weaponId() {
    const s = this.slots[this.slot];
    if (this.slot === 4) return 'he';
    return s ? s.id : 'knife';
  }

  current() { return this.slot === 4 ? null : this.slots[this.slot]; }

  eyeHeight() { return THREE.MathUtils.lerp(PLAYER.eye, PLAYER.crouchEye, this.crouch); }
  height() { return THREE.MathUtils.lerp(PLAYER.height, PLAYER.crouchHeight, this.crouch); }

  eyePos(out = new THREE.Vector3()) {
    if (this.body && !this.isPlayerView) {
      return out.set(this.pos.x, this.pos.y + this.eyeHeight(), this.pos.z);
    }
    return out.set(this.pos.x, this.pos.y + this.eyeHeight(), this.pos.z);
  }

  headPos(out = new THREE.Vector3()) {
    if (this.body) return this.body.headWorld(out).add(new THREE.Vector3(0, 0.09, 0));
    return out.set(this.pos.x, this.pos.y + this.eyeHeight() + 0.06, this.pos.z);
  }

  aimDir(out = new THREE.Vector3(), withPunch = true) {
    const yaw = this.yaw + (withPunch ? this.punch.y : 0);
    const pitch = this.pitch + (withPunch ? this.punch.x : 0);
    return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }

  maxSpeed() {
    const w = WEAPONS[this.weaponId()];
    let s = w.speed;
    if (this.scope > 0) s *= 0.6;
    if (this.adsAmount) s *= 1 - 0.28 * this.adsAmount; // careful steps while aiming
    return s;
  }

  give(id) {
    const def = WEAPONS[id];
    if (def.grenade) { this.slots[4] = 1; return; }
    this.slots[def.slot] = { id, mag: def.mag, reserve: def.reserve };
  }

  // Hit shapes for bullets. Bots use their skeleton, the player a simple capsule stack.
  hitShapes() {
    if (this.body) return this.body.hitShapes();
    const e = this.eyePos();
    const head = e.clone().add(new THREE.Vector3(0, 0.06, 0));
    const neck = e.clone().add(new THREE.Vector3(0, -0.2, 0));
    const waist = this.pos.clone().add(new THREE.Vector3(0, 0.95 - this.crouch * 0.3, 0));
    const feet = this.pos.clone().add(new THREE.Vector3(0, 0.1, 0));
    return [
      { group: 'head', a: head, b: head, r: 0.14 },
      { group: 'chest', a: waist.clone().add(new THREE.Vector3(0, 0.2, 0)), b: neck, r: 0.22 },
      { group: 'stomach', a: waist, b: waist.clone().add(new THREE.Vector3(0, 0.2, 0)), r: 0.2 },
      { group: 'legs', a: feet, b: waist, r: 0.17 },
    ];
  }
}
