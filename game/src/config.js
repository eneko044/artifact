// Global tuning values and weapon definitions.
// Units: meters, seconds. CS "units" were converted at ~1 unit = 2.54 cm.

export const CELL = 2; // map grid cell size in meters
export const GRAVITY = 17.5;
export const PLAYER = {
  radius: 0.38,
  height: 1.8,
  crouchHeight: 1.25,
  eye: 1.64,
  crouchEye: 1.12,
  jumpVel: 5.35,
  accel: 42,
  airAccel: 7,
  friction: 7.5,
  stepHeight: 0.46,
  walkFactor: 0.52,
  crouchFactor: 0.34,
};

export const ECONOMY = {
  start: 800,
  max: 16000,
  winReward: 3250,
  lossBase: 1400,
  lossStep: 500,
  lossMax: 3400,
};

export const ROUND = {
  freeze: 6,
  length: 115,
  end: 5,
  buyWindow: 25,
};

export const DIFFICULTY = {
  facil: { label: 'Fácil', reaction: [0.55, 0.9], aimError: 0.62, aimSpeed: 3.2, burst: [2, 4], hsChance: 0.08, sprayCtrl: 0.25 },
  normal: { label: 'Normal', reaction: [0.34, 0.58], aimError: 0.4, aimSpeed: 5.2, burst: [3, 6], hsChance: 0.18, sprayCtrl: 0.5 },
  dificil: { label: 'Difícil', reaction: [0.22, 0.38], aimError: 0.25, aimSpeed: 7.5, burst: [4, 9], hsChance: 0.32, sprayCtrl: 0.72 },
  experto: { label: 'Experto', reaction: [0.14, 0.24], aimError: 0.14, aimSpeed: 11, burst: [6, 14], hsChance: 0.5, sprayCtrl: 0.9 },
};

// Hit group multipliers (CS:GO values).
export const HITGROUP = { head: 4, chest: 1, stomach: 1.25, legs: 0.75 };

/*
  model: { src, kind: 'fbx' | 'gltf' }
  view: position/rotation of the first-person viewmodel relative to the camera
  speed: max movement speed while holding (m/s)
  spread: base inaccuracy (radians) standing still; moveSpread added at full speed
  recoil: [vertical per shot (rad), horizontal amplitude (rad)]
*/
export const WEAPONS = {
  knife: {
    id: 'knife', name: 'Cuchillo', slot: 3, price: 0, team: 'both',
    damage: 40, damageAlt: 65, range: 1.9, rate: 0.42, rateAlt: 1.0, auto: true,
    mag: 0, reserve: 0, reload: 0, speed: 6.3, killReward: 1500,
    spread: 0, moveSpread: 0, recoil: [0, 0], armorPen: 0.85, falloff: 1,
    model: { src: 'assets/guns/Knife_1.fbx', kind: 'fbx', length: 0.3 },
    sound: 'knife',
  },
  usp: {
    id: 'usp', name: 'USP-S', slot: 2, price: 200, team: 'ct',
    damage: 35, rate: 0.17, auto: false, mag: 12, reserve: 24, reload: 2.2,
    speed: 6.1, killReward: 300, spread: 0.004, moveSpread: 0.03, jumpSpread: 0.12,
    recoil: [0.012, 0.004], armorPen: 0.505, falloff: 0.99,
    model: { src: 'assets/guns/Pistol_2.fbx', kind: 'fbx', length: 0.21 },
    sound: 'pistol', suppressed: true,
  },
  glock: {
    id: 'glock', name: 'Glock-18', slot: 2, price: 200, team: 't',
    damage: 30, rate: 0.15, auto: false, mag: 20, reserve: 120, reload: 2.2,
    speed: 6.1, killReward: 300, spread: 0.006, moveSpread: 0.032, jumpSpread: 0.12,
    recoil: [0.011, 0.005], armorPen: 0.47, falloff: 0.85,
    model: { src: 'assets/guns/Pistol_5.fbx', kind: 'fbx', length: 0.2 },
    sound: 'pistol',
  },
  deagle: {
    id: 'deagle', name: 'Desert Eagle', slot: 2, price: 700, team: 'both',
    damage: 63, rate: 0.26, auto: false, mag: 7, reserve: 35, reload: 2.2,
    speed: 5.9, killReward: 300, spread: 0.006, moveSpread: 0.06, jumpSpread: 0.18,
    recoil: [0.045, 0.012], armorPen: 0.93, falloff: 0.81,
    model: { src: 'assets/guns/Pistol_1.fbx', kind: 'fbx', length: 0.27 },
    sound: 'deagle',
  },
  mp9: {
    id: 'mp9', name: 'MP9', slot: 1, price: 1250, team: 'both',
    damage: 26, rate: 0.07, auto: true, mag: 30, reserve: 120, reload: 2.1,
    speed: 6.0, killReward: 600, spread: 0.008, moveSpread: 0.022, jumpSpread: 0.15,
    recoil: [0.011, 0.007], armorPen: 0.6, falloff: 0.87,
    model: { src: 'assets/guns/SubmachineGun_2.fbx', kind: 'fbx', length: 0.4 },
    sound: 'smg',
  },
  ak47: {
    id: 'ak47', name: 'AK-47', slot: 1, price: 2700, team: 'both',
    damage: 36, rate: 0.1, auto: true, mag: 30, reserve: 90, reload: 2.45,
    speed: 5.4, killReward: 300, spread: 0.0025, moveSpread: 0.07, jumpSpread: 0.2,
    recoil: [0.021, 0.011], armorPen: 0.775, falloff: 0.98,
    model: { src: 'assets/guns/AssaultRifle_2.fbx', kind: 'fbx', length: 0.82 },
    sound: 'ak',
  },
  m4a4: {
    id: 'm4a4', name: 'M4A4', slot: 1, price: 3100, team: 'both',
    damage: 33, rate: 0.09, auto: true, mag: 30, reserve: 90, reload: 3.1,
    speed: 5.5, killReward: 300, spread: 0.0022, moveSpread: 0.062, jumpSpread: 0.2,
    recoil: [0.018, 0.009], armorPen: 0.7, falloff: 0.97,
    model: { src: 'assets/guns/AssaultRifle2_1.fbx', kind: 'fbx', length: 0.84 },
    sound: 'm4',
  },
  awp: {
    id: 'awp', name: 'AWP', slot: 1, price: 4750, team: 'both',
    damage: 115, rate: 1.46, auto: false, mag: 5, reserve: 30, reload: 3.6,
    speed: 4.9, killReward: 100, spread: 0.0008, moveSpread: 0.16, jumpSpread: 0.3,
    unscopedSpread: 0.06, recoil: [0.06, 0.01], armorPen: 0.975, falloff: 0.99,
    scope: [40, 15], // zoomed FOV levels
    model: { src: 'assets/guns/SniperRifle_3.fbx', kind: 'fbx', length: 1.05 },
    sound: 'awp',
  },
  he: {
    id: 'he', name: 'Granada HE', slot: 4, price: 300, team: 'both', grenade: true,
    damage: 98, radius: 9, rate: 0.9, auto: false, mag: 1, reserve: 0, reload: 0,
    speed: 6.1, killReward: 300, spread: 0, moveSpread: 0, recoil: [0, 0],
    model: { src: 'assets/models/stick_grenade/stick_grenade.gltf', kind: 'gltf', length: 0.32 },
    sound: 'he',
  },
};

export const EQUIPMENT = {
  kevlar: { id: 'kevlar', name: 'Chaleco', price: 650 },
  kevlarHelmet: { id: 'kevlarHelmet', name: 'Chaleco + Casco', price: 1000 },
};

export const BUY_MENU = [
  { title: 'Pistolas', items: ['usp', 'glock', 'deagle'] },
  { title: 'Subfusiles', items: ['mp9'] },
  { title: 'Rifles', items: ['ak47', 'm4a4', 'awp'] },
  { title: 'Equipo', items: ['kevlar', 'kevlarHelmet', 'he'] },
];

export const BOT_NAMES = {
  t: ['Viktor', 'Dmitri', 'Karim', 'Zoran', 'Rashid', 'Anton', 'Boris'],
  ct: ['Marcus', 'Hawk', 'Reyes', 'Nolan', 'Duarte', 'Keller', 'Sato'],
};
