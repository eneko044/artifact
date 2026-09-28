import * as THREE from 'three';
import { WEAPONS, EQUIPMENT, PLAYER, GRAVITY, ECONOMY, ROUND, HITGROUP, BOT_NAMES } from './config.js';
import { Assets } from './assets.js';
import { GameMap, SPAWNS, W, H } from './map.js';
import { World, rayCapsule } from './physics.js';
import { Nav } from './nav.js';
import { Effects } from './effects.js';
import { Audio } from './audio.js';
import { Combatant } from './combatant.js';
import { SoldierBody } from './characters.js';
import { BotBrain, planTeam, botBuy } from './bots.js';
import { ViewModel } from './viewmodel.js';
import { PlayerController } from './player.js';
import { CELL } from './config.js';

const tmpV = new THREE.Vector3();

export class Game {
  constructor(container, hud, settings) {
    this.container = container;
    this.hud = hud;
    this.settings = settings;
    this.combatants = [];
    this.bots = [];
    this.grenades = [];
    this.drops = [];
    this.phase = 'menu';
    this.time = 0;
    this.round = 0;
    this.score = { ct: 0, t: 0 };
    this.lossStreak = { ct: 0, t: 0 };
    this.paused = true;
    this.shake = 0;
    this.roundHistory = [];
  }

  async init(onProgress) {
    const q = this.settings.quality;
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: q !== 'baja', powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'alta' ? 1.5 : q === 'media' ? 1.15 : 0.85));
    renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    this.container.appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.05, 600);
    this.camera.rotation.order = 'YXZ';

    this.assets = new Assets(renderer);
    await this.assets.load(onProgress);

    const scene = this.scene;
    scene.background = this.assets.skyTexture;
    scene.environment = this.assets.envMap;
    scene.backgroundIntensity = 0.85;
    scene.fog = new THREE.Fog(0xd9d2c3, 70, 330);

    const sun = (this.sun = new THREE.DirectionalLight(0xfff0d6, 3.3));
    this.sunDir = new THREE.Vector3(-0.45, 0.78, 0.43).normalize();
    const center = new THREE.Vector3((W * CELL) / 2, 0, (H * CELL) / 2);
    sun.position.copy(center).addScaledVector(this.sunDir, 120);
    sun.target.position.copy(center);
    sun.castShadow = true;
    const sm = q === 'alta' ? 4096 : q === 'media' ? 2048 : 1024;
    sun.shadow.mapSize.set(sm, sm);
    const sc = sun.shadow.camera;
    sc.left = -82; sc.right = 82; sc.top = 82; sc.bottom = -82; sc.near = 10; sc.far = 260;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x8a6a45, 0.45));

    // Materials pick up the environment gently; the sun does the heavy lifting.
    for (const m of Object.values(this.assets.materials)) m.envMapIntensity = 0.55;

    this.map = new GameMap(this.assets, scene);
    this.map.build();
    this.world = new World(this.map);
    this.nav = new Nav(this.map);
    this.effects = new Effects(scene, this.camera);
    this.audio = new Audio();
    this.effects.onShellBounce = (p) => { if (this.audio.ctx && p.distanceTo(this.camera.position) < 6) this.audio.play('pin', { pos: p, volume: 0.25, rate: 1.6 + Math.random() * 0.5 }); };
    this.effects.onMagLand = (p) => { if (this.audio.ctx && p.distanceTo(this.camera.position) < 15) this.audio.play('bounce', { pos: p, volume: 0.35, rate: 0.6 + Math.random() * 0.2 }); };

    this.controller = new PlayerController(this);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.hud.buildRadar(this.map);
    this.clock = new THREE.Clock();
    renderer.setAnimationLoop(() => this.frame());
    // Precompile shaders so the first round doesn't hitch.
    renderer.compile(scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.vm) { this.vm.camera.aspect = w / h; this.vm.camera.updateProjectionMatrix(); }
    const scale = h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) * this.renderer.getPixelRatio();
    for (const p of [this.effects?.smoke, this.effects?.sparks, this.effects?.fire, this.effects?.bloodP]) if (p) p.points.material.uniforms.scale.value = scale;
  }

  // ---------------- match / rounds ----------------

  newMatch(settings) {
    this.settings = settings;
    for (const c of this.combatants) if (c.body) this.scene.remove(c.body.root);
    this.combatants = [];
    this.bots = [];
    this.score = { ct: 0, t: 0 };
    this.lossStreak = { ct: 0, t: 0 };
    this.round = 0;
    this.roundHistory = [];
    this.effects.holes.clear();
    const pteam = settings.team;
    const player = (this.player = new Combatant({ name: settings.name || 'Tú', team: pteam, isBot: false }));
    player.isPlayer = true;
    this.combatants.push(player);
    const enemyTeam = pteam === 'ct' ? 't' : 'ct';
    const allies = settings.mode === 'equipo' ? 4 : 0;
    const enemies = settings.mode === 'equipo' ? 5 : settings.enemies;
    const names = { t: BOT_NAMES.t.slice().sort(() => Math.random() - 0.5), ct: BOT_NAMES.ct.slice().sort(() => Math.random() - 0.5) };
    const addBot = (team) => {
      const c = new Combatant({ name: names[team].pop(), team, isBot: true });
      c.body = this.makeBody(team);
      this.scene.add(c.body.root);
      c.brain = new BotBrain(this, c);
      this.combatants.push(c);
      this.bots.push(c);
    };
    for (let i = 0; i < allies; i++) addBot(pteam);
    for (let i = 0; i < enemies; i++) addBot(enemyTeam);
    for (const c of this.combatants) c.money = ECONOMY.start;
    if (this.vm) this.vm.scene.clear();
    this.vm = new ViewModel(this.assets, pteam);
    this.resize();
    this.hud.setTeams(this);
    this.startRound();
  }

  startRound() {
    this.round++;
    this.phase = 'freeze';
    this.phaseEnd = this.time + ROUND.freeze;
    this.roundStart = this.time + ROUND.freeze;
    this.roundKills = new Map();
    for (const g of this.grenades) this.scene.remove(g.mesh);
    this.grenades = [];
    for (const d of this.drops) this.scene.remove(d.mesh);
    this.drops = [];
    this.effects.clearRound();
    const spawnIdx = { ct: 0, t: 0 };
    const order = { ct: SPAWNS.ct.slice().sort(() => Math.random() - 0.5), t: SPAWNS.t.slice().sort(() => Math.random() - 0.5) };
    for (const c of this.combatants) {
      const survived = c.alive && this.round > 1;
      if (!survived) {
        c.slots = { 1: null, 2: null, 3: { id: 'knife', mag: 0, reserve: 0 }, 4: 0 };
        c.armor = 0; c.helmet = false;
      }
      c.resetLife();
      if (!c.slots[2]) c.give(c.team === 'ct' ? 'usp' : 'glock');
      // Top up ammo of kept weapons.
      for (const s of [1, 2]) if (c.slots[s]) { const d = WEAPONS[c.slots[s].id]; c.slots[s].mag = d.mag; c.slots[s].reserve = d.reserve; }
      c.slot = c.slots[1] ? 1 : 2;
      const sp = order[c.team][spawnIdx[c.team]++ % order[c.team].length];
      this.map.cellCenter(sp[0], sp[1], c.pos);
      c.pos.x += (Math.random() - 0.5) * 0.6;
      c.pos.z += (Math.random() - 0.5) * 0.6;
      c.yaw = c.team === 'ct' ? Math.PI : 0;
      c.pitch = 0;
      if (c.body) {
        this.scene.remove(c.body.root);
        c.body = this.makeBody(c.team);
        this.scene.add(c.body.root);
        c.body.root.position.copy(c.pos);
        this.equipBody(c);
        c.brain.reset();
      }
    }
    for (const b of this.bots) botBuy(this, b);
    for (const b of this.bots) b.slot = b.slots[1] ? 1 : 2, this.equipBody(b);
    planTeam(this, 't', this.bots.filter((b) => b.team === 't').map((b) => b.brain));
    planTeam(this, 'ct', this.bots.filter((b) => b.team === 'ct').map((b) => b.brain));
    this.player.slot = this.player.slots[1] ? 1 : 2;
    this.vm.setWeapon(this.player.weaponId());
    this.controller.onRoundStart();
    this.hud.roundBanner(`RONDA ${this.round}`, this.roundSubtitle());
    this.hud.refreshAll(this);
    if (this.audio.ctx) this.audio.play('radio', { volume: 0.4 });
  }

  makeBody(team) {
    const b = new SoldierBody(this.assets, team);
    b.onMagDrop = (mag) => this.effects.dropMag(mag);
    return b;
  }

  roundSubtitle() {
    const need = this.settings.winsNeeded;
    const m = Math.max(this.score.ct, this.score.t);
    if (m === need - 1) return 'Punto de partido';
    return this.player.team === 'ct' ? 'Defiende las zonas A y B' : 'Elimina a los antiterroristas';
  }

  goLive() {
    this.phase = 'live';
    this.phaseEnd = this.time + ROUND.length;
    this.hud.centerMessage('¡Adelante!', 1.4);
    if (this.audio.ctx) { this.audio.play('beep', { volume: 0.3 }); }
  }

  endRound(winner, reason) {
    if (this.phase !== 'live' && this.phase !== 'freeze') return;
    this.phase = 'end';
    this.phaseEnd = this.time + ROUND.end;
    this.score[winner]++;
    const loser = winner === 'ct' ? 't' : 'ct';
    this.lossStreak[winner] = 0;
    const lossBonus = Math.min(ECONOMY.lossMax, ECONOMY.lossBase + ECONOMY.lossStep * this.lossStreak[loser]);
    this.lossStreak[loser]++;
    for (const c of this.combatants) {
      c.money = Math.min(ECONOMY.max, c.money + (c.team === winner ? ECONOMY.winReward : lossBonus));
    }
    // MVP: most kills this round on the winning side.
    let mvp = null, best = 0;
    for (const [c, k] of this.roundKills) if (c.team === winner && k > best) { best = k; mvp = c; }
    if (mvp) mvp.mvps++;
    this.roundHistory.push({ winner, reason });
    const title = winner === 'ct' ? 'Ganan los antiterroristas' : 'Ganan los terroristas';
    this.hud.roundEnd(winner, title, reason, mvp ? `MVP: ${mvp.name} · ${best} baja${best === 1 ? '' : 's'}` : '');
    if (this.audio.ctx) this.audio.play(winner === this.player.team ? 'win' : 'lose', { volume: 0.35 });
    this.hud.refreshAll(this);
  }

  checkRoundOver() {
    if (this.phase !== 'live') return;
    const alive = (t) => this.combatants.some((c) => c.team === t && c.alive);
    if (!alive('t')) this.endRound('ct', 'Terroristas eliminados');
    else if (!alive('ct')) this.endRound('t', 'Antiterroristas eliminados');
  }

  // ---------------- buying ----------------

  canBuy(c) {
    return (this.phase === 'freeze' || (this.phase === 'live' && this.time < this.roundStart + ROUND.buyWindow)) && c.alive;
  }

  buy(c, id, silent) {
    if (!this.canBuy(c)) return false;
    const eq = EQUIPMENT[id];
    if (eq) {
      if (id === 'kevlar' && c.armor >= 100) return false;
      if (id === 'kevlarHelmet' && c.armor >= 100 && c.helmet) return false;
      let price = eq.price;
      if (id === 'kevlarHelmet' && c.armor >= 100) price = 350;
      if (c.money < price) return false;
      c.money -= price;
      c.armor = 100;
      if (id === 'kevlarHelmet') c.helmet = true;
    } else {
      const def = WEAPONS[id];
      if (!def || c.money < def.price) return false;
      if (def.grenade && c.slots[4]) return false;
      if (!def.grenade && c.slots[def.slot]?.id === id) return false;
      c.money -= def.price;
      if (!def.grenade && c.slots[def.slot]) this.dropWeapon(c, def.slot, true);
      c.give(id);
      if (!def.grenade) { c.slot = def.slot; this.onWeaponSwitched(c); }
    }
    if (!silent && c.isPlayer && this.audio.ctx) this.audio.play('buy', { volume: 0.4 });
    if (c.isPlayer) this.hud.refreshAll(this);
    return true;
  }

  teamHas(team, id) { return this.combatants.some((c) => c.team === team && c.slots[1]?.id === id); }

  // ---------------- weapons ----------------

  equipBody(c) {
    if (!c.body) return;
    const id = c.weaponId();
    c.body.setWeapon(this.assets.weaponModel(id), id, WEAPONS[id].slot);
  }

  switchSlot(c, slot) {
    if (!c.alive || slot === c.slot) return;
    if (slot === 4 && !c.slots[4]) return;
    if ((slot === 1 || slot === 2) && !c.slots[slot]) return;
    c.lastSlot = c.slot;
    c.slot = slot;
    this.onWeaponSwitched(c);
  }

  onWeaponSwitched(c) {
    c.reloading = false;
    c.scope = 0;
    c.shotsFired = 0;
    const def = WEAPONS[c.weaponId()];
    c.drawEnd = this.time + (def.id === 'awp' ? 0.8 : def.id === 'knife' ? 0.35 : 0.55);
    if (c.isPlayer) {
      this.vm.setWeapon(def.id);
      if (this.audio.ctx) this.audio.play('draw', { volume: 0.35 });
      this.hud.refreshAll(this);
    } else this.equipBody(c);
  }

  updateWeapon(c, dt) {
    const now = this.time;
    const def = WEAPONS[c.weaponId()];
    const ws = c.current();
    // Recoil recovery.
    if (now - c.lastShotT > Math.max(0.06, def.rate * 0.9)) {
      const k = Math.exp(-dt * (c.trigger && def.auto ? 2.5 : 6.5));
      c.punch.multiplyScalar(k);
      if (!c.trigger || !def.auto) c.shotsFired = Math.max(0, c.shotsFired - dt * 14);
    }
    if (c.reloading && now >= c.reloadEnd) {
      c.reloading = false;
      const need = def.mag - ws.mag;
      const take = Math.min(need, ws.reserve);
      ws.mag += take;
      ws.reserve -= take;
      if (c.isPlayer) this.hud.refreshAll(this);
    }
    if (c.wantReload) {
      c.wantReload = false;
      this.startReload(c);
    }
    if (c.rescopeAt && now >= c.rescopeAt) { c.scope = c.rescopeLevel; c.rescopeAt = 0; }
    if (c.triggerAlt && !c.triggerAltHeld) {
      c.triggerAltHeld = true;
      if (def.scope && now >= c.drawEnd && !c.reloading) {
        c.scope = (c.scope + 1) % 3;
        if (this.audio.ctx && c.isPlayer) this.audio.play('ui', { volume: 0.3, rate: 0.7 });
      } else if (def.id === 'knife' && now >= c.nextFire && now >= c.drawEnd) {
        this.knifeAttack(c, true);
      }
    }
    if (!c.triggerAlt) c.triggerAltHeld = false;
    if (!c.trigger) { c.triggerHeld = false; return; }
    if (now < c.nextFire || now < c.drawEnd || c.reloading) return;
    if (!def.auto && c.triggerHeld && !c.isBot) return;
    c.triggerHeld = true;
    if (def.grenade) { this.throwGrenade(c); return; }
    if (def.id === 'knife') { this.knifeAttack(c, false); return; }
    if (ws.mag <= 0) {
      c.nextFire = now + 0.25;
      if (c.isPlayer && this.audio.ctx) this.audio.play('dry', { volume: 0.5 });
      if (ws.reserve > 0) this.startReload(c);
      return;
    }
    ws.mag--;
    // Bots tap semi-automatics a little slower than the cyclic rate.
    c.nextFire = now + def.rate * (c.isBot && !def.auto ? 1.35 + Math.random() * 0.5 : 1);
    this.fireBullet(c, def);
    if (ws.mag === 0 && ws.reserve > 0 && c.isBot) c.wantReload = true;
    if (c.isPlayer) this.hud.refreshAll(this);
  }

  startReload(c) {
    const def = WEAPONS[c.weaponId()];
    const ws = c.current();
    if (!ws || !def.mag || c.reloading || ws.mag >= def.mag || ws.reserve <= 0) return;
    c.reloading = true;
    c.reloadEnd = this.time + def.reload;
    if (c.scope) { c.scope = 0; }
    c.rescopeAt = 0;
    const pos = c.isPlayer ? null : c.pos.clone().setY(1.2);
    const vol = c.isPlayer ? 0.45 : 0.6;
    if (this.audio.ctx) {
      const occ = !c.isPlayer && !this.world.lineClear(this.camera.position, pos);
      const pistol = def.slot === 2;
      this.audio.play('magOut', { pos, volume: vol, delay: def.reload * (pistol ? 0.13 : 0.18), occluded: occ });
      if (!pistol) this.audio.play('dry', { pos, volume: vol * 0.5, delay: def.reload * 0.3, occluded: occ, rate: 0.5 });
      this.audio.play('magIn', { pos, volume: vol, delay: def.reload * 0.61, occluded: occ });
      this.audio.play('boltBack', { pos, volume: vol, delay: def.reload * 0.76, occluded: occ });
      this.audio.play('boltFwd', { pos, volume: vol, delay: def.reload * 0.82, occluded: occ });
    }
    if (c.isPlayer) this.vm.reload(def.reload);
  }

  inaccuracy(c, def) {
    const speed = Math.hypot(c.velocity.x, c.velocity.z);
    let s = def.spread;
    if (def.scope && c.scope === 0) s = def.unscopedSpread;
    s += def.moveSpread * THREE.MathUtils.clamp((speed - 1.1) / (def.speed - 1.1), 0, 1);
    if (!c.onGround) s += def.jumpSpread || 0.15;
    s *= 1 - c.crouch * 0.28;
    if (def.auto) s += Math.min(c.shotsFired, 12) * 0.0011;
    return s;
  }

  fireBullet(c, def) {
    const now = this.time;
    const origin = c.eyePos();
    const dir = c.aimDir(new THREE.Vector3(), true);
    const inacc = this.inaccuracy(c, def);
    if (inacc > 0) {
      const r = inacc * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
      const right = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    }
    // Recoil pattern: climb first, then sway side to side.
    c.shotsFired++;
    c.lastShotT = now;
    const n = c.shotsFired;
    const climb = def.recoil[0] * (n < 3 ? 0.7 : n < 10 ? 1 : 0.35) * (0.9 + Math.random() * 0.2);
    c.punch.x = Math.min(0.26, c.punch.x + climb);
    c.punch.y += def.recoil[1] * (n > 5 ? Math.sin(n * 0.5) * 1.6 : (Math.random() - 0.5) * 0.8);
    c.justFired = true;
    if (def.scope && c.scope) { c.rescopeLevel = c.scope; c.scope = 0; c.rescopeAt = now + def.rate * 0.8; }

    const hit = this.traceBullet(c, origin, dir, def);
    // Muzzle, tracer, shell, sound.
    let muzzle;
    const rifle = def.slot === 1;
    if (c.isPlayer) {
      muzzle = this.camera.localToWorld(this.vm.muzzleCameraSpace());
      this.vm.fire(def);
      this.effects.flashLight(muzzle, def.suppressed ? 0.6 : 5, 0.05);
      if (!def.suppressed && Math.random() < 0.4) this.effects.tracer(muzzle.clone().addScaledVector(dir, 1.5), hit.point, 650);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const ej = this.camera.localToWorld(new THREE.Vector3(0.12, -0.13, -0.55));
      if (def.id !== 'awp') this.effects.shell(ej, right.multiplyScalar(1.6 + Math.random()).addScaledVector(upv, 1.4 + Math.random() * 0.6).add(c.velocity), rifle);
      this.controller.fovKick += def.id === 'awp' ? 2.2 : rifle ? 0.55 : def.id === 'deagle' ? 1.2 : 0.35;
      this.hud.kick(def);
    } else {
      muzzle = c.body.muzzleWorld();
      const barrel = new THREE.Vector3(0, 0, -1).applyQuaternion(c.body.weapon.getWorldQuaternion(new THREE.Quaternion()));
      if (!def.suppressed) this.effects.muzzle(muzzle, barrel, rifle ? 1 : 0.7);
      else this.effects.flashLight(muzzle, 0.8, 0.04);
      if (!def.suppressed) this.effects.tracer(muzzle, hit.point, 600);
      const ej = c.body.ejectWorld();
      if (ej && def.id !== 'awp') {
        const r = new THREE.Vector3(1, 0, 0).applyQuaternion(c.body.weapon.getWorldQuaternion(new THREE.Quaternion()));
        this.effects.shell(ej, r.multiplyScalar(1.5 + Math.random()).add(new THREE.Vector3(0, 1.6, 0)), rifle);
      }
      c.body.recoil = 1;
      c.heat = Math.min(3, (c.heat || 0) + 0.3);
    }
    if (this.audio.ctx) {
      const snd = def.suppressed ? 'usp' : def.sound;
      if (c.isPlayer) this.audio.play(snd, { volume: def.suppressed ? 0.5 : 0.62, reverb: 0.5, jitter: 0.04 });
      else {
        const occ = !this.world.lineClear(this.camera.position, muzzle, true);
        this.audio.play(snd, { pos: muzzle, volume: 1, reverb: 0.6, occluded: occ, ref: 5, rolloff: 0.9 });
      }
    }
    this.makeNoise(c, c.pos, def.suppressed ? 12 : 55);
  }

  traceBullet(shooter, origin, dir, def) {
    const maxDist = def.id === 'knife' ? def.range : 220;
    const wh = this.world.raycast(origin, dir, maxDist);
    let best = wh ? wh.dist : maxDist;
    let victim = null, group = null;
    for (const c of this.combatants) {
      if (c === shooter || !c.alive) continue;
      // Broad phase.
      const center = tmpV.copy(c.pos).setY(c.pos.y + 1);
      const oc = center.clone().sub(origin);
      const along = oc.dot(dir);
      if (along < 0 || along > best + 1) continue;
      const perp = oc.addScaledVector(dir, -along).length();
      if (perp > 1.4) continue;
      for (const s of c.hitShapes()) {
        const t = rayCapsule(origin, dir, s.a, s.b, s.r);
        if (t > 0 && t < best) { best = t; victim = c; group = s.group; }
      }
    }
    const point = origin.clone().addScaledVector(dir, best);
    // Near-miss whiz for the player.
    if (shooter !== this.player && this.player.alive && victim !== this.player && this.audio.ctx) {
      const e = this.player.eyePos();
      const along = e.clone().sub(origin).dot(dir);
      if (along > 3 && along < best) {
        const closest = origin.clone().addScaledVector(dir, along);
        if (closest.distanceTo(e) < 1.6) this.audio.play('whiz', { pos: closest, volume: 0.7 });
      }
    }
    if (victim) {
      if (victim.team !== shooter.team) this.applyDamage(victim, shooter, def, group, best, dir, point);
      else this.effects.blood(point, dir, false);
      return { point, victim };
    }
    if (wh) {
      this.effects.impact(point, wh.normal, wh.mat);
      if (this.audio.ctx && point.distanceTo(this.camera.position) < 30) {
        const snd = wh.mat === 'wood' ? 'impactWood' : wh.mat === 'metal' ? 'impactMetal' : 'impactStone';
        this.audio.play(snd, { pos: point, volume: 0.35 });
      }
    }
    return { point, victim: null };
  }

  applyDamage(victim, attacker, def, group, dist, dir, point) {
    let dmg = def.damage * HITGROUP[group] * Math.pow(def.falloff, dist / 12.7);
    let armorHit = false;
    const armored = victim.armor > 0 && group !== 'legs' && (group !== 'head' || victim.helmet);
    if (armored) {
      const hp = dmg * def.armorPen;
      victim.armor = Math.max(0, victim.armor - Math.round((dmg - hp) * 0.5));
      dmg = hp;
      armorHit = true;
    }
    this.hurt(victim, attacker, Math.max(1, Math.round(dmg)), { group, dir, point, weapon: def.id, armorHit });
  }

  hurt(victim, attacker, amount, { group, dir, point, weapon, armorHit }) {
    if (!victim.alive) return;
    const dealt = Math.min(victim.hp, amount);
    victim.hp -= amount;
    victim.lastHitT = this.time;
    if (attacker) {
      victim.damageFrom.set(attacker, (victim.damageFrom.get(attacker) || 0) + dealt);
      attacker.damageDealt += dealt;
    }
    if (point) {
      this.effects.blood(point, dir, group === 'head');
      // Spatter on nearby surfaces behind the victim.
      const back = this.world.raycast(point, dir, 3);
      if (back && Math.random() < 0.8) this.effects.bloodSplat(back.point, back.normal, group === 'head' ? 1.2 : 0.8);
    }
    // Tagging slows the victim briefly (CS-style).
    victim.velocity.multiplyScalar(0.45);
    victim.punch.x += 0.02;
    if (victim.isPlayer) {
      const from = attacker ? attacker.pos.clone().sub(victim.pos) : dir.clone().negate();
      this.hud.damageFrom(Math.atan2(-from.x, -from.z) - victim.yaw, amount);
      if (this.audio.ctx) this.audio.play(group === 'head' && victim.helmet && armorHit ? 'headshot' : 'hit', { volume: 0.6 });
      this.hud.refreshAll(this);
    }
    if (attacker?.isPlayer && this.audio.ctx) {
      this.audio.play(group === 'head' ? 'headshot' : 'tick', { volume: group === 'head' ? 0.5 : 0.35 });
      this.hud.hitmarker(group === 'head', victim.hp <= 0);
    } else if (point && this.audio.ctx && !victim.isPlayer) {
      this.audio.play(group === 'head' ? 'headshot' : 'hit', { pos: point, volume: 0.5 });
    }
    if (victim.brain && attacker) victim.brain.hearNoise(attacker.pos, this.time);
    if (victim.hp <= 0) this.kill(victim, attacker, weapon, group === 'head', dir || new THREE.Vector3(0, 0, 1));
  }

  kill(victim, attacker, weapon, headshot, dir) {
    victim.alive = false;
    victim.hp = 0;
    victim.deaths++;
    victim.reloading = false;
    victim.trigger = false;
    if (attacker && attacker !== victim && attacker.team !== victim.team) {
      attacker.kills++;
      if (headshot) attacker.headshots++;
      attacker.money = Math.min(ECONOMY.max, attacker.money + WEAPONS[weapon].killReward);
      this.roundKills.set(attacker, (this.roundKills.get(attacker) || 0) + 1);
    }
    for (const [who, d] of victim.damageFrom) if (who !== attacker && who.team !== victim.team && d >= 40) who.assists++;
    this.hud.killfeed(attacker, victim, weapon, headshot, this.player);
    // Drop the best gun.
    const dropSlot = victim.slots[1] ? 1 : victim.slots[2] ? 2 : 0;
    if (dropSlot) this.dropWeapon(victim, dropSlot, false, dir);
    if (victim.body) {
      victim.body.die(dir, headshot);
      if (victim.body.weapon) { victim.body.root.remove(victim.body.weapon); victim.body.weapon = null; }
    }
    if (victim.isPlayer) this.controller.onDeath(attacker, weapon, headshot);
    this.hud.refreshAll(this);
    this.checkRoundOver();
  }

  dropWeapon(c, slot, thrown, dir) {
    const ws = c.slots[slot];
    if (!ws) return;
    c.slots[slot] = null;
    const mesh = this.assets.weaponModel(ws.id);
    const pos = c.pos.clone().setY(c.pos.y + 1.1);
    const vel = thrown ? c.aimDir(new THREE.Vector3(), false).multiplyScalar(4).add(new THREE.Vector3(0, 1.5, 0)) : (dir ? dir.clone().setY(0).normalize().multiplyScalar(1.2) : new THREE.Vector3()).add(new THREE.Vector3(0, 1, 0));
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.drops.push({ ...ws, mesh, pos, vel, t: 0, noPickup: this.time + 0.8, owner: c, spin: (Math.random() - 0.5) * 6 });
    if (c.slot === slot && c.alive) { c.slot = c.slots[1] ? 1 : c.slots[2] ? 2 : 3; this.onWeaponSwitched(c); }
  }

  updateDrops(dt) {
    for (const d of this.drops) {
      if (!d.resting) {
        d.vel.y -= GRAVITY * dt;
        const next = d.pos.clone().addScaledVector(d.vel, dt);
        const floor = this.world.groundHeight(next.x, next.z, 0.1, d.pos.y) + 0.04;
        const hitWall = this.world.raycast(d.pos, d.vel.clone().normalize(), d.vel.length() * dt + 0.05, false);
        if (hitWall && hitWall.normal.y < 0.5) { d.vel.reflect(hitWall.normal).multiplyScalar(0.3); }
        else d.pos.copy(next);
        if (d.pos.y <= floor) { d.pos.y = floor; d.vel.set(0, 0, 0); d.resting = true; d.mesh.rotation.z = Math.PI / 2; }
        d.mesh.rotation.y += d.spin * dt;
        d.mesh.rotation.z += (Math.PI / 2 - d.mesh.rotation.z) * Math.min(1, dt * 6);
        if (d.resting) d.mesh.rotation.z = Math.PI / 2;
      }
      d.mesh.position.copy(d.pos);
    }
    // Auto pickup when the slot is empty; the player can swap with E.
    for (const c of this.combatants) {
      if (!c.alive) continue;
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i];
        if (this.time < d.noPickup && d.owner === c) continue;
        if (d.pos.distanceTo(tmpV.copy(c.pos).setY(c.pos.y + 0.3)) > 1.2) continue;
        const def = WEAPONS[d.id];
        if (c.slots[def.slot]) continue;
        this.pickup(c, i);
      }
    }
  }

  pickup(c, i) {
    const d = this.drops[i];
    const def = WEAPONS[d.id];
    if (c.slots[def.slot]) this.dropWeapon(c, def.slot, true);
    c.slots[def.slot] = { id: d.id, mag: d.mag, reserve: d.reserve };
    this.scene.remove(d.mesh);
    this.drops.splice(this.drops.indexOf(d), 1);
    if (c.isPlayer && this.audio.ctx) this.audio.play('magIn', { volume: 0.4 });
    if (def.slot < c.slot || c.isBot) { c.slot = def.slot; this.onWeaponSwitched(c); }
    if (c.isPlayer) this.hud.refreshAll(this);
  }

  nearestDrop(c) {
    let best = null, bd = 1.8;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i].pos.distanceTo(tmpV.copy(c.pos).setY(c.pos.y + 0.3));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  knifeAttack(c, alt) {
    const def = WEAPONS.knife;
    c.nextFire = this.time + (alt ? def.rateAlt : def.rate);
    const origin = c.eyePos();
    const dir = c.aimDir(new THREE.Vector3(), false);
    if (c.isPlayer) this.vm.knifeSwing(alt);
    if (this.audio.ctx) this.audio.play('knife', { pos: c.isPlayer ? null : c.pos.clone().setY(1.3), volume: 0.5 });
    // Short, fat trace.
    const wh = this.world.raycast(origin, dir, def.range);
    let best = wh ? wh.dist : def.range, victim = null, group = 'chest';
    for (const t of this.combatants) {
      if (t === c || !t.alive || t.team === c.team) continue;
      for (const s of t.hitShapes()) {
        const r = rayCapsule(origin, dir, s.a, s.b, s.r + 0.12);
        if (r > 0 && r < best) { best = r; victim = t; group = s.group === 'head' ? 'head' : 'chest'; }
      }
    }
    if (victim) {
      // Backstab: attacker behind the victim.
      const vf = new THREE.Vector3(-Math.sin(victim.yaw), 0, -Math.cos(victim.yaw));
      const back = vf.dot(dir.clone().setY(0).normalize()) > 0.5;
      const dmg = back ? (alt ? 180 : 90) : (alt ? def.damageAlt : def.damage);
      const armored = victim.armor > 0;
      this.hurt(victim, c, Math.round(armored ? dmg * def.armorPen : dmg), { group: 'chest', dir, point: origin.clone().addScaledVector(dir, best), weapon: 'knife' });
      if (this.audio.ctx) this.audio.play('knifeHit', { pos: victim.pos.clone().setY(1.2), volume: 0.7 });
    } else if (wh) {
      this.effects.impact(wh.point, wh.normal, wh.mat);
      if (this.audio.ctx) this.audio.play('impactStone', { pos: wh.point, volume: 0.5 });
    }
  }

  throwGrenade(c) {
    const def = WEAPONS.he;
    c.nextFire = this.time + def.rate;
    c.slots[4] = 0;
    const dir = c.aimDir(new THREE.Vector3(), false);
    const pos = c.eyePos().addScaledVector(dir, 0.4);
    const vel = dir.multiplyScalar(15).add(new THREE.Vector3(0, 2.5, 0)).add(c.velocity.clone().multiplyScalar(0.9));
    const mesh = this.assets.weaponModel('he');
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.grenades.push({ pos, vel, t: 0, owner: c, mesh });
    if (c.isPlayer) this.vm.throwNade();
    if (this.audio.ctx) this.audio.play('pin', { pos: c.isPlayer ? null : pos, volume: 0.4 });
    setTimeout(() => { if (c.alive && c.slot === 4) { c.slot = c.slots[1] ? 1 : c.slots[2] ? 2 : 3; this.onWeaponSwitched(c); } }, 450);
    if (c.isPlayer) this.hud.refreshAll(this);
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.t += dt;
      const steps = 3;
      for (let s = 0; s < steps; s++) {
        const h = dt / steps;
        g.vel.y -= GRAVITY * 0.75 * h;
        const len = g.vel.length() * h;
        if (len > 1e-5) {
          const d = g.vel.clone().normalize();
          const hit = this.world.raycast(g.pos, d, len + 0.06);
          if (hit) {
            g.pos.copy(hit.point).addScaledVector(hit.normal, 0.06);
            g.vel.reflect(hit.normal).multiplyScalar(0.42);
            if (hit.normal.y > 0.7) { g.vel.x *= 0.7; g.vel.z *= 0.7; }
            if (g.vel.length() > 1.2 && this.audio.ctx) this.audio.play('bounce', { pos: g.pos, volume: 0.5 });
          } else g.pos.addScaledVector(g.vel, h);
        }
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * g.vel.length() * 2;
      if (g.t >= 1.6) {
        this.explode(g);
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
      }
    }
  }

  explode(g) {
    const def = WEAPONS.he;
    const p = g.pos.clone();
    this.effects.explosion(p);
    if (this.audio.ctx) this.audio.play('he', { pos: p, volume: 1.4, reverb: 0.9, ref: 6, rolloff: 0.8 });
    const d = this.camera.position.distanceTo(p);
    this.shake = Math.max(this.shake, THREE.MathUtils.clamp(1 - d / 25, 0, 1) * 0.8);
    for (const c of this.combatants) {
      if (!c.alive) continue;
      const chest = c.pos.clone().setY(c.pos.y + 1);
      const dist = chest.distanceTo(p);
      if (dist > def.radius) continue;
      if (!this.world.lineClear(p.clone().setY(p.y + 0.3), chest, false)) continue;
      if (c.team === g.owner.team && c !== g.owner) continue;
      let dmg = def.damage * Math.pow(1 - dist / def.radius, 1.4);
      if (c.armor > 0) { const hp = dmg * 0.5; c.armor = Math.max(0, c.armor - Math.round((dmg - hp) * 0.5)); dmg = hp; }
      if (dmg >= 1) this.hurt(c, g.owner, Math.round(dmg), { group: 'chest', dir: chest.clone().sub(p).normalize(), point: null, weapon: 'he' });
    }
    this.makeNoise(g.owner, p, 60);
  }

  makeNoise(src, pos, radius) {
    for (const b of this.bots) {
      if (!b.alive || b.team === src.team) continue;
      if (b.pos.distanceTo(pos) < radius) b.brain.hearNoise(pos, this.time);
    }
  }

  teamCallout(bot, enemy) {
    // Teammates within earshot learn where the enemy is.
    for (const b of this.bots) {
      if (b === bot || !b.alive || b.team !== bot.team) continue;
      if (b.pos.distanceTo(bot.pos) < 35 && !(b.brain.target && this.time - b.brain.lastSeenT < 1)) {
        if (Math.random() < 0.5) b.brain.hearNoise(enemy.pos, this.time);
      }
    }
  }

  // ---------------- movement ----------------

  moveCombatant(c, dt) {
    const frozen = this.phase === 'freeze' || this.phase === 'matchover';
    // Crouch with ceiling check when standing up.
    const wantC = c.wantCrouch ? 1 : 0;
    if (wantC < c.crouch && !this.world.headroom(c.pos.x, c.pos.y, c.pos.z, PLAYER.radius * 0.9, PLAYER.height)) {
      // stay crouched
    } else c.crouch += (wantC - c.crouch) * Math.min(1, dt * 12);

    let wish = new THREE.Vector3();
    if (!frozen && c.moveSpeedMul > 0) {
      wish.copy(c.moveDir);
      let speed = c.maxSpeed() * c.moveSpeedMul;
      if (c.wantWalk) speed *= PLAYER.walkFactor;
      if (c.crouch > 0.5) speed *= PLAYER.crouchFactor / (c.wantWalk ? PLAYER.walkFactor : 1);
      wish.multiplyScalar(speed);
    }
    const wishSpeed = wish.length();
    const wishDir = wishSpeed > 0 ? wish.clone().divideScalar(wishSpeed) : wish;
    const v = c.velocity;
    if (c.onGround) {
      // Friction.
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0) {
        const drop = Math.max(sp, 2.0) * PLAYER.friction * dt;
        const ns = Math.max(0, sp - drop) / sp;
        v.x *= ns; v.z *= ns;
      }
      accelerate(v, wishDir, wishSpeed, PLAYER.accel, dt);
      if (c.wantJump && !frozen) {
        v.y = PLAYER.jumpVel;
        c.onGround = false;
        if (this.audio.ctx) this.audio.play('steps', { pos: c.isPlayer ? null : c.pos, volume: c.isPlayer ? 0.2 : 0.5 });
      }
    } else {
      accelerate(v, wishDir, Math.min(wishSpeed, 0.9), PLAYER.airAccel * 10, dt);
    }
    c.wantJump = false;
    v.y -= GRAVITY * dt;
    const wasGround = c.onGround;
    const fallV = v.y;
    const res = this.world.moveCylinder(c.pos, v, PLAYER.radius, c.height(), dt, PLAYER.stepHeight, c.onGround);
    c.onGround = res.onGround;
    if (!wasGround && c.onGround && fallV < -4) {
      if (this.audio.ctx) this.audio.play('land', { pos: c.isPlayer ? null : c.pos, volume: c.isPlayer ? 0.35 : 0.5 });
      if (c.isPlayer) { this.vm.onLand(-fallV); this.controller.landKick = Math.min(0.12, -fallV * 0.012); }
      if (fallV < -11) this.hurt(c, null, Math.round((-fallV - 11) * 9), { group: 'legs', dir: new THREE.Vector3(0, -1, 0), point: null, weapon: 'knife' });
    }
    // Footsteps.
    const hs = Math.hypot(v.x, v.z);
    if (c.onGround && hs > 0.5) {
      c.stepDist = (c.stepDist || 0) + hs * dt;
      if (c.stepDist > 2.3) {
        c.stepDist = 0;
        const loud = hs > c.maxSpeed() * 0.6 && !c.wantWalk && c.crouch < 0.5;
        if (loud && this.audio.ctx) {
          if (c.isPlayer) this.audio.play('steps', { volume: 0.13 });
          else {
            const occ = !this.world.lineClear(this.camera.position, c.pos.clone().setY(0.5), true);
            this.audio.play('steps', { pos: c.pos.clone().setY(0.1), volume: 0.9, occluded: occ, ref: 2, rolloff: 1.4 });
          }
        }
        if (loud) this.makeNoise(c, c.pos, 18);
      }
    }
    // Keep bots from stacking on each other.
    if (c.isBot) {
      for (const o of this.combatants) {
        if (o === c || !o.alive) continue;
        const dx = c.pos.x - o.pos.x, dz = c.pos.z - o.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (0.8 - d) * 0.5;
          c.pos.x += (dx / d) * push; c.pos.z += (dz / d) * push;
        }
      }
    }
  }

  // ---------------- frame ----------------

  frame() {
    const rawDt = Math.min(0.05, this.clock.getDelta());
    const dt = this.paused ? 0 : rawDt;
    if (this.player && this.phase !== 'menu') {
      if (!this.paused) this.update(dt);
      this.render(rawDt);
    } else if (this.menuCam) {
      this.menuOrbit(rawDt);
    }
  }

  menuOrbit(dt) {
    this.menuT = (this.menuT || 0) + dt * 0.04;
    const c = new THREE.Vector3((W * CELL) / 2, 0, (H * CELL) / 2);
    this.camera.position.set(c.x + Math.cos(this.menuT) * 70, 42, c.z + Math.sin(this.menuT) * 55);
    this.camera.lookAt(c.x, 0, c.z);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    this.time += dt;
    const now = this.time;
    this.controller.update(dt);
    for (const b of this.bots) b.brain.update(dt, now);
    for (const c of this.combatants) {
      if (!c.alive) continue;
      this.moveCombatant(c, dt);
      if (this.phase !== 'freeze' && this.phase !== 'matchover') this.updateWeapon(c, dt);
      else { c.trigger = false; }
    }
    for (const b of this.bots) {
      if (!b.body) continue;
      b.body.root.position.copy(b.pos);
      const sp = Math.hypot(b.velocity.x, b.velocity.z);
      const rdef = WEAPONS[b.weaponId()];
      const reloadT = b.reloading ? THREE.MathUtils.clamp(1 - (b.reloadEnd - now) / rdef.reload, 0, 1) : null;
      b.body.update(dt, sp, b.yaw + b.punch.y, b.pitch + b.punch.x, b.crouch > 0.5, !!(b.brain.target && now - b.brain.lastSeenT < 2), reloadT);
      if (b.heat > 0) {
        b.heat = Math.max(0, b.heat - dt);
        if (b.heat > 0.6 && Math.random() < dt * 8 && b.body.weapon) this.effects.barrelSmoke(b.body.muzzleWorld(), b.heat / 3);
      }
    }
    this.updateGrenades(dt);
    this.updateDrops(dt);
    this.effects.update(dt);

    // Phase transitions.
    if (this.phase === 'freeze' && now >= this.phaseEnd) this.goLive();
    else if (this.phase === 'live' && now >= this.phaseEnd) this.endRound(this.player.team === 'ct' || this.settings.mode === 'equipo' ? 'ct' : 'ct', 'Tiempo agotado');
    else if (this.phase === 'end' && now >= this.phaseEnd) {
      const need = this.settings.winsNeeded;
      if (this.score.ct >= need || this.score.t >= need) this.matchOver();
      else this.startRound();
    }
    this.hud.tick(this, dt);
  }

  matchOver() {
    this.phase = 'matchover';
    const win = this.score[this.player.team] > this.score[this.player.team === 'ct' ? 't' : 'ct'];
    this.hud.matchOver(this, win);
    this.controller.release();
  }

  render(dt) {
    const cam = this.camera;
    this.controller.updateCamera(dt);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.5);
      cam.rotation.x += (Math.random() - 0.5) * this.shake * 0.05;
      cam.rotation.y += (Math.random() - 0.5) * this.shake * 0.05;
    }
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    this.audio.updateListener(cam.position, fwd, up);
    if (this.player.alive && this.vm.smokeT > 0.8 && Math.random() < dt * 10) {
      this.effects.barrelSmoke(this.camera.localToWorld(this.vm.muzzleCameraSpace()), Math.min(1, this.vm.smokeT / 2.5));
    }
    const r = this.renderer;
    r.clear();
    if (window.__vmdbg) { r.render(this.vm.scene, window.__vmdbg); return; }
    r.render(this.scene, cam);
    if (this.controller.firstPerson && this.player.alive) {
      r.clearDepth();
      this.vm.camera.quaternion.copy(cam.quaternion);
      this.vm.camera.updateMatrixWorld(true);
      r.render(this.vm.scene, this.vm.camera);
    }
  }
}

function accelerate(v, wishDir, wishSpeed, accel, dt) {
  if (wishSpeed <= 0) return;
  const current = v.x * wishDir.x + v.z * wishDir.z;
  const add = wishSpeed - current;
  if (add <= 0) return;
  const a = Math.min(add, accel * dt * wishSpeed * 0.1 + accel * dt * 0.9);
  v.x += a * wishDir.x;
  v.z += a * wishDir.z;
}
