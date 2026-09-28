import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

const TEAM_TINT = {
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

// Two-bone CCD toward a target point.
function solveArm(upper, lower, hand, target, iterations = 10) {
  const chain = [lower, upper];
  for (let it = 0; it < iterations; it++) {
    for (const bone of chain) {
      bone.getWorldPosition(_v1);
      hand.getWorldPosition(_v2);
      const toEff = _v2.sub(_v1).normalize();
      const toTgt = _v3.copy(target).sub(_v1).normalize();
      const dot = toEff.dot(toTgt);
      if (dot > 0.99995) continue;
      const q = _q1.setFromUnitVectors(toEff, toTgt);
      // Damp rotations for stability.
      const damped = new THREE.Quaternion().slerp(q, 0.8);
      rotateBoneWorld(bone, damped);
    }
    hand.getWorldPosition(_v2);
    if (_v2.distanceToSquared(target) < 1e-5) break;
  }
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
    this.weapon = null;
    this.weaponId = null;
    this.dead = false;
    this.deathT = 0;
    this.fallDir = 1;
    this.recoil = 0;
    this.crouch = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.aiming = 0; // 0 lowered .. 1 shouldered
    this.phase = Math.random();
  }

  setWeapon(model, id, slot) {
    if (this.weapon) this.root.remove(this.weapon);
    this.weapon = model;
    this.weaponId = id;
    this.weaponSlot = slot;
    if (model) this.root.add(model);
  }

  // speed in m/s, yaw/pitch of aim in world space.
  update(dt, speed, yaw, pitch, crouch, aiming) {
    if (this.dead) { this.updateDeath(dt); return; }
    this.aimYaw = yaw;
    this.aimPitch = pitch;
    this.aiming += ((aiming ? 1 : 0) - this.aiming) * Math.min(1, dt * 8);
    this.crouch += ((crouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    this.recoil = Math.max(0, this.recoil - dt * 8);

    // Locomotion blend.
    const wWalk = THREE.MathUtils.clamp(speed / 2.2, 0, 1) * (1 - THREE.MathUtils.clamp((speed - 3.2) / 2, 0, 1));
    const wRun = THREE.MathUtils.clamp((speed - 3.2) / 2, 0, 1);
    const wIdle = Math.max(0, 1 - wWalk - wRun);
    this.actions.Idle.setEffectiveWeight(wIdle);
    this.actions.Walk.setEffectiveWeight(wWalk);
    this.actions.Run.setEffectiveWeight(wRun);
    this.actions.Walk.timeScale = THREE.MathUtils.clamp(speed / 1.6, 0.6, 1.6);
    this.actions.Run.timeScale = THREE.MathUtils.clamp(speed / 5.2, 0.8, 1.3);
    this.mixer.update(dt);

    // Body faces the aim direction (the model looks down -Z by default).
    this.root.rotation.y = yaw;
    this.root.updateMatrixWorld(true);
    this.applyPose();
  }

  applyPose() {
    const B = this.bones;
    const right = _v1.set(1, 0, 0).applyAxisAngle(UP, this.root.rotation.y).clone();
    // Crouch: sink hips and bend legs.
    if (this.crouch > 0.01) {
      const c = this.crouch;
      B.Hips.position.y -= 38 * c; // model units are cm
      rotateBoneWorld(B.LeftUpLeg, new THREE.Quaternion().setFromAxisAngle(right, -1.1 * c));
      rotateBoneWorld(B.RightUpLeg, new THREE.Quaternion().setFromAxisAngle(right, -1.1 * c));
      rotateBoneWorld(B.LeftLeg, new THREE.Quaternion().setFromAxisAngle(right, 1.9 * c));
      rotateBoneWorld(B.RightLeg, new THREE.Quaternion().setFromAxisAngle(right, 1.9 * c));
      rotateBoneWorld(B.LeftFoot, new THREE.Quaternion().setFromAxisAngle(right, -0.7 * c));
      rotateBoneWorld(B.RightFoot, new THREE.Quaternion().setFromAxisAngle(right, -0.7 * c));
    }
    // Pitch spread over the spine, plus a little twist so the rifle sits on the right shoulder.
    const pitch = THREE.MathUtils.lerp(-0.35, this.aimPitch, this.aiming);
    const qp = new THREE.Quaternion().setFromAxisAngle(right, -pitch / 3);
    const twist = new THREE.Quaternion().setFromAxisAngle(UP, (this.weaponSlot === 1 ? 0.35 : 0.12) * (0.4 + this.aiming * 0.6));
    for (const n of ['Spine', 'Spine1', 'Spine2']) {
      rotateBoneWorld(B[n], qp);
      rotateBoneWorld(B[n], new THREE.Quaternion().slerp(twist, 1 / 3));
    }
    // Keep the head level-ish, looking at the target.
    rotateBoneWorld(B.Neck, new THREE.Quaternion().setFromAxisAngle(UP, -0.25 * this.aiming));

    if (!this.weapon) return;
    // Place the weapon in front of the chest along the aim.
    const chest = B.Spine2.getWorldPosition(new THREE.Vector3());
    const yaw = this.aimYaw;
    const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new THREE.Vector3().crossVectors(r, fwd);
    const long = this.weaponSlot === 1;
    const knife = this.weaponId === 'knife';
    const gp = chest.clone()
      .addScaledVector(r, long ? 0.16 : 0.1)
      .addScaledVector(up, long ? 0.08 : 0.12)
      .addScaledVector(fwd, (long ? 0.2 : 0.38) - this.recoil * 0.05);
    if (knife) gp.addScaledVector(up, -0.35).addScaledVector(r, 0.12);
    this.weapon.position.copy(this.root.worldToLocal(gp.clone()));
    const m = new THREE.Matrix4().makeBasis(r, up, fwd.clone().negate());
    const qw = new THREE.Quaternion().setFromRotationMatrix(m);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.weapon.quaternion.copy(rootQ.multiply(qw));
    if (this.recoil > 0) this.weapon.rotateX(this.recoil * 0.12);
    this.weapon.updateMatrixWorld(true);

    // Hands to the weapon.
    solveArm(B.RightArm, B.RightForeArm, B.RightHand, gp);
    if (!knife) {
      const support = gp.clone().addScaledVector(fwd, long ? Math.abs(this.weapon.userData.front) * 0.55 : 0.02)
        .addScaledVector(up, long ? -0.03 : -0.02).addScaledVector(r, long ? 0 : -0.05);
      solveArm(B.LeftArm, B.LeftForeArm, B.LeftHand, support);
    }
  }

  muzzleWorld(out = new THREE.Vector3()) {
    if (!this.weapon) return this.headWorld(out);
    return out.copy(this.weapon.userData.muzzle || new THREE.Vector3()).applyMatrix4(this.weapon.matrixWorld);
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
    // Fall away from the shot.
    const localDir = fromDir.clone().applyQuaternion(this.root.quaternion.clone().invert());
    this.fallAxis = new THREE.Vector3(localDir.z, 0, -localDir.x).normalize();
    if (this.fallAxis.lengthSq() < 0.1) this.fallAxis.set(1, 0, 0);
    this.fallDur = headshot ? 0.45 : 0.7;
    this.startQ = this.model.quaternion.clone();
    this.knees = 0;
  }

  updateDeath(dt) {
    this.deathT += dt;
    const t = Math.min(1, this.deathT / this.fallDur);
    const e = t * t; // accelerate like gravity
    if (!this.settled) this.mixer.update(dt * (1 - t) * 0.6);
    const q = new THREE.Quaternion().setFromAxisAngle(this.fallAxis, e * Math.PI / 2 * 0.97);
    this.model.quaternion.copy(this.startQ).premultiply(q);
    this.model.position.y = e * 0.12;
    if (t >= 1 && !this.settled) {
      this.settled = true; // freeze on the last pose (stopping actions would snap to bind pose)
    }
    this.root.updateMatrixWorld(true);
    // Limp arms / knees for the final pose.
    const B = this.bones;
    const k = Math.min(1, this.deathT / 0.5);
    if (!this.settled) {
      B.LeftLeg.rotation.x += 0.02 * k;
      B.RightLeg.rotation.x += 0.03 * k;
    }
  }
}
