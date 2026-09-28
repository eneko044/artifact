import * as THREE from 'three';
import { W, H } from './map.js';
import { CELL } from './config.js';

// Spatial hash over the collider list so rays and movement only test nearby boxes.
export class World {
  constructor(map) {
    this.map = map;
    this.colliders = map.colliders;
    this.bucket = 8; // meters
    this.bw = Math.ceil((W * CELL) / this.bucket) + 1;
    this.bh = Math.ceil((H * CELL) / this.bucket) + 1;
    this.buckets = Array.from({ length: this.bw * this.bh }, () => []);
    this.colliders.forEach((c, i) => {
      const x0 = this.bx(c.min.x), x1 = this.bx(c.max.x), z0 = this.bx(c.min.z), z1 = this.bx(c.max.z);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.buckets[z * this.bw + x].push(i);
    });
    this.stamp = new Uint32Array(this.colliders.length);
    this.stampId = 1;
  }

  bx(v) { return Math.max(0, Math.min(this.bw - 1, Math.floor(v / this.bucket))); }

  // Colliders overlapping an XZ rectangle.
  query(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const id = ++this.stampId;
    for (let z = this.bx(minZ); z <= this.bx(maxZ); z++) for (let x = this.bx(minX); x <= this.bx(maxX); x++) {
      for (const i of this.buckets[z * this.bw + x]) {
        if (this.stamp[i] === id) continue;
        this.stamp[i] = id;
        const c = this.colliders[i];
        if (c.max.x < minX || c.min.x > maxX || c.max.z < minZ || c.min.z > maxZ) continue;
        out.push(c);
      }
    }
    return out;
  }

  // Ray against boxes and ground. Returns {dist, point, normal, collider} or null.
  raycast(origin, dir, maxDist, ignoreProps = false) {
    let best = maxDist, hit = null;
    // Ground plane.
    if (dir.y < -1e-6) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < best) { best = t; hit = { collider: null, normal: new THREE.Vector3(0, 1, 0), mat: 'ground' }; }
    }
    // Walk the buckets along the ray (DDA over the coarse grid).
    const id = ++this.stampId;
    const step = this.bucket * 0.5;
    const n = Math.ceil(Math.min(best, maxDist) / step) + 1;
    const p = new THREE.Vector3();
    const res = { t: 0, nx: 0, ny: 0, nz: 0 };
    for (let s = 0; s <= n; s++) {
      const d = Math.min(s * step, best);
      p.copy(origin).addScaledVector(dir, d);
      const bxi = this.bx(p.x), bzi = this.bx(p.z);
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
        const x = bxi + ox, z = bzi + oz;
        if (x < 0 || z < 0 || x >= this.bw || z >= this.bh) continue;
        for (const i of this.buckets[z * this.bw + x]) {
          if (this.stamp[i] === id) continue;
          this.stamp[i] = id;
          const c = this.colliders[i];
          if (ignoreProps && !c.wall) continue;
          if (rayBox(origin, dir, c.min, c.max, best, res)) {
            best = res.t;
            hit = { collider: c, normal: new THREE.Vector3(res.nx, res.ny, res.nz), mat: c.mat };
          }
        }
      }
      if (d >= best) break;
    }
    if (!hit) return null;
    hit.dist = best;
    hit.point = origin.clone().addScaledVector(dir, best);
    return hit;
  }

  lineClear(a, b, ignoreProps = false) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return true;
    d.divideScalar(len);
    const h = this.raycast(a, d, len - 0.05, ignoreProps);
    return !h;
  }

  // Resolve a vertical cylinder (feet position) against the world. Mutates pos, returns flags.
  moveCylinder(pos, vel, radius, height, dt, stepHeight, onGround) {
    const tmp = this._tmp || (this._tmp = []);
    const res = { onGround: false, hitWall: false, groundY: 0, stepped: 0 };
    // Horizontal, axis separated.
    for (const axis of ['x', 'z']) {
      const delta = vel[axis] * dt;
      if (delta === 0) continue;
      pos[axis] += delta;
      this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, tmp);
      for (const c of tmp) {
        if (pos.y + height <= c.min.y + 0.01 || pos.y >= c.max.y - 0.01) continue;
        if (!circleBox(pos.x, pos.z, radius, c)) continue;
        // Step up small ledges when grounded (or nearly, e.g. mid-jump onto a crate).
        const rise = c.max.y - pos.y;
        if ((onGround && rise <= stepHeight) || (!onGround && rise <= 0.3 && vel.y <= 1.5)) {
          if (this.headroom(pos.x, c.max.y, pos.z, radius, height)) {
            pos.y = c.max.y;
            res.stepped = Math.max(res.stepped, rise);
            continue;
          }
        }
        // Push out along this axis.
        if (axis === 'x') {
          if (delta > 0) pos.x = c.min.x - radius - 1e-4; else pos.x = c.max.x + radius + 1e-4;
          if (!circleBox(pos.x, pos.z, radius, c)) { vel.x = 0; res.hitWall = true; continue; }
        } else {
          if (delta > 0) pos.z = c.min.z - radius - 1e-4; else pos.z = c.max.z + radius + 1e-4;
          if (!circleBox(pos.x, pos.z, radius, c)) { vel.z = 0; res.hitWall = true; continue; }
        }
        // Corner case: resolve by the smallest penetration.
        resolveCorner(pos, radius, c);
        res.hitWall = true;
      }
    }
    // Vertical.
    pos.y += vel.y * dt;
    const ground = this.groundHeight(pos.x, pos.z, radius, pos.y + stepHeight * (onGround ? 1 : 0.2));
    if (pos.y <= ground) {
      pos.y = ground;
      if (vel.y < 0) vel.y = 0;
      res.onGround = true;
    } else if (onGround && vel.y <= 0 && pos.y - ground < stepHeight) {
      // Stick to the floor when walking down small steps.
      pos.y = ground;
      vel.y = 0;
      res.onGround = true;
    }
    // Ceiling.
    this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, tmp);
    for (const c of tmp) {
      if (!circleBox(pos.x, pos.z, radius * 0.9, c)) continue;
      if (c.min.y > pos.y && pos.y + height > c.min.y) {
        pos.y = c.min.y - height;
        if (vel.y > 0) vel.y = 0;
      }
    }
    res.groundY = ground;
    return res;
  }

  groundHeight(x, z, radius, maxY) {
    let g = 0;
    const tmp = this._tmp2 || (this._tmp2 = []);
    this.query(x - radius, z - radius, x + radius, z + radius, tmp);
    for (const c of tmp) {
      if (c.max.y > maxY + 1e-3) continue;
      if (!circleBox(x, z, radius * 0.85, c)) continue;
      if (c.max.y > g) g = c.max.y;
    }
    return g;
  }

  headroom(x, y, z, radius, height) {
    const tmp = this._tmp3 || (this._tmp3 = []);
    this.query(x - radius, z - radius, x + radius, z + radius, tmp);
    for (const c of tmp) {
      if (c.min.y < y + height && c.max.y > y + 0.01 && circleBox(x, z, radius, c)) return false;
    }
    return true;
  }
}

export function circleBox(x, z, r, c) {
  const cx = Math.max(c.min.x, Math.min(x, c.max.x));
  const cz = Math.max(c.min.z, Math.min(z, c.max.z));
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

function resolveCorner(pos, r, c) {
  const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
  const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
  let dx = pos.x - cx, dz = pos.z - cz;
  let d = Math.hypot(dx, dz);
  if (d < 1e-5) {
    // Center inside: push along the shallowest side.
    const pen = [pos.x - c.min.x, c.max.x - pos.x, pos.z - c.min.z, c.max.z - pos.z];
    const m = Math.min(...pen);
    if (m === pen[0]) pos.x = c.min.x - r; else if (m === pen[1]) pos.x = c.max.x + r;
    else if (m === pen[2]) pos.z = c.min.z - r; else pos.z = c.max.z + r;
    return;
  }
  const push = r - d + 1e-4;
  pos.x += (dx / d) * push;
  pos.z += (dz / d) * push;
}

export function rayBox(o, d, min, max, maxT, out) {
  let tmin = 0, tmax = maxT, axis = -1, sign = 0;
  for (let a = 0; a < 3; a++) {
    const k = a === 0 ? 'x' : a === 1 ? 'y' : 'z';
    const od = d[k], oo = o[k];
    if (Math.abs(od) < 1e-9) {
      if (oo < min[k] || oo > max[k]) return false;
      continue;
    }
    const inv = 1 / od;
    let t1 = (min[k] - oo) * inv, t2 = (max[k] - oo) * inv;
    let s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  if (axis < 0) return false; // origin inside
  out.t = tmin;
  out.nx = axis === 0 ? sign : 0;
  out.ny = axis === 1 ? sign : 0;
  out.nz = axis === 2 ? sign : 0;
  return true;
}

// Ray vs capsule segment (a-b, radius r). Returns distance or -1.
export function rayCapsule(o, d, a, b, r) {
  const ba = new THREE.Vector3().subVectors(b, a);
  const oa = new THREE.Vector3().subVectors(o, a);
  const baba = ba.dot(ba), bard = ba.dot(d), baoa = ba.dot(oa), rdoa = d.dot(oa), oaoa = oa.dot(oa);
  const A = baba - bard * bard;
  const B = baba * rdoa - baoa * bard;
  const C = baba * oaoa - baoa * baoa - r * r * baba;
  const h = B * B - A * C;
  if (h >= 0 && A > 1e-9) {
    const t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (y > 0 && y < baba && t > 0) return t;
    // Caps.
    const oc = y <= 0 ? oa : new THREE.Vector3().subVectors(o, b);
    const bb = d.dot(oc), cc = oc.dot(oc) - r * r;
    const hh = bb * bb - cc;
    if (hh > 0) { const tt = -bb - Math.sqrt(hh); if (tt > 0) return tt; }
  } else {
    return raySphere(o, d, a, r);
  }
  return -1;
}

export function raySphere(o, d, c, r) {
  const oc = new THREE.Vector3().subVectors(o, c);
  const b = oc.dot(d), cc = oc.dot(oc) - r * r;
  const h = b * b - cc;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t > 0 ? t : -1;
}
