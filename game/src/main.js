import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { Game } from './game.js';
import { Hud } from './hud.js';

const DEFAULTS = {
  name: 'Tú', team: 'ct', mode: 'equipo', enemies: 5, difficulty: 'normal', winsNeeded: 8,
  sens: 1.0, fov: 74, volume: 0.8, quality: 'alta', invertY: false,
};

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('sector-polvo-settings') || '{}');
    return { ...DEFAULTS, ...s };
  } catch { return { ...DEFAULTS }; }
}
function saveSettings(s) {
  try { localStorage.setItem('sector-polvo-settings', JSON.stringify(s)); } catch { /* storage unavailable */ }
}

const settings = loadSettings();
const $ = (s) => document.querySelector(s);
const hud = new Hud();
const game = new Game($('#view'), hud, settings);
window.__game = game;
window.__THREE = THREE;
window.__cfg = (id) => WEAPONS[id];

// ---- menu bindings ----
function bindSegmented(id, key, parse = (v) => v) {
  const el = $(id);
  const sync = () => el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(parse(b.dataset.v) === settings[key])));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings[key] = parse(b.dataset.v);
    sync();
    saveSettings(settings);
    onSettingsChanged();
  });
  sync();
}
bindSegmented('#opt-team', 'team');
bindSegmented('#opt-mode', 'mode');
bindSegmented('#opt-diff', 'difficulty');
bindSegmented('#opt-rounds', 'winsNeeded', Number);
bindSegmented('#opt-quality', 'quality');

function bindRange(id, key, fmt) {
  for (const el of document.querySelectorAll(`[data-range="${key}"]`)) {
    const out = el.parentElement.querySelector('output');
    el.value = settings[key];
    if (out) out.textContent = fmt(settings[key]);
    el.addEventListener('input', () => {
      settings[key] = parseFloat(el.value);
      document.querySelectorAll(`[data-range="${key}"]`).forEach((o) => { o.value = el.value; const oo = o.parentElement.querySelector('output'); if (oo) oo.textContent = fmt(settings[key]); });
      saveSettings(settings);
      onSettingsChanged();
    });
  }
}
bindRange(null, 'sens', (v) => v.toFixed(2));
bindRange(null, 'fov', (v) => `${Math.round(v)}°`);
bindRange(null, 'volume', (v) => `${Math.round(v * 100)}%`);
bindRange(null, 'enemies', (v) => `${v}`);

const nameInput = $('#opt-name');
nameInput.value = settings.name;
nameInput.addEventListener('input', () => { settings.name = nameInput.value.trim().slice(0, 16) || 'Tú'; saveSettings(settings); });

function onSettingsChanged() {
  $('#enemies-row').hidden = settings.mode !== 'solo';
  if (game.audio) game.audio.setVolume(settings.volume);
  if (game.camera && !(game.player?.scope)) { game.camera.fov = settings.fov; game.camera.updateProjectionMatrix(); game.resize(); }
  if (game.renderer) applyQuality();
}

let appliedQuality = null;
function applyQuality() {
  if (appliedQuality === settings.quality) return;
  appliedQuality = settings.quality;
  const q = settings.quality;
  game.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'alta' ? 1.5 : q === 'media' ? 1.15 : 0.85));
  const sm = q === 'alta' ? 4096 : q === 'media' ? 2048 : 1024;
  if (game.sun && game.sun.shadow.mapSize.x !== sm) {
    game.sun.shadow.mapSize.set(sm, sm);
    game.sun.shadow.map?.dispose();
    game.sun.shadow.map = null;
  }
  game.resize();
}

const playBtn = $('#play');
const bar = $('#load-bar');
const loadLabel = $('#load-label');

if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) {
  $('#touch-note').hidden = false;
}

game.init((p) => {
  bar.style.transform = `scaleX(${p})`;
  loadLabel.textContent = `Cargando modelos y texturas · ${Math.round(p * 100)}%`;
}).then(() => {
  appliedQuality = settings.quality;
  game.menuCam = true;
  loadLabel.textContent = 'Listo';
  $('#loader').classList.add('done');
  playBtn.disabled = false;
  onSettingsChanged();
}).catch((err) => {
  console.error(err);
  loadLabel.textContent = 'No se pudieron cargar los recursos. Recarga la página para intentarlo de nuevo.';
});

function startMatch() {
  game.audio.init();
  game.audio.setVolume(settings.volume);
  $('#menu').hidden = true;
  $('#matchover').hidden = true;
  $('#hud').hidden = false;
  document.body.classList.add('playing');
  game.menuCam = false;
  game.newMatch({ ...settings });
  game.paused = false;
  game.controller.lock();
}

playBtn.addEventListener('click', startMatch);

$('#resume').addEventListener('click', () => {
  game.controller.lock();
  if (game.controller.noLock) { game.paused = false; hud.showPause(false); }
});
$('#quit').addEventListener('click', toMenu);

document.addEventListener('click', (e) => {
  if (e.target.id === 'again') startMatch();
  if (e.target.id === 'tomenu') toMenu();
});

function toMenu() {
  game.phase = 'menu';
  game.paused = true;
  game.menuCam = true;
  game.controller.release();
  hud.showPause(false);
  $('#matchover').hidden = true;
  $('#hud').hidden = true;
  $('#menu').hidden = false;
  document.body.classList.remove('playing');
  for (const c of game.combatants) if (c.body) game.scene.remove(c.body.root);
  for (const d of game.drops) game.scene.remove(d.mesh);
  for (const g of game.grenades) game.scene.remove(g.mesh);
  game.drops = []; game.grenades = [];
}
