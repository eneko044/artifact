import * as THREE from 'three';
import { WEAPONS, PLAYER, DIFFICULTY } from './config.js';
import { ROUTES, HOLDS } from './map.js';

const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export class BotBrain {
  constructor(game, c) {
    this.game = game;
    this.c = c; // combatant
    this.diff = DIFFICULTY[game.settings.difficulty];
    this.reset();
  }

  reset() {
    this.path = null;
    this.pathIdx = 0;
    this.repathT = 0;
    this.goal = null;
    this.target = null;
    this.lastSeenPos = null;
    this.lastSeenT = -99;
    this.reactT = 0;
    this.thinkT = Math.random() * 0.2;
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = 0;
    this.burst = 0;
    this.burstPause = 0;
    this.aimErr = new THREE.Vector2();
    this.errT = 0;
    this.stuckT = 0;
    this.holdT = 0;
    this.investigate = null;
    this.investigateT = 0;
    this.crouchT = 0;
    this.watchYaw = null;
    this.onTargetT = 0;
    this.plan = null;
  }

  // Called at round start after buying.
  assignPlan(plan) {
    this.plan = plan; // {type:'attack', site, route} | {type:'hold', site, spot}
    this.routeIdx = 0;
    this.path = null;
  }

  update(dt, now) {
    const c = this.c;
    const game = this.game;
    if (!c.alive || game.phase === 'freeze') { c.moveSpeedMul = 0; c.trigger = false; return; }

    if (c.justFired) {
      c.justFired = false;
      this.burst--;
      if (this.burst <= 0) {
        const w = WEAPONS[c.weaponId()];
        this.burst = Math.max(1, Math.round(rand(...this.diff.burst)));
        this.burstPause = w.auto ? rand(0.18, 0.45) : rand(0.04, 0.2);
      }
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = rand(0.08, 0.14);
      this.perceive(now);
    }

    const tgt = this.target && this.target.alive ? this.target : null;
    const visible = tgt && now - this.lastSeenT < 0.25;
    const weapon = WEAPONS[c.weaponId()];
    let wantYaw = c.yaw, wantPitch = 0;
    let moveTo = null;
    let speedMul = 1;
    c.wantCrouch = false;
    c.wantWalk = false;

    if (visible) {
      // --- combat ---
      const aimPoint = this.aimPoint(tgt);
      const eye = c.eyePos();
      const d = aimPoint.clone().sub(eye);
      const dist = d.length();
      wantYaw = Math.atan2(-d.x, -d.z) + this.aimErr.x;
      wantPitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) + this.aimErr.y;
      this.errT -= dt;
      if (this.errT <= 0) {
        this.errT = rand(0.15, 0.35);
        // Error is expressed in meters at the target, so long shots stay plausible.
        const meters = this.diff.aimError * Math.max(0.35, 1.5 - this.onTargetT * 0.8) * (c.velocity.lengthSq() > 4 ? 1.5 : 1);
        const e = Math.atan2(meters, Math.max(3, dist));
        this.aimErr.set((Math.random() - 0.5) * 2 * e, (Math.random() - 0.5) * 2 * e * 0.7);
        this.preferHead = Math.random() < this.diff.hsChance;
      }
      this.onTargetT += dt;
      // Movement while fighting: rush with the knife, close distance with short-range guns,
      // otherwise strafe between bursts and stop dead to shoot (counter-strafe).
      const shortRange = weapon.slot === 2 || weapon.id === 'mp9';
      if (weapon.id === 'knife') moveTo = tgt.pos;
      else if (shortRange && dist > 22) { moveTo = tgt.pos; speedMul = 0.85; }
      else if (weapon.id !== 'awp') {
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = rand(0.35, 0.9); }
        const side = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw)).multiplyScalar(this.strafe * 2.5);
        const p = c.pos.clone().add(side);
        if (dist < 7) p.addScaledVector(d.clone().setY(0).normalize(), -1.5);
        moveTo = p;
        speedMul = 0.8;
        if (dist > 16 && this.diff.aimSpeed > 6 && weapon.slot === 1) {
          this.crouchT -= dt;
          if (this.crouchT <= 0) { this.crouchT = rand(0.8, 2); this.crouching = Math.random() < 0.5; }
          c.wantCrouch = this.crouching;
          if (c.wantCrouch) moveTo = null;
        }
      }
      // Shooting.
      this.burstPause -= dt;
      const aimOff = Math.hypot(angDiff(c.yaw, wantYaw), c.pitch - wantPitch);
      const tolerance = 0.05 + 1.2 / Math.max(4, dist);
      c.trigger = false;
      if (now >= this.reactT && this.burstPause <= 0 && aimOff < tolerance) {
        if (weapon.id !== 'knife' || dist < 2.2) c.trigger = true;
        // Plant feet for accuracy unless rushing.
        if (c.trigger && weapon.id !== 'knife' && !(shortRange && dist > 22)) moveTo = null;
      }
    } else {
      this.onTargetT = 0;
      c.trigger = false;
      // --- navigation ---
      let dest = null;
      if (tgt && this.lastSeenPos && now - this.lastSeenT < 6) {
        dest = this.lastSeenPos; // chase last known position
        speedMul = 0.85;
      } else if (this.investigate && now < this.investigateT) {
        dest = this.investigate;
        speedMul = 0.8;
      } else {
        this.target = null;
        dest = this.objective(dt);
      }
      if (dest) moveTo = this.follow(dest, dt);
      // Look where we're going, or toward the watch direction when holding.
      if (moveTo) {
        const dd = moveTo.clone().sub(c.pos);
        if (dd.lengthSq() > 0.04) wantYaw = Math.atan2(-dd.x, -dd.z);
      } else if (this.watchYaw !== null) {
        wantYaw = this.watchYaw + Math.sin(now * 0.4 + c.id) * 0.5;
      }
      // Reload during quiet moments.
      const ws = c.current();
      if (ws && weapon.mag && ws.mag < weapon.mag * 0.4 && ws.reserve > 0 && !c.reloading) c.wantReload = true;
    }

    // Aim toward desired angles with a capped turn speed.
    const turn = this.diff.aimSpeed * (visible ? 1 : 0.55);
    const dy = angDiff(c.yaw, wantYaw);
    c.yaw += THREE.MathUtils.clamp(dy, -turn * dt, turn * dt) * (visible ? 1 : 1);
    c.pitch += THREE.MathUtils.clamp(wantPitch - c.pitch, -turn * dt, turn * dt);
    // Recoil compensation.
    c.pitch -= c.punch.x * this.diff.sprayCtrl * dt * 6;

    // Movement intent in local space.
    if (moveTo) {
      const dir = moveTo.clone().sub(c.pos).setY(0);
      const dl = dir.length();
      if (dl > 0.15) {
        dir.divideScalar(dl);
        c.moveDir.copy(dir);
        c.moveSpeedMul = speedMul * Math.min(1, dl / 0.6);
      } else c.moveSpeedMul = 0;
    } else c.moveSpeedMul = 0;

    // Stuck detection.
    if (c.moveSpeedMul > 0.3 && c.velocity.lengthSq() < 0.2) {
      this.stuckT += dt;
      if (this.stuckT > 0.8) { this.stuckT = 0; this.path = null; c.moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), rand(-1.5, 1.5)); }
    } else this.stuckT = 0;
  }

  aimPoint(t) {
    const p = t.headPos();
    if (!this.preferHead) p.y -= 0.42;
    return p;
  }

  perceive(now) {
    const c = this.c;
    const eye = c.eyePos();
    const fwd = new THREE.Vector3(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
    let best = null, bestD = Infinity;
    for (const e of this.game.combatants) {
      if (!e.alive || e.team === c.team) continue;
      const hp = e.headPos();
      const d = hp.clone().sub(eye);
      const dist = d.length();
      if (dist > 75) continue;
      const flat = d.clone().setY(0).normalize();
      const inFov = flat.dot(fwd) > Math.cos(THREE.MathUtils.degToRad(this.target === e ? 110 : 75));
      if (!inFov && dist > 3) continue;
      // Check head, then chest.
      let seen = this.game.world.lineClear(eye, hp);
      if (!seen) seen = this.game.world.lineClear(eye, e.pos.clone().setY(e.pos.y + 1.0));
      if (!seen) continue;
      const score = dist * (e === this.target ? 0.7 : 1);
      if (score < bestD) { bestD = score; best = e; }
    }
    if (best) {
      if (best !== this.target || now - this.lastSeenT > 1.2) {
        const [a, b] = this.diff.reaction;
        this.reactT = now + rand(a, b) * (bestD > 40 ? 1.25 : 1);
      }
      this.target = best;
      this.lastSeenT = now;
      this.lastSeenPos = best.pos.clone();
      best.spottedUntil = now + 2.5;
      this.game.teamCallout(c, best);
    }
  }

  hearNoise(pos, now) {
    if (this.target && now - this.lastSeenT < 1) return;
    this.investigate = pos.clone();
    this.investigateT = now + rand(3, 6);
    // Turn toward the sound.
    const d = pos.clone().sub(this.c.pos);
    this.watchYaw = Math.atan2(-d.x, -d.z);
  }

  objective(dt) {
    const c = this.c;
    const plan = this.plan;
    if (!plan) return null;
    const cellToV = (cell) => this.game.map.cellCenter(cell[0], cell[1]);
    if (plan.type === 'attack') {
      const route = ROUTES[plan.site][plan.route];
      if (this.routeIdx < route.length) {
        const wp = cellToV(route[this.routeIdx]);
        if (c.pos.distanceTo(wp) < 2.2) { this.routeIdx++; this.path = null; }
        return wp;
      }
      // On site: rotate between holding spots.
      this.holdT -= dt;
      if (!this.spot || this.holdT <= 0) {
        const spots = HOLDS[plan.site];
        this.spot = cellToV(spots[Math.floor(Math.random() * spots.length)]);
        this.holdT = rand(5, 10);
        this.path = null;
      }
      if (c.pos.distanceTo(this.spot) < 1.2) { this.watchYaw = this.watchYaw ?? c.yaw; return null; }
      return this.spot;
    }
    // Defender: go to the hold spot, then watch the approach.
    const spot = cellToV(plan.spot);
    if (c.pos.distanceTo(spot) < 1.0) {
      if (this.watchYaw === null || plan.watchYaw !== undefined) this.watchYaw = plan.watchYaw ?? c.yaw;
      return null;
    }
    return spot;
  }

  follow(dest, dt) {
    const c = this.c;
    this.repathT -= dt;
    if (!this.path || this.repathT <= 0 || !this.goal || this.goal.distanceToSquared(dest) > 1) {
      this.path = this.game.nav.find(c.pos, this.game.map.toCell(dest));
      this.pathIdx = 1;
      this.goal = dest.clone();
      this.repathT = rand(1.2, 2.0);
    }
    if (!this.path) return dest;
    while (this.pathIdx < this.path.length && c.pos.distanceTo(this.path[this.pathIdx]) < 0.9) this.pathIdx++;
    if (this.pathIdx >= this.path.length) return dest;
    return this.path[this.pathIdx];
  }
}

// Round planning for a team of bots.
export function planTeam(game, team, bots) {
  if (team === 't') {
    const site = Math.random() < 0.5 ? 'A' : 'B';
    bots.forEach((b, i) => {
      // Most go together, one or two lurk the other route.
      const route = i % 3 === 2 ? 1 : 0;
      b.assignPlan({ type: 'attack', site: i === bots.length - 1 && bots.length > 3 ? (site === 'A' ? 'B' : 'A') : site, route });
    });
  } else {
    const spots = [
      { site: 'A', spot: [46, 11], watch: [53, 20] },
      { site: 'B', spot: [8, 9], watch: [6, 20] },
      { site: 'A', spot: [51, 7], watch: [52, 14] },
      { site: 'mid', spot: [30, 10], watch: [30, 30] },
      { site: 'B', spot: [14, 7], watch: [6, 14] },
      { site: 'A', spot: [44, 6], watch: [42, 16] },
    ];
    const order = spots.slice().sort(() => Math.random() - 0.5);
    bots.forEach((b, i) => {
      const s = order[i % order.length];
      const sp = game.map.cellCenter(s.spot[0], s.spot[1]);
      const wt = game.map.cellCenter(s.watch[0], s.watch[1]);
      const d = wt.sub(sp);
      b.assignPlan({ type: 'hold', site: s.site, spot: s.spot, watchYaw: Math.atan2(-d.x, -d.z) });
    });
  }
}

// Bot purchasing: favour rifles, keep pistol rounds honest.
export function botBuy(game, c) {
  const want = [];
  const m = () => c.money;
  if (m() >= 4750 + 1000 && Math.random() < 0.18 && !game.teamHas(c.team, 'awp')) want.push('awp');
  else if (m() >= 3100 + 650) want.push(c.team === 't' ? 'ak47' : (Math.random() < 0.7 ? 'm4a4' : 'ak47'));
  else if (m() >= 2700) want.push('ak47');
  else if (m() >= 1250 + 650 && game.round > 1) want.push('mp9');
  for (const id of want) game.buy(c, id, true);
  if (m() >= 1000 && !c.helmet) game.buy(c, 'kevlarHelmet', true);
  else if (m() >= 650 && c.armor < 50) game.buy(c, 'kevlar', true);
  if (m() >= 700 && !c.slots[1] && Math.random() < 0.5) game.buy(c, 'deagle', true);
  if (m() >= 300 && Math.random() < 0.4) game.buy(c, 'he', true);
}

export { PLAYER };
