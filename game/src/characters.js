import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { reloadPose } from './rigs.js';

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export const TEAM_TINT = {
  t: new THREE.Color(0.92, 0.76, 0.55),
  ct: new THREE.Color(0.3, 0.38, 0.55),
};

// Rotate a bone by a world-space rotation, keeping the rest of the hierarchy consistent.
function rotateBoneWorld(bone, qWorld) {
  bone.getWorldQuaternion(_q1);
  _q1.premultiply(qWorld);
  bone.parent.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(_q1));
  bone.updateMatrixWorld(true);
}

function setBoneWorldQuat(bone, qWorld) {
  bone.parent.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(qWorld));
  bone.updateMatrixWorld(true);
}

// Aim a bone so the direction to its child joint points at `target` (minimal rotation).
function aimBone(bone, childPos, target) {
  const origin = bone.getWorldPosition(new THREE.Vector3());
  const from = childPos.clone().sub(origin).normalize();
  const to = target.clone().sub(origin).normalize();
  if (from.dot(to) > 0.999999) return;
  rotateBoneWorld(bone, new THREE.Quaternion().setFromUnitVectors(from, to));
}

// Analytic two-bone IK with a pole direction for the elbow.
function solveArm(upper, lower, hand, target, pole) {
  const S = upper.getWorldPosition(new THREE.Vector3());
  const E0 = lower.getWorldPosition(new THREE.Vector3());
  const W0 = hand.getWorldPosition(new THREE.Vector3());
  const L1 = S.distanceTo(E0), L2 = E0.distanceTo(W0);
  const toT = target.clone().sub(S);
  let d = toT.length();
  if (d < 1e-5) return;
  const dir = toT.divideScalar(d);
  d = Math.min(d, (L1 + L2) * 0.999);
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-8) p.set(0, -1, 0);
  p.normalize();
  const E = S.clone().addScaledVector(dir, a).addScaledVector(p, h);
  aimBone(upper, E0, E);
  const W1 = hand.getWorldPosition(new THREE.Vector3());
  aimBone(lower, W1, S.clone().addScaledVector(dir, d));
}

const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function smoothstep(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Knows each hand's local axes (from the finger joints) so a palm can be pointed at a grip,
// and curls the fingers around it.
export class HandRig {
  constructor(bones) {
    this.hands = {};
    for (const side of ['Right', 'Left']) {
      const hand = bones[`${side}Hand`];
      const f = bones[`${side}HandMiddle1`].position.clone().normalize();
      const th = bones[`${side}HandThumb1`].position.clone().normalize();
      const palm = side === 'Right' ? th.clone().cross(f) : f.clone().cross(th);
      const n = palm.addScaledVector(f, -palm.dot(f)).normalize();
      const b = f.clone().cross(n);
      const local = new THREE.Matrix4().makeBasis(f, n, b);
      const chains = FINGERS.map((name) => [1, 2, 3].map((i) => bones[`${side}Hand${name}${i}`]).filter(Boolean));
      const thumb = [1, 2, 3].map((i) => bones[`${side}HandThumb${i}`]).filter(Boolean);
      const rest = [...chains.flat(), ...thumb].map((b) => [b, b.quaternion.clone()]);
      this.hands[side] = { hand, localInv: local.clone().invert(), chains, thumb, rest };
    }
  }

  // F: knuckle direction, N: palm normal (world). curls: per finger [index, middle, ring, pinky].
  orient(side, F, N, curls, thumbCurl = 0.3) {
    const h = this.hands[side];
    // Start the fingers from their rest pose so curls never accumulate between frames.
    for (const [b, q] of h.rest) b.quaternion.copy(q);
    const f = F.clone().normalize();
    const n = N.clone().addScaledVector(f, -N.dot(f)).normalize();
    const b = f.clone().cross(n);
    _m1.makeBasis(f, n, b).multiply(h.localInv);
    setBoneWorldQuat(h.hand, new THREE.Quaternion().setFromRotationMatrix(_m1));
    // Curling about the knuckle axis moves fingertips toward the palm.
    h.chains.forEach((chain, i) => {
      const c = curls[i] ?? curls[curls.length - 1];
      chain.forEach((bone, j) => rotateBoneWorld(bone, new THREE.Quaternion().setFromAxisAngle(b, c * (j === 0 ? 0.9 : j === 1 ? 1.1 : 0.7))));
    });
    if (h.thumb.length && thumbCurl) {
      const axis = f.clone().addScaledVector(n, 0.5).normalize();
      h.thumb.forEach((bone) => rotateBoneWorld(bone, new THREE.Quaternion().setFromAxisAngle(axis, thumbCurl * (side === 'Right' ? -1 : 1))));
    }
  }
}

// Puts both hands on a weapon (optionally mid-reload). Shared by bots and first-person arms.
export function gripWeapon(B, handRig, weapon, reload, poleR, poleL, leftIdle) {
  const rig = weapon.userData.rig;
  const W = weapon.matrixWorld;
  const wq = weapon.getWorldQuaternion(new THREE.Quaternion());
  const toWorldDir = (v) => v.clone().applyQuaternion(wq);
  const toWorld = (v) => v.clone().applyMatrix4(W);
  // The wrist sits behind the palm: back along the knuckles and away from the grip.
  const rF = toWorldDir(rig.rightF), rN = toWorldDir(rig.rightN);
  const rightWrist = toWorld(rig.grip).addScaledVector(rF, -0.055).addScaledVector(rN, -0.03);
  solveArm(B.RightArm, B.RightForeArm, B.RightHand, rightWrist, poleR);
  const fist = rig.kind === 'knife' || rig.kind === 'nade';
  handRig.orient('Right', rF, rN, [fist ? 1.25 : 0.35, 1.3, 1.35, 1.35], fist ? 0.6 : 0.35);

  if (!rig.support) {
    if (leftIdle) solveArm(B.LeftArm, B.LeftForeArm, B.LeftHand, leftIdle.pos, poleL);
    return;
  }
  let lp = rig.support, lF = rig.leftF, lN = rig.leftN, curl = rig.kind === 'pistol' ? 1.1 : 0.85;
  if (reload && reload.active) {
    lp = reload.pose.left;
    const k = reload.pose.leftBlend || 0;
    lF = rig.leftF.clone().lerp(rig.grabF, k).normalize();
    lN = rig.leftN.clone().lerp(rig.grabN, k).normalize();
    curl = THREE.MathUtils.lerp(curl, 1.15, k);
  }
  const F = toWorldDir(lF), N = toWorldDir(lN);
  const leftWrist = toWorld(lp).addScaledVector(F, -0.06).addScaledVector(N, -0.032);
  solveArm(B.LeftArm, B.LeftForeArm, B.LeftHand, leftWrist, poleL);
  handRig.orient('Left', F, N, [curl, curl, curl * 1.05, curl * 1.1], 0.25);
}

// Magazine animation. Returns true on the frame the old magazine is released.
export function updateMagazine(weapon, pose, active, dt) {
  const mag = weapon.userData.mag;
  if (!mag) return false;
  const rest = weapon.userData.magRest;
  const rig = weapon.userData.rig;
  const st = weapon.userData.magState || (weapon.userData.magState = { prev: 'rest', vel: new THREE.Vector3() });
  const state = active ? pose.mag : 'rest';
  let released = false;
  if (state === 'rest') {
    mag.visible = true;
    mag.position.copy(rest.pos);
    mag.quaternion.copy(rest.quat);
  } else if (state === 'hand') {
    mag.visible = true;
    mag.position.copy(rest.pos).add(pose.left).sub(rig.magGrab);
    mag.quaternion.copy(rest.quat);
    mag.rotateZ((1 - (pose.leftBlend ?? 1)) * 0.2);
  } else if (state === 'eject') {
    mag.visible = true;
    mag.position.copy(rest.pos).addScaledVector(rig.magAxis, 0.11 * pose.magEject);
    mag.quaternion.copy(rest.quat);
  } else if (state === 'drop') {
    if (st.prev !== 'drop') { released = true; st.vel.set(-0.15, -0.5, 0.1); }
    st.vel.y -= 9.8 * dt;
    mag.position.addScaledVector(st.vel, dt);
    mag.rotateX(dt * 3);
    mag.visible = mag.position.y > -0.8;
  } else if (state === 'hidden') {
    if (st.prev === 'eject') released = true;
    mag.visible = false;
  }
  st.prev = state;
  return released;
}

export class SoldierBody {
  constructor(assets, team) {
    this.team = team;
    this.root = new THREE.Group();
    const model = cloneSkinned(assets.soldier.scene);
    this.model = model;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        o.material = o.material.clone();
        o.material.color.copy(TEAM_TINT[team]);
        o.material.envMapIntensity = 0.7;
      }
    });
    this.root.add(model);
    this.bones = {};
    model.traverse((o) => { if (o.isBone) this.bones[o.name.replace('mixamorig', '')] = o; });
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of assets.soldier.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    for (const n of ['Idle', 'Walk', 'Run']) { this.actions[n].play(); this.actions[n].setEffectiveWeight(n === 'Idle' ? 1 : 0); }
    this.hands = new HandRig(this.bones);
    this.weapon = null;
    this.weaponId = null;
    this.dead = false;
    this.deathT = 0;
    this.recoil = 0;
    this.crouch = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.aiming = 0; // 0 lowered .. 1 shouldered
    this.reload = { active: false, t: 0, pose: {} };
    this.onMagDrop = null;
  }

  setWeapon(model, id, slot) {
    if (this.weapon) this.root.remove(this.weapon);
    this.weapon = model;
    this.weaponId = id;
    this.weaponSlot = slot;
    if (model) this.root.add(model);
  }

  // vel: world velocity (or a plain speed), yaw/pitch of aim in world space,
  // reload progress 0..1 or null.
  update(dt, vel, yaw, pitch, crouch, aiming, reloadT = null) {
    if (this.dead) { this.updateDeath(dt); return; }
    this.aimYaw = yaw;
    this.aimPitch = pitch;
    this.aiming += ((aiming ? 1 : 0) - this.aiming) * Math.min(1, dt * 8);
    this.crouch += ((crouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.reload.active = reloadT !== null;
    this.reload.t = reloadT ?? 0;
    const speed = typeof vel === 'number' ? vel : Math.hypot(vel.x, vel.z);

    // Legs go where the soldier walks, the torso twists toward where he aims.
    // Moving away from the aim uses the walk cycle played backwards.
    if (this.bodyYaw === undefined) this.bodyYaw = yaw;
    let target = this.bodyYaw;
    let backward = false;
    if (typeof vel !== 'number' && speed > 0.45) {
      const moveYaw = Math.atan2(-vel.x, -vel.z);
      const d = angDiff(yaw, moveYaw);
      target = Math.abs(d) <= 1.95 ? moveYaw : moveYaw + Math.PI;
      backward = Math.abs(d) > 1.95;
      const tw = angDiff(target, yaw);
      if (Math.abs(tw) > 1.15) target = yaw - Math.sign(tw) * 1.15;
    } else if (Math.abs(angDiff(this.bodyYaw, yaw)) > 0.55) {
      target = yaw; // shuffle the feet round when the twist gets uncomfortable
    }
    const turn = (speed > 0.45 ? 7 : 5) * dt;
    this.bodyYaw += THREE.MathUtils.clamp(angDiff(this.bodyYaw, target), -turn, turn);
    const turning = Math.abs(angDiff(this.bodyYaw, target)) > 0.05 && speed <= 0.45;

    const wWalk = THREE.MathUtils.clamp(speed / 2.2, 0, 1) * (1 - THREE.MathUtils.clamp((speed - 3.2) / 2, 0, 1));
    const wRun = THREE.MathUtils.clamp((speed - 3.2) / 2, 0, 1);
    const wShuffle = turning ? 0.35 : 0;
    const wIdle = Math.max(0, 1 - wWalk - wRun - wShuffle);
    this.actions.Idle.setEffectiveWeight(wIdle);
    this.actions.Walk.setEffectiveWeight(wWalk + wShuffle);
    this.actions.Run.setEffectiveWeight(wRun);
    const dir = backward ? -1 : 1;
    this.actions.Walk.timeScale = dir * (turning && speed < 0.45 ? 0.8 : THREE.MathUtils.clamp(speed / 1.6, 0.6, 1.6)) * (this.crouch > 0.5 ? 0.8 : 1);
    this.actions.Run.timeScale = dir * THREE.MathUtils.clamp(speed / 5.2, 0.8, 1.3);
    this.mixer.update(dt);

    this.root.rotation.y = this.bodyYaw;
    this.root.updateMatrixWorld(true);
    this.applyPose(dt);
  }

  // A bullet impact: the torso snaps away from the shot and recovers.
  flinch(dir, head) {
    if (this.dead) return;
    const d = dir.clone().setY(0).normalize();
    this.flinchAxis = new THREE.Vector3(d.z, 0, -d.x).normalize();
    this.flinchV = (this.flinchV || 0) + (head ? 5 : 3.2);
    this.flinchHead = head;
  }

  applyPose(dt) {
    const B = this.bones;
    // Hit reaction spring.
    this.flinchA = this.flinchA || 0;
    this.flinchV = this.flinchV || 0;
    this.flinchV += (-this.flinchA * 220 - this.flinchV * 18) * dt;
    this.flinchA += this.flinchV * dt;
    const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, this.root.rotation.y);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQ);
    // Torso twist toward the aim, spread over the spine.
    const twistAim = angDiff(this.root.rotation.y, this.aimYaw);
    for (const [n, k] of [['Spine', 0.3], ['Spine1', 0.35], ['Spine2', 0.35]]) {
      rotateBoneWorld(B[n], new THREE.Quaternion().setFromAxisAngle(UP, twistAim * k));
    }
    const aimRight = new THREE.Vector3(Math.cos(this.aimYaw), 0, -Math.sin(this.aimYaw));
    if (this.crouch > 0.01) {
      const c = this.crouch;
      B.Hips.position.y -= 38 * c; // model units are cm
      B.Hips.updateMatrixWorld(true);
      rotateBoneWorld(B.LeftUpLeg, new THREE.Quaternion().setFromAxisAngle(right, -1.1 * c));
      rotateBoneWorld(B.RightUpLeg, new THREE.Quaternion().setFromAxisAngle(right, -1.1 * c));
      rotateBoneWorld(B.LeftLeg, new THREE.Quaternion().setFromAxisAngle(right, 1.9 * c));
      rotateBoneWorld(B.RightLeg, new THREE.Quaternion().setFromAxisAngle(right, 1.9 * c));
      rotateBoneWorld(B.LeftFoot, new THREE.Quaternion().setFromAxisAngle(right, -0.7 * c));
      rotateBoneWorld(B.RightFoot, new THREE.Quaternion().setFromAxisAngle(right, -0.7 * c));
    }
    const reloading = this.reload.active;
    const aim = reloading ? Math.min(this.aiming, 0.35) : this.aiming;
    const pitch = THREE.MathUtils.lerp(-0.42, this.aimPitch, aim);
    const long = this.weaponSlot === 1;
    const qp = new THREE.Quaternion().setFromAxisAngle(aimRight, -pitch / 3);
    const twist = new THREE.Quaternion().setFromAxisAngle(UP, (long ? 0.38 : 0.12) * (0.5 + aim * 0.5));
    for (const n of ['Spine', 'Spine1', 'Spine2']) {
      rotateBoneWorld(B[n], qp);
      rotateBoneWorld(B[n], new THREE.Quaternion().slerp(twist, 1 / 3));
    }
    if (this.flinchAxis && Math.abs(this.flinchA) > 0.002) {
      const k = THREE.MathUtils.clamp(this.flinchA, -0.35, 0.35);
      rotateBoneWorld(B.Spine1, new THREE.Quaternion().setFromAxisAngle(this.flinchAxis, k * 0.5));
      rotateBoneWorld(B.Spine2, new THREE.Quaternion().setFromAxisAngle(this.flinchAxis, k * 0.5));
      if (this.flinchHead) rotateBoneWorld(B.Head, new THREE.Quaternion().setFromAxisAngle(this.flinchAxis, k * 1.2));
    }
    // Head follows the aim: less twist than the chest, and it looks up/down with the target.
    rotateBoneWorld(B.Neck, new THREE.Quaternion().setFromAxisAngle(UP, -0.3 * aim * (long ? 1 : 0.4)));
    rotateBoneWorld(B.Head, new THREE.Quaternion().setFromAxisAngle(aimRight, -pitch * 0.25 * aim));

    if (!this.weapon) return;
    const yaw = this.aimYaw;
    const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new THREE.Vector3().crossVectors(r, fwd);
    const ud = this.weapon.userData;
    const rig = ud.rig;
    const shoulder = B.RightArm.getWorldPosition(new THREE.Vector3());
    const chest = B.Spine2.getWorldPosition(new THREE.Vector3());
    let gp;
    if (rig.kind === 'rifle' || rig.kind === 'bolt') {
      // Stock butt in the shoulder pocket, grip below the bore.
      gp = shoulder.clone().addScaledVector(r, -0.05).addScaledVector(fwd, ud.rear + 0.01).addScaledVector(up, -0.07);
    } else if (rig.kind === 'pistol') {
      gp = chest.clone().addScaledVector(r, 0.02).addScaledVector(up, 0.14).addScaledVector(fwd, 0.44);
    } else {
      gp = chest.clone().addScaledVector(r, 0.2).addScaledVector(up, -0.28).addScaledVector(fwd, 0.36);
    }
    gp.addScaledVector(fwd, -this.recoil * 0.04);
    // Reload: roll the gun toward the support hand and lift it a touch.
    let rp = null;
    if (reloading && rig.support) {
      rp = reloadPose(rig, this.reload.t, this.reload.pose);
      gp.addScaledVector(up, rp.tilt.y).addScaledVector(r, -0.06 * rp.tilt.z);
    }
    this.weapon.position.copy(this.root.worldToLocal(gp.clone()));
    const m = new THREE.Matrix4().makeBasis(r, up, fwd.clone().negate());
    const qw = new THREE.Quaternion().setFromRotationMatrix(m);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.weapon.quaternion.copy(rootQ.multiply(qw));
    if (this.recoil > 0) this.weapon.rotateX(this.recoil * 0.12);
    if (rp) { this.weapon.rotateZ(rp.tilt.z); this.weapon.rotateX(rp.tilt.x); }
    this.weapon.updateMatrixWorld(true);
    if (updateMagazine(this.weapon, rp || {}, !!rp, dt) && this.onMagDrop) this.onMagDrop(ud.mag);

    const down = new THREE.Vector3(0, -1, 0);
    const poleR = down.clone().addScaledVector(r, 0.9).addScaledVector(fwd, -0.3);
    const poleL = down.clone().addScaledVector(r, -0.5).addScaledVector(fwd, -0.2);
    const leftIdle = { pos: chest.clone().addScaledVector(r, -0.28).addScaledVector(up, -0.45).addScaledVector(fwd, 0.1) };
    gripWeapon(B, this.hands, this.weapon, rp ? { active: true, pose: rp } : null, poleR, poleL, leftIdle);
  }

  muzzleWorld(out = new THREE.Vector3()) {
    if (!this.weapon) return this.headWorld(out);
    return out.copy(this.weapon.userData.muzzle || new THREE.Vector3()).applyMatrix4(this.weapon.matrixWorld);
  }

  ejectWorld(out = new THREE.Vector3()) {
    if (!this.weapon || !this.weapon.userData.eject) return null;
    return out.copy(this.weapon.userData.eject).applyMatrix4(this.weapon.matrixWorld);
  }

  headWorld(out = new THREE.Vector3()) {
    return this.bones.Head.getWorldPosition(out);
  }

  // Capsules for hit tests, in world space.
  hitShapes() {
    const B = this.bones;
    const p = (b) => b.getWorldPosition(new THREE.Vector3());
    const head = p(B.Head).add(new THREE.Vector3(0, 0.09, 0));
    return [
      { group: 'head', a: head, b: head, r: 0.135 },
      { group: 'chest', a: p(B.Spine1), b: p(B.Neck), r: 0.2 },
      { group: 'stomach', a: p(B.Hips), b: p(B.Spine1), r: 0.19 },
      { group: 'legs', a: p(B.LeftUpLeg), b: p(B.LeftLeg), r: 0.11 },
      { group: 'legs', a: p(B.LeftLeg), b: p(B.LeftFoot), r: 0.09 },
      { group: 'legs', a: p(B.RightUpLeg), b: p(B.RightLeg), r: 0.11 },
      { group: 'legs', a: p(B.RightLeg), b: p(B.RightFoot), r: 0.09 },
      { group: 'chest', a: p(B.LeftArm), b: p(B.LeftHand), r: 0.07 },
      { group: 'chest', a: p(B.RightArm), b: p(B.RightHand), r: 0.07 },
    ];
  }

  die(fromDir, headshot) {
    this.dead = true;
    this.deathT = 0;
    const localDir = fromDir.clone().applyQuaternion(this.root.quaternion.clone().invert());
    this.fallAxis = new THREE.Vector3(localDir.z, 0, -localDir.x).normalize();
    if (this.fallAxis.lengthSq() < 0.1) this.fallAxis.set(1, 0, 0);
    // Shot from the front → falls backwards (back arches); from behind → folds forward.
    this.fallForward = localDir.z < 0;
    this.fallDur = headshot ? 0.75 : 1.0;
    this.headshotDeath = headshot;
    this.startQ = this.model.quaternion.clone();
    this.limpSide = Math.random() < 0.5 ? -1 : 1;
    // Drop the aim pose: the arms go back to the animation and fall limp.
    this.actions.Idle.setEffectiveWeight(1);
    this.actions.Walk.setEffectiveWeight(0);
    this.actions.Run.setEffectiveWeight(0);
  }

  updateDeath(dt) {
    this.deathT += dt;
    const t = Math.min(1, this.deathT / this.fallDur);
    if (!this.settled) {
      this.mixer.update(dt * (1 - t) * 0.5);
      // Knees give way first, then the body topples and accelerates like a falling weight.
      const knees = smoothstep(0, 0.45, t);
      const fall = Math.pow(THREE.MathUtils.clamp((t - 0.12) / 0.88, 0, 1), 2);
      const B = this.bones;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.model.getWorldQuaternion(new THREE.Quaternion()));
      const fwdSign = this.fallForward ? 1 : -0.6;
      rotateBoneWorld(B.LeftUpLeg, new THREE.Quaternion().setFromAxisAngle(right, -0.7 * knees));
      rotateBoneWorld(B.RightUpLeg, new THREE.Quaternion().setFromAxisAngle(right, -0.5 * knees));
      rotateBoneWorld(B.LeftLeg, new THREE.Quaternion().setFromAxisAngle(right, 1.2 * knees));
      rotateBoneWorld(B.RightLeg, new THREE.Quaternion().setFromAxisAngle(right, 0.9 * knees));
      rotateBoneWorld(B.Spine1, new THREE.Quaternion().setFromAxisAngle(right, 0.25 * fwdSign * knees));
      rotateBoneWorld(B.Spine2, new THREE.Quaternion().setFromAxisAngle(right, 0.2 * fwdSign * knees));
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.model.getWorldQuaternion(new THREE.Quaternion()));
      rotateBoneWorld(B.Neck, new THREE.Quaternion().setFromAxisAngle(fwd, 0.45 * this.limpSide * knees));
      rotateBoneWorld(B.Head, new THREE.Quaternion().setFromAxisAngle(right, (this.headshotDeath ? -0.5 : 0.4) * fwdSign * knees));
      const q = new THREE.Quaternion().setFromAxisAngle(this.fallAxis, fall * Math.PI / 2 * 0.93);
      this.model.quaternion.copy(this.startQ).premultiply(q);
      // Buckling knees lower the hips before the topple lays the body flat.
      this.model.position.y = -0.28 * knees * (1 - fall) + fall * 0.1;
      if (t >= 1) this.settled = true; // freeze on the last pose
    }
    this.root.updateMatrixWorld(true);
  }
}

// First-person arms: the same soldier with the head hidden and the eyes at the camera.
export class FirstPersonArms {
  constructor(assets, team) {
    const model = cloneSkinned(assets.soldier.scene);
    this.model = model;
    model.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        o.castShadow = false;
        o.material = o.material.clone();
        o.material.color.copy(TEAM_TINT[team]).multiplyScalar(0.72);
        o.material.envMapIntensity = 0.6;
      }
    });
    this.root = new THREE.Group();
    this.root.add(model);
    this.bones = {};
    model.traverse((o) => { if (o.isBone) this.bones[o.name.replace('mixamorig', '')] = o; });
    this.mixer = new THREE.AnimationMixer(model);
    const idle = assets.soldier.animations.find((a) => a.name === 'Idle');
    this.action = this.mixer.clipAction(idle);
    this.action.play();
    this.mixer.update(0.5);
    this.root.updateMatrixWorld(true);
    this.hands = new HandRig(this.bones);
    // Eyes at the origin; the body sits a little forward so the arms reach the gun.
    const head = this.bones.Head.getWorldPosition(new THREE.Vector3());
    this.eyeOffset = head.clone().add(new THREE.Vector3(0, 0.07, -0.07));
    this.forward = 0.1;
    // Lower the shoulders a little so they stay out of the view.
    this.root.position.set(-this.eyeOffset.x, -this.eyeOffset.y - 0.09, -this.eyeOffset.z - this.forward);
    this.reload = { active: false, t: 0, pose: {} };
  }

  pose(dt, weapon, reloadT) {
    const B = this.bones;
    this.mixer.update(dt * 0.4);
    // Hide the head and legs by collapsing them onto their joints.
    for (const n of ['Head', 'Neck', 'LeftUpLeg', 'RightUpLeg']) B[n].scale.setScalar(0.001);
    this.root.updateMatrixWorld(true);
    if (!weapon) return null;
    const rig = weapon.userData.rig;
    const cam = this.root.parent;
    const camQ = cam.getWorldQuaternion(new THREE.Quaternion());
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camQ);
    const d = new THREE.Vector3(0, -1, 0).applyQuaternion(camQ);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ);
    const poleR = d.clone().addScaledVector(r, 0.8).addScaledVector(f, -0.2);
    const poleL = d.clone().addScaledVector(r, -0.35).addScaledVector(f, -0.2);
    let rp = null;
    if (reloadT !== null && rig.support) rp = reloadPose(rig, reloadT, this.reload.pose);
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    const leftIdle = { pos: camPos.clone().addScaledVector(r, -0.3).addScaledVector(d, 0.7).addScaledVector(f, 0.05) };
    gripWeapon(B, this.hands, weapon, rp ? { active: true, pose: rp } : null, poleR, poleL, leftIdle);
    return rp;
  }
}
