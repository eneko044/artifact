import { WEAPONS, EQUIPMENT, BUY_MENU, ROUND } from './config.js';
import { W, H } from './map.js';
import { CELL } from './config.js';
import * as THREE from 'three';

const $ = (s) => document.querySelector(s);
const TEAM_NAME = { ct: 'Antiterroristas', t: 'Terroristas' };
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Hud {
  constructor() {
    this.el = {
      hud: $('#hud'), hp: $('#hp'), hpBar: $('#hp-bar'), armor: $('#armor'), armorBar: $('#armor-bar'), helmet: $('#helmet'),
      money: $('#money'), mag: $('#mag'), reserve: $('#reserve'), wname: $('#wname'), slots: $('#slots'),
      timer: $('#timer'), scoreCT: $('#score-ct'), scoreT: $('#score-t'), aliveCT: $('#alive-ct'), aliveT: $('#alive-t'),
      phase: $('#phase'), feed: $('#killfeed'), center: $('#center-msg'), banner: $('#banner'), cross: $('#crosshair'),
      hit: $('#hitmarker'), dmg: $('#dmg'), vignette: $('#vignette'), death: $('#death'), spec: $('#spectate'),
      pickup: $('#pickup'), toast: $('#toast'), scope: $('#scope'), board: $('#scoreboard'), buy: $('#buy'),
      pause: $('#pause'), over: $('#matchover'), radar: $('#radar'), buyTime: $('#buy-time'), moneyDelta: $('#money-delta'),
    };
    this.feedItems = [];
    this.centerT = 0;
    this.bannerT = 0;
    this.hitT = 0;
    this.toastT = 0;
    this.lastMoney = null;
    this.spread = 0;
  }

  setTeams(game) {
    document.body.dataset.team = game.player.team;
  }

  buildRadar(map) {
    const s = 6; // px per cell
    const c = document.createElement('canvas');
    c.width = W * s; c.height = H * s;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1b1712';
    ctx.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = map.grid[y * W + x];
      if (v === 1) continue;
      ctx.fillStyle = v === 2 ? '#7d6a4c' : '#b59d74';
      ctx.fillRect(x * s, y * s, s, s);
    }
    ctx.fillStyle = 'rgba(214,72,52,0.35)';
    for (const [k, [x0, y0, x1, y1]] of Object.entries(map.sites)) {
      ctx.fillRect(x0 * s, y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
      ctx.fillStyle = '#f3e7cf';
      ctx.font = 'bold 28px "Saira Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(k, ((x0 + x1 + 1) / 2) * s, ((y0 + y1 + 1) / 2) * s);
      ctx.fillStyle = 'rgba(214,72,52,0.35)';
    }
    this.radarMap = c;
    this.radarScale = s / CELL; // px per meter
  }

  drawRadar(game) {
    const cv = this.el.radar;
    const ctx = cv.getContext('2d');
    const size = cv.width;
    const p = game.player.alive ? game.player : (game.controller.spectating || game.player);
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#12100d';
    ctx.fillRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);
    ctx.rotate(p.yaw);
    const ppm = this.radarMap.width / (W * CELL);
    const zoom = size / 56 / ppm; // ~56 m across
    ctx.scale(zoom, zoom);
    ctx.translate(-p.pos.x * ppm, -p.pos.z * ppm);
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this.radarMap, 0, 0);
    ctx.globalAlpha = 1;
    for (const c of game.combatants) {
      if (c === p) continue;
      const friendly = c.team === game.player.team;
      const visible = friendly || game.time < c.spottedUntil;
      if (!visible) continue;
      const x = c.pos.x * ppm, y = c.pos.z * ppm;
      if (!c.alive) {
        ctx.strokeStyle = friendly ? '#6fa0e8' : '#e5484d';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
        continue;
      }
      ctx.fillStyle = friendly ? (c.team === 'ct' ? '#6fa0e8' : '#e0a43a') : '#e5484d';
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
    // Player arrow and view cone.
    ctx.save();
    ctx.translate(size / 2, size / 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.4);
    g.addColorStop(0, 'rgba(255,245,220,0.22)'); g.addColorStop(1, 'rgba(255,245,220,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, size * 0.4, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f5ecd9';
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  refreshAll(game) {
    const p = game.player;
    const e = this.el;
    e.hp.textContent = Math.max(0, p.hp);
    e.hpBar.style.transform = `scaleX(${Math.max(0, p.hp) / 100})`;
    e.hp.parentElement.parentElement.classList.toggle('low', p.hp <= 25);
    e.armor.textContent = p.armor;
    e.armorBar.style.transform = `scaleX(${p.armor / 100})`;
    e.helmet.hidden = !p.helmet;
    if (this.lastMoney !== null && p.money !== this.lastMoney) {
      const d = p.money - this.lastMoney;
      e.moneyDelta.textContent = `${d > 0 ? '+' : '−'}$${Math.abs(d)}`;
      e.moneyDelta.className = d > 0 ? 'up show' : 'down show';
      clearTimeout(this.mdT);
      this.mdT = setTimeout(() => { e.moneyDelta.className = ''; }, 1600);
    }
    this.lastMoney = p.money;
    e.money.textContent = `$${p.money}`;
    const id = p.weaponId();
    const def = WEAPONS[id];
    const ws = p.current();
    e.wname.textContent = def.name;
    if (def.mag) {
      e.mag.textContent = ws.mag;
      e.reserve.textContent = ws.reserve;
      e.mag.parentElement.hidden = false;
      e.mag.classList.toggle('low', ws.mag <= Math.ceil(def.mag * 0.2));
    } else {
      e.mag.parentElement.hidden = def.grenade ? false : true;
      if (def.grenade) { e.mag.textContent = p.slots[4]; e.reserve.textContent = '0'; }
    }
    const rows = [];
    for (const s of [1, 2, 3, 4]) {
      const has = s === 3 || (s === 4 ? p.slots[4] : p.slots[s]);
      if (!has) continue;
      const wid = s === 4 ? 'he' : p.slots[s].id;
      rows.push(`<li class="${p.slot === s ? 'on' : ''}"><kbd>${s}</kbd><span>${WEAPONS[wid].name}</span></li>`);
    }
    e.slots.innerHTML = rows.join('');
    e.scoreCT.textContent = game.score.ct;
    e.scoreT.textContent = game.score.t;
    const pips = (team) => game.combatants.filter((c) => c.team === team)
      .map((c) => `<i class="${c.alive ? '' : 'dead'} ${c.isPlayer ? 'me' : ''}"></i>`).join('');
    e.aliveCT.innerHTML = pips('ct');
    e.aliveT.innerHTML = pips('t');
    if (!this.el.board.hidden) this.renderBoard(game);
    if (!this.el.buy.hidden) this.renderBuy(game);
  }

  tick(game, dt) {
    const e = this.el;
    const now = game.time;
    let t = game.phaseEnd - now;
    e.timer.textContent = fmtTime(t);
    e.timer.classList.toggle('urgent', game.phase === 'live' && t < 15);
    e.phase.textContent = game.phase === 'freeze' ? 'Tiempo de compra' : game.phase === 'end' ? 'Fin de ronda' : `Ronda ${game.round}`;
    const buyLeft = game.phase === 'freeze' ? t + ROUND.buyWindow : game.roundStart + ROUND.buyWindow - now;
    const canBuy = game.canBuy(game.player);
    e.buyTime.hidden = !canBuy;
    if (canBuy) e.buyTime.textContent = `[B] Comprar · ${Math.ceil(buyLeft)} s`;
    if (!e.buy.hidden && !canBuy) game.controller.toggleBuy(false);

    // Crosshair gap follows current inaccuracy.
    const p = game.player;
    if (p.alive) {
      const def = WEAPONS[p.weaponId()];
      const target = def.mag ? game.inaccuracy(p, def) : 0;
      this.spread += (target - this.spread) * Math.min(1, dt * 14);
      const px = (this.spread / Math.tan((game.camera.fov * Math.PI) / 360)) * (innerHeight / 2);
      e.cross.style.setProperty('--gap', `${Math.min(60, 4 + px)}px`);
      e.cross.hidden = def.id === 'awp' || !game.controller.firstPerson;
    } else e.cross.hidden = true;

    this.hitT = Math.max(0, this.hitT - dt);
    e.hit.style.opacity = this.hitT > 0 ? Math.min(1, this.hitT / 0.12) : 0;
    this.centerT -= dt;
    if (this.centerT <= 0) e.center.classList.remove('show');
    this.bannerT -= dt;
    if (this.bannerT <= 0) e.banner.classList.remove('show');
    this.toastT -= dt;
    if (this.toastT <= 0) e.toast.classList.remove('show');
    // Low health pulse.
    e.vignette.style.opacity = p.alive ? Math.max(0, (40 - p.hp) / 40) * 0.8 : 0;
    // Kill feed expiry.
    this.feedItems = this.feedItems.filter((it) => {
      it.t -= dt;
      if (it.t <= 0) { it.el.remove(); return false; }
      return true;
    });
    this.drawTags(game);
    this.radarT = (this.radarT || 0) - dt;
    if (this.radarT <= 0) { this.radarT = 1 / 30; this.drawRadar(game); }
    if (!e.board.hidden) { this.boardT = (this.boardT || 0) - dt; if (this.boardT <= 0) { this.boardT = 0.5; this.renderBoard(game); } }
    for (const d of [...e.dmg.children]) {
      const life = (+d.dataset.t || 0) - dt;
      d.dataset.t = life;
      d.style.opacity = Math.max(0, life / 1.2);
      if (life <= 0) d.remove();
    }
  }

  // Teammate names over their heads, like the real thing.
  drawTags(game) {
    const root = this.tagsEl || (this.tagsEl = document.querySelector('#tags'));
    this.tagPool = this.tagPool || [];
    const cam = game.camera;
    const v = new THREE.Vector3();
    let n = 0;
    for (const c of game.combatants) {
      if (!c.alive || c.isPlayer || c.team !== game.player.team || c === game.controller.spectating) continue;
      c.headPos(v).y += 0.35;
      const d = v.distanceTo(cam.position);
      if (d > 45) continue;
      v.project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
      let el = this.tagPool[n];
      if (!el) { el = document.createElement('div'); root.appendChild(el); this.tagPool.push(el); }
      el.className = `tag ${c.team}`;
      el.textContent = c.name;
      el.hidden = false;
      el.style.opacity = d > 30 ? String(1 - (d - 30) / 15) : '1';
      el.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
      n++;
    }
    for (let i = n; i < this.tagPool.length; i++) this.tagPool[i].hidden = true;
  }

  hitmarker(head, kill) {
    this.hitT = kill ? 0.45 : 0.22;
    this.el.hit.className = kill ? 'kill' : head ? 'head' : '';
  }

  damageFrom(angle, amount) {
    const d = document.createElement('div');
    d.className = 'dmg-arc';
    d.style.transform = `rotate(${-angle}rad)`;
    d.dataset.t = 1.2;
    d.style.setProperty('--w', Math.min(1, 0.4 + amount / 60));
    this.el.dmg.appendChild(d);
    this.el.hud.classList.remove('hurt');
    void this.el.hud.offsetWidth;
    this.el.hud.classList.add('hurt');
  }

  killfeed(attacker, victim, weapon, headshot, player) {
    const div = document.createElement('div');
    const involved = attacker === player || victim === player;
    div.className = `kf ${involved ? 'me' : ''}`;
    const name = (c) => c ? `<b class="${c.team}">${esc(c.name)}</b>` : '';
    const w = WEAPONS[weapon]?.name || '';
    div.innerHTML = `${attacker && attacker !== victim ? name(attacker) : ''}<span class="kf-w">${esc(w)}</span>${headshot ? '<span class="kf-hs" title="Tiro a la cabeza"></span>' : ''}${name(victim)}`;
    this.el.feed.prepend(div);
    this.feedItems.push({ el: div, t: 6 });
    if (this.feedItems.length > 6) { const old = this.feedItems.shift(); old.el.remove(); }
  }

  centerMessage(text, dur = 2) {
    this.el.center.textContent = text;
    this.el.center.classList.add('show');
    this.centerT = dur;
  }

  roundBanner(title, sub) {
    this.el.banner.innerHTML = `<h2>${esc(title)}</h2><p>${esc(sub)}</p>`;
    this.el.banner.className = 'show';
    this.bannerT = 3;
  }

  roundEnd(winner, title, reason, mvp) {
    this.el.banner.innerHTML = `<h2>${esc(title)}</h2><p>${esc(reason)}</p>${mvp ? `<p class="mvp">${esc(mvp)}</p>` : ''}`;
    this.el.banner.className = `show win-${winner}`;
    this.bannerT = ROUND.end - 0.3;
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastT = 3.2;
  }

  pickupHint(name) {
    this.el.pickup.hidden = !name;
    if (name) this.el.pickup.innerHTML = `<kbd>E</kbd> Recoger ${esc(name)}`;
  }

  scope(on) {
    this.el.scope.hidden = !on;
  }

  showDeath(info) {
    const e = this.el.death;
    if (!info) { e.hidden = true; this.el.spec.hidden = true; return; }
    const { killer, weapon, headshot, player } = info;
    const k = killer && killer !== player ? killer : null;
    e.innerHTML = k
      ? `<small>Te ha eliminado</small><strong class="${k.team}">${esc(k.name)}</strong><span>${esc(WEAPONS[weapon]?.name || '')}${headshot ? ' · tiro a la cabeza' : ''} · le quedan ${Math.max(0, k.hp)} HP</span>`
      : '<small>Has muerto</small>';
    e.hidden = false;
  }

  spectating(c) {
    this.el.spec.hidden = !c;
    if (c) this.el.spec.innerHTML = `Observando a <b class="${c.team}">${esc(c.name)}</b> · clic para cambiar`;
  }

  showScoreboard(on, game) {
    this.el.board.hidden = !on;
    if (on) this.renderBoard(game);
  }

  renderBoard(game) {
    const team = (t) => {
      const list = game.combatants.filter((c) => c.team === t).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const rows = list.map((c) => `<tr class="${c.alive ? '' : 'dead'} ${c.isPlayer ? 'me' : ''}">
        <td class="n">${esc(c.name)}${c.isBot ? ' <em>BOT</em>' : ''}</td>
        <td>$${c.money}</td><td>${c.kills}</td><td>${c.assists}</td><td>${c.deaths}</td>
        <td>${c.kills ? Math.round((c.headshots / c.kills) * 100) : 0}%</td><td>${c.damageDealt}</td><td>${c.mvps ? '★' + c.mvps : ''}</td></tr>`).join('');
      return `<section class="sb-team ${t}"><header><span>${TEAM_NAME[t]}</span><b>${game.score[t]}</b></header>
        <table><thead><tr><th class="n">Jugador</th><th>Dinero</th><th>K</th><th>A</th><th>M</th><th>HS</th><th>Daño</th><th>MVP</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    };
    const hist = game.roundHistory.map((r) => `<i class="${r.winner}" title="${esc(r.reason)}"></i>`).join('');
    this.el.board.innerHTML = `<div class="sb-inner"><div class="sb-head"><h3>Sector Polvo</h3><span>Primero a ${game.settings.winsNeeded} rondas</span><div class="sb-hist">${hist}</div></div>${team('ct')}${team('t')}</div>`;
  }

  showBuy(on, game) {
    this.el.buy.hidden = !on;
    if (on) this.renderBuy(game);
  }

  buyList(game) {
    const list = [];
    for (const cat of BUY_MENU) for (const id of cat.items) {
      const w = WEAPONS[id];
      if (w && w.team !== 'both' && w.team !== game.player.team) continue;
      list.push(id);
    }
    return list;
  }

  renderBuy(game) {
    const p = game.player;
    const flat = this.buyList(game);
    const cats = BUY_MENU.map((cat) => {
      const items = cat.items.filter((id) => flat.includes(id)).map((id) => {
        const w = WEAPONS[id] || EQUIPMENT[id];
        const idx = flat.indexOf(id) + 1;
        const owned = (WEAPONS[id] && !WEAPONS[id].grenade && p.slots[WEAPONS[id].slot]?.id === id) || (id === 'he' && p.slots[4]) || (id === 'kevlar' && p.armor >= 100) || (id === 'kevlarHelmet' && p.helmet && p.armor >= 100);
        const price = id === 'kevlarHelmet' && p.armor >= 100 && !p.helmet ? 350 : w.price;
        const afford = p.money >= price;
        const stats = WEAPONS[id] && !WEAPONS[id].grenade && WEAPONS[id].mag ? `<span class="st">${WEAPONS[id].damage} daño · ${Math.round(60 / WEAPONS[id].rate)} dpm · ${WEAPONS[id].mag}/${WEAPONS[id].reserve}</span>` : '';
        return `<button class="bi ${owned ? 'owned' : ''} ${afford ? '' : 'poor'}" data-id="${id}" ${owned ? 'disabled' : ''}>
          <kbd>${idx}</kbd><span class="nm">${w.name}</span>${stats}<span class="pr">$${price}</span></button>`;
      }).join('');
      return items ? `<div class="bcat"><h4>${cat.title}</h4>${items}</div>` : '';
    }).join('');
    this.el.buy.innerHTML = `<div class="buy-inner"><header><h3>Arsenal</h3><span class="bm">$${p.money}</span><span class="bh">Pulsa el número o haz clic · <kbd>B</kbd> cerrar</span></header><div class="bgrid">${cats}</div></div>`;
    this.el.buy.querySelectorAll('.bi').forEach((b) => b.addEventListener('click', () => { if (game.buy(p, b.dataset.id)) this.renderBuy(game); }));
  }

  buyByIndex(i, game) {
    const id = this.buyList(game)[i];
    if (id && game.buy(game.player, id)) this.renderBuy(game);
  }

  showPause(on) { this.el.pause.hidden = !on; }

  matchOver(game, win) {
    const p = game.player;
    const e = this.el.over;
    e.innerHTML = `<div class="mo-inner">
      <small>Fin del partido</small>
      <h2>${win ? 'Victoria' : 'Derrota'}</h2>
      <p class="mo-score"><span class="ct">${game.score.ct}</span> – <span class="t">${game.score.t}</span></p>
      <dl><div><dt>Bajas</dt><dd>${p.kills}</dd></div><div><dt>Muertes</dt><dd>${p.deaths}</dd></div><div><dt>Asistencias</dt><dd>${p.assists}</dd></div>
      <div><dt>Tiros a la cabeza</dt><dd>${p.kills ? Math.round((p.headshots / p.kills) * 100) : 0}%</dd></div><div><dt>Daño</dt><dd>${p.damageDealt}</dd></div><div><dt>MVP</dt><dd>${p.mvps}</dd></div></dl>
      <div class="mo-actions"><button id="again" class="btn primary">Jugar otra vez</button><button id="tomenu" class="btn">Menú principal</button></div></div>`;
    e.hidden = false;
  }
}
