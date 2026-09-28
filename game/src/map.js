import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL } from './config.js';

// The map is authored on a grid of 2 m cells. Everything starts solid and open
// areas are carved out, which guarantees closed borders and gives the bots a
// navigation grid for free.
export const W = 60;
export const H = 44;

const CARVE = [
  // name, x0, y0, x1, y1 (inclusive, in cells)
  ['CT spawn', 22, 2, 37, 9],
  ['B site', 2, 2, 17, 13],
  ['CT → B', 17, 4, 22, 7],
  ['A site', 41, 2, 57, 13],
  ['CT → A', 37, 4, 41, 7],
  ['Mid', 27, 9, 32, 33],
  ['Short', 33, 18, 42, 20],
  ['Short stairs', 41, 13, 43, 20],
  ['Long A', 50, 14, 56, 33],
  ['T spawn', 16, 34, 44, 42],
  ['T → long', 44, 32, 56, 35],
  ['B tunnels', 4, 14, 8, 30],
  ['T → tunnels', 4, 31, 16, 35],
  ['Lower tunnel', 9, 22, 26, 23],
];

// Pieces put back after carving, to shape chokepoints.
const REFILL = [
  [27, 13, 28, 14], // mid doors (CT side), gap on the left-centre
  [31, 13, 32, 14],
  [27, 26, 30, 27], // lower mid wall, gap on the right: breaks the spawn-to-spawn sightline
  [27, 20, 27, 21], // mid pillars
  [32, 22, 32, 23],
  [50, 24, 52, 25], // long doors
  [9, 12, 11, 13], // B site pillar
  [22, 2, 23, 3], // CT spawn corners
  [36, 2, 37, 3],
  [16, 41, 18, 42], // T spawn corners
  [42, 41, 44, 42],
];

// Paved floors (visual only).
const PAVED = [
  [22, 2, 37, 9], [27, 9, 32, 33], [16, 34, 44, 42],
];
const SITES = { A: [44, 3, 54, 10], B: [4, 3, 14, 10] };

// Props: type, cell x, cell y, rotation (quarter turns)
const PROPS = [
  // B site
  ['stack', 7, 6], ['crate', 8, 6], ['crate', 7, 7], ['crate', 12, 9], ['barrels', 15, 11],
  ['car', 3, 11, 1], ['crate', 16, 3], ['barrier', 13, 5, 1],
  // A site
  ['stack', 47, 6], ['crate', 48, 6], ['crate', 47, 7], ['stack', 56, 3], ['crate', 55, 3],
  ['barrier', 43, 10], ['barrier', 44, 10], ['barrels', 42, 3], ['crate', 52, 11],
  // CT spawn
  ['car', 25, 2, 1], ['barrels', 35, 8],
  // Mid
  ['crate', 28, 24], ['barrels', 32, 16], ['crate', 27, 30],
  // Short
  ['crate', 36, 18], ['barrels', 42, 19],
  // Long
  ['stack', 56, 17], ['crate', 55, 17], ['barrels', 50, 30], ['barrier', 54, 21, 1],
  ['crate', 56, 29],
  // T spawn
  ['stack', 19, 36], ['crate', 19, 37], ['crate', 41, 36], ['car', 22, 41, 1], ['barrels', 36, 39],
  ['crate', 25, 36],
  // Tunnels
  ['barrels', 4, 18], ['crate', 8, 26], ['crate', 18, 22], ['barrels', 13, 34],
];

export const SPAWNS = {
  ct: [[27, 5], [29, 6], [31, 5], [33, 6], [28, 7], [32, 7], [30, 4]],
  t: [[26, 39], [28, 38], [30, 39], [32, 38], [34, 39], [29, 40], [31, 40]],
};

// Bot tactical data (cells).
export const ROUTES = {
  A: [
    [[40, 34], [53, 33], [53, 22], [52, 12], [49, 8]], // long
    [[30, 31], [30, 21], [37, 19], [42, 15], [46, 9]], // short via mid
  ],
  B: [
    [[12, 33], [6, 24], [6, 14], [8, 8]], // tunnels
    [[30, 31], [29, 25], [18, 22], [6, 18], [10, 8]], // mid → lower tunnel
  ],
};
export const HOLDS = {
  A: [[46, 4], [51, 8], [45, 11], [55, 12], [49, 4]],
  B: [[10, 4], [14, 8], [5, 9], [13, 12]],
  mid: [[29, 11], [30, 10]],
};

export class GameMap {
  constructor(assets, scene) {
    this.assets = assets;
    this.scene = scene;
    this.grid = new Uint8Array(W * H).fill(1); // 1 solid, 0 open, 2 prop
    this.colliders = []; // {min: Vector3, max: Vector3, mat: 'stone'|'wood'|'metal'|'concrete'}
    this.group = new THREE.Group();
    scene.add(this.group);
    this.sites = SITES;
    this.rng = mulberry32(1337);
  }

  idx(x, y) { return y * W + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  solid(x, y) { return !this.inside(x, y) || this.grid[this.idx(x, y)] === 1; }
  walkable(x, y) { return this.inside(x, y) && this.grid[this.idx(x, y)] === 0; }
  cellCenter(x, y, out = new THREE.Vector3()) { return out.set((x + 0.5) * CELL, 0, (y + 0.5) * CELL); }
  toCell(v) { return [Math.floor(v.x / CELL), Math.floor(v.z / CELL)]; }

  build() {
    for (const [, x0, y0, x1, y1] of CARVE) this.fill(x0, y0, x1, y1, 0);
    for (const [x0, y0, x1, y1] of REFILL) this.fill(x0, y0, x1, y1, 1);
    this.buildGround();
    this.buildWalls();
    this.buildProps();
    this.buildSiteMarks();
    this.buildDecor();
  }

  fill(x0, y0, x1, y1, v) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.inside(x, y)) this.grid[this.idx(x, y)] = v;
  }

  // ---------- ground ----------
  buildGround() {
    const size = 260;
    const g = new THREE.PlaneGeometry(size, size, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate((W * CELL) / 2, 0, (H * CELL) / 2);
    planarUV(g, this.assets.textures.gravel.scale);
    const ground = new THREE.Mesh(g, this.assets.materials.gravel);
    ground.receiveShadow = true;
    this.group.add(ground);

    const pav = [];
    for (const [x0, y0, x1, y1] of PAVED) {
      const w = (x1 - x0 + 1) * CELL, d = (y1 - y0 + 1) * CELL;
      const p = new THREE.PlaneGeometry(w, d);
      p.rotateX(-Math.PI / 2);
      p.translate(x0 * CELL + w / 2, 0.012, y0 * CELL + d / 2);
      pav.push(p);
    }
    const pg = mergeGeometries(pav);
    planarUV(pg, this.assets.textures.paving.scale);
    const paved = new THREE.Mesh(pg, this.assets.materials.paving);
    paved.receiveShadow = true;
    this.group.add(paved);

    // Bomb site pads, slightly darker concrete with painted borders.
    for (const [key, [x0, y0, x1, y1]] of Object.entries(SITES)) {
      const w = (x1 - x0 + 1) * CELL, d = (y1 - y0 + 1) * CELL;
      const p = new THREE.PlaneGeometry(w, d);
      p.rotateX(-Math.PI / 2);
      p.translate(x0 * CELL + w / 2, 0.02, y0 * CELL + d / 2);
      planarUV(p, this.assets.textures.concrete.scale);
      const m = new THREE.Mesh(p, this.assets.materials.concrete);
      m.receiveShadow = true;
      this.group.add(m);
      const border = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: siteBorderTexture(key), transparent: true, depthWrite: false, opacity: 0.85 }),
      );
      border.position.set(x0 * CELL + w / 2, 0.03, y0 * CELL + d / 2);
      this.group.add(border);
    }
  }

  // ---------- walls ----------
  buildWalls() {
    const boxes = greedyBoxes(this.grid, W, H, 1);
    const byMat = { sandstone: [], plaster: [], clay: [], brick: [], worn: [] };
    const trims = [];
    const bases = [];
    const shutters = [];
    const lintels = [];
    const mats = ['sandstone', 'plaster', 'clay', 'brick', 'worn'];
    const rng = this.rng;
    for (const b of boxes) {
      const border = b.x0 === 0 || b.y0 === 0 || b.x1 === W - 1 || b.y1 === H - 1;
      const h = border ? 11 + rng() * 3 : 5.5 + Math.floor(rng() * 5) * 0.9;
      const x = b.x0 * CELL, z = b.y0 * CELL;
      const w = (b.x1 - b.x0 + 1) * CELL, d = (b.y1 - b.y0 + 1) * CELL;
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x + w / 2, h / 2, z + d / 2);
      const key = border ? 'sandstone' : mats[Math.floor(rng() * mats.length)];
      byMat[key].push(g);
      this.colliders.push({ min: new THREE.Vector3(x, 0, z), max: new THREE.Vector3(x + w, h, z + d), mat: 'stone', wall: true });

      // Cornice and skirting give the blocks a built, weathered silhouette.
      const t = new THREE.BoxGeometry(w + 0.3, 0.32, d + 0.3);
      t.translate(x + w / 2, h + 0.1, z + d / 2);
      trims.push(t);
      const s = new THREE.BoxGeometry(w + 0.12, 0.55, d + 0.12);
      s.translate(x + w / 2, 0.275, z + d / 2);
      bases.push(s);

      // Shuttered windows and doors on faces that look onto open ground.
      if (h > 6.5 && !border) this.decorateFaces(b, h, shutters, lintels);
    }
    for (const [key, list] of Object.entries(byMat)) {
      if (!list.length) continue;
      const g = mergeGeometries(list);
      planarUV(g, this.assets.textures[key].scale);
      const m = new THREE.Mesh(g, this.assets.materials[key]);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
    const tg = mergeGeometries(trims.concat(bases));
    planarUV(tg, this.assets.textures.concrete.scale);
    const trim = new THREE.Mesh(tg, this.assets.materials.concrete);
    trim.castShadow = true;
    trim.receiveShadow = true;
    this.group.add(trim);
    if (shutters.length) {
      const sg = mergeGeometries(shutters);
      const sm = new THREE.Mesh(sg, this.assets.materials.planks);
      sm.castShadow = true;
      sm.receiveShadow = true;
      this.group.add(sm);
    }
    if (lintels.length) {
      const lg = mergeGeometries(lintels);
      planarUV(lg, 1.2);
      const lm = new THREE.Mesh(lg, this.assets.materials.metal);
      lm.castShadow = true;
      this.group.add(lm);
    }
  }

  decorateFaces(b, h, shutters, lintels) {
    const rng = this.rng;
    const faces = [
      // [axis, fixed coord (world), from, to (cells), outward sign, test fn]
      ['z', b.y0 * CELL, b.x0, b.x1, -1, (c) => this.walkable(c, b.y0 - 1)],
      ['z', (b.y1 + 1) * CELL, b.x0, b.x1, 1, (c) => this.walkable(c, b.y1 + 1)],
      ['x', b.x0 * CELL, b.y0, b.y1, -1, (c) => this.walkable(b.x0 - 1, c)],
      ['x', (b.x1 + 1) * CELL, b.y0, b.y1, 1, (c) => this.walkable(b.x1 + 1, c)],
    ];
    for (const [axis, fixed, from, to, sign, open] of faces) {
      for (let c = from + 1; c < to; c += 3) {
        if (!open(c)) continue;
        if (rng() < 0.35) continue;
        const along = (c + 0.5) * CELL;
        const isDoor = rng() < 0.22;
        const ww = isDoor ? 1.5 : 1.1, hh = isDoor ? 2.5 : 1.5;
        const cy = isDoor ? hh / 2 + 0.02 : h - 2.3;
        const panel = new THREE.PlaneGeometry(ww, hh);
        const lintel = new THREE.BoxGeometry(ww + 0.35, 0.16, 0.22);
        if (axis === 'z') {
          if (sign < 0) panel.rotateY(Math.PI);
          panel.translate(along, cy, fixed + sign * 0.03);
          lintel.translate(along, cy + hh / 2 + 0.08, fixed + sign * 0.1);
        } else {
          panel.rotateY(sign > 0 ? Math.PI / 2 : -Math.PI / 2);
          panel.translate(fixed + sign * 0.03, cy, along);
          lintel.rotateY(Math.PI / 2);
          lintel.translate(fixed + sign * 0.1, cy + hh / 2 + 0.08, along);
        }
        shutters.push(panel);
        lintels.push(lintel);
      }
    }
  }

  // ---------- props ----------
  buildProps() {
    const A = this.assets;
    const crateMat = this.crateMaterials();
    for (const [type, cx, cy, rot = 0] of PROPS) {
      if (!this.walkable(cx, cy)) continue;
      const c = this.cellCenter(cx, cy);
      if (type === 'crate' || type === 'stack') {
        const size = type === 'stack' ? 1.7 : 1.15;
        const jitter = (this.rng() - 0.5) * 0.3;
        this.addCrate(c.x + jitter * 0.4, 0, c.z - jitter * 0.4, size, crateMat, jitter);
        if (type === 'stack') this.addCrate(c.x + 0.15, size, c.z - 0.1, 1.15, crateMat, -jitter);
        this.grid[this.idx(cx, cy)] = 2;
      } else if (type === 'barrels') {
        const offs = [[-0.35, -0.3], [0.35, -0.25], [0, 0.38]];
        for (const [ox, oz] of offs) {
          const m = A.models.Barrel_01.clone(true);
          m.scale.setScalar(1.15);
          m.position.set(c.x + ox, 0, c.z + oz);
          m.rotation.y = this.rng() * Math.PI * 2;
          this.group.add(m);
        }
        this.colliders.push({ min: new THREE.Vector3(c.x - 0.72, 0, c.z - 0.66), max: new THREE.Vector3(c.x + 0.72, 1.0, c.z + 0.74), mat: 'metal' });
        this.grid[this.idx(cx, cy)] = 2;
      } else if (type === 'barrier') {
        const m = A.models.concrete_road_barrier.clone(true);
        m.scale.set(1.3, 1.25, 1.3);
        m.rotation.y = rot * Math.PI / 2;
        m.position.copy(c);
        this.group.add(m);
        const hx = rot % 2 ? 0.42 : 1.0, hz = rot % 2 ? 1.0 : 0.42;
        this.colliders.push({ min: new THREE.Vector3(c.x - hx, 0, c.z - hz), max: new THREE.Vector3(c.x + hx, 1.04, c.z + hz), mat: 'concrete' });
        this.grid[this.idx(cx, cy)] = 2;
      } else if (type === 'car') {
        const m = A.models.covered_car.clone(true);
        const vertical = rot % 2 === 0;
        const nx = vertical ? cx : cx + 1, ny = vertical ? cy + 1 : cy;
        const c2 = this.cellCenter(nx, ny);
        m.position.set((c.x + c2.x) / 2, 0, (c.z + c2.z) / 2);
        m.rotation.y = vertical ? 0 : Math.PI / 2;
        this.group.add(m);
        const hx = vertical ? 0.95 : 2.2, hz = vertical ? 2.2 : 0.95;
        this.colliders.push({ min: new THREE.Vector3(m.position.x - hx, 0, m.position.z - hz), max: new THREE.Vector3(m.position.x + hx, 1.35, m.position.z + hz), mat: 'metal' });
        this.grid[this.idx(cx, cy)] = 2;
        if (this.walkable(nx, ny)) this.grid[this.idx(nx, ny)] = 2;
      }
    }
  }

  crateMaterials() {
    const t = this.assets.textures.planks;
    const face = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.arm, aoMap: t.arm, roughness: 1, color: 0xd8c3a0 });
    const frame = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.arm, roughness: 1, color: 0x8a6a48 });
    return { face, frame };
  }

  // Classic shooter crate: planked box with a darker structural frame on every edge.
  addCrate(x, y, z, s, mats, rot = 0) {
    const g = new THREE.Group();
    const body = new THREE.BoxGeometry(s * 0.96, s * 0.96, s * 0.96);
    planarUV(body, 1.1, true);
    const bm = new THREE.Mesh(body, mats.face);
    bm.castShadow = bm.receiveShadow = true;
    g.add(bm);
    const t = s * 0.1;
    const edges = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const e1 = new THREE.BoxGeometry(s, t, t); e1.translate(0, a * (s - t) / 2, b * (s - t) / 2); edges.push(e1);
      const e2 = new THREE.BoxGeometry(t, s, t); e2.translate(a * (s - t) / 2, 0, b * (s - t) / 2); edges.push(e2);
      const e3 = new THREE.BoxGeometry(t, t, s); e3.translate(a * (s - t) / 2, b * (s - t) / 2, 0); edges.push(e3);
    }
    // Diagonal brace on two faces.
    const len = Math.SQRT2 * s * 0.8;
    for (const side of [-1, 1]) {
      const d = new THREE.BoxGeometry(t * 0.8, len, t * 0.5);
      d.rotateZ(Math.PI / 4);
      d.translate(0, 0, side * (s / 2 - t * 0.2));
      edges.push(d);
    }
    const eg = mergeGeometries(edges);
    planarUV(eg, 0.9, true);
    const em = new THREE.Mesh(eg, mats.frame);
    em.castShadow = em.receiveShadow = true;
    g.add(em);
    g.position.set(x, y + s / 2, z);
    g.rotation.y = rot * 0.15;
    this.group.add(g);
    const r = s / 2 + 0.03;
    this.colliders.push({ min: new THREE.Vector3(x - r, y, z - r), max: new THREE.Vector3(x + r, y + s, z + r), mat: 'wood' });
  }

  // Large painted site letters on the walls, the way players read a map.
  buildSiteMarks() {
    const put = (letter, x, y, z, ry) => {
      const tex = siteLetterTexture(letter);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      this.group.add(m);
    };
    put('A', 49 * CELL, 3.2, 2 * CELL + 0.04, 0);
    put('A', 57 * CELL - 0.04, 3.2, 20 * CELL, -Math.PI / 2);
    put('B', 9 * CELL, 3.2, 2 * CELL + 0.04, 0);
    put('B', 4 * CELL + 0.04, 3.2, 26 * CELL, Math.PI / 2);
    // Direction arrows at key junctions.
    const arrow = (text, x, y, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshStandardMaterial({ map: arrowTexture(text), transparent: true, roughness: 0.9, depthWrite: false }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      this.group.add(m);
    };
    arrow('← B    A →', 21 * CELL, 2.6, 34 * CELL + 0.05, 0);
    arrow('MID →', 25 * CELL, 2.6, 34 * CELL + 0.05, 0);
  }

  // Non-colliding clutter along walls.
  buildDecor() {
    const A = this.assets;
    const spots = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (!this.walkable(x, y)) continue;
      const nearWall = this.solid(x - 1, y) || this.solid(x + 1, y) || this.solid(x, y - 1) || this.solid(x, y + 1);
      if (nearWall && this.rng() < 0.07) spots.push([x, y]);
    }
    const kinds = ['metal_jerrycan', 'cardboard_box_01', 'old_tyre', 'wooden_crate_02'];
    for (const [x, y] of spots) {
      const c = this.cellCenter(x, y);
      let dx = 0, dz = 0;
      if (this.solid(x - 1, y)) dx = -0.7; else if (this.solid(x + 1, y)) dx = 0.7;
      if (this.solid(x, y - 1)) dz = -0.7; else if (this.solid(x, y + 1)) dz = 0.7;
      const kind = kinds[Math.floor(this.rng() * kinds.length)];
      const m = A.models[kind].clone(true);
      m.position.set(c.x + dx, 0, c.z + dz);
      m.rotation.y = this.rng() * Math.PI * 2;
      if (kind === 'old_tyre') { m.rotation.x = Math.PI / 2; m.position.y = 0.09; m.scale.setScalar(1.2); }
      if (kind === 'cardboard_box_01') m.scale.setScalar(1.4);
      this.group.add(m);
    }
  }
}

// ---------- helpers ----------

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function greedyBoxes(grid, w, h, value) {
  const used = new Uint8Array(w * h);
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (grid[i] !== value || used[i]) continue;
    let x1 = x;
    while (x1 + 1 < w && grid[y * w + x1 + 1] === value && !used[y * w + x1 + 1] && x1 - x < 7) x1++;
    let y1 = y;
    outer: while (y1 + 1 < h && y1 - y < 7) {
      for (let xx = x; xx <= x1; xx++) { const j = (y1 + 1) * w + xx; if (grid[j] !== value || used[j]) break outer; }
      y1++;
    }
    for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) used[yy * w + xx] = 1;
    out.push({ x0: x, y0: y, x1, y1 });
  }
  return out;
}

// World-space planar UVs per face (box-projected). Makes textures continuous
// across merged blocks and keeps texel density constant.
export function planarUV(geo, scale, local = false) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z * Math.sign(nor.getX(i) || 1); v = y; } else { u = -x * Math.sign(nor.getZ(i) || 1); v = y; }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function spray(ctx, drawFn, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  drawFn();
  ctx.restore();
}

function siteLetterTexture(letter) {
  return canvasTex(512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    spray(ctx, () => {
      ctx.globalAlpha = 0.88;
      ctx.font = '900 400px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, w / 2, h / 2 + 20);
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 225, 0, Math.PI * 2);
      ctx.stroke();
    }, '#b3261e');
    // Drips.
    ctx.fillStyle = 'rgba(179,38,30,0.8)';
    for (let i = 0; i < 9; i++) {
      const x = 130 + Math.random() * 250, y = 300 + Math.random() * 80;
      ctx.fillRect(x, y, 4, 30 + Math.random() * 90);
    }
  });
}

function arrowTexture(text) {
  return canvasTex(512, 192, (ctx, w, h) => {
    spray(ctx, () => {
      ctx.globalAlpha = 0.85;
      ctx.font = '700 96px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2);
    }, '#e9e2cf');
  });
}

function siteBorderTexture(letter) {
  return canvasTex(512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(214,168,52,0.75)';
    ctx.lineWidth = 7;
    ctx.setLineDash([26, 14]);
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(214,168,52,0.35)';
    ctx.font = '900 220px Impact, "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, w / 2, h / 2);
  });
}
