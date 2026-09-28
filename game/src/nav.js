import * as THREE from 'three';
import { W, H } from './map.js';
import { CELL } from './config.js';

// A* over the map grid with 8-way moves (no corner cutting) and string pulling.
export class Nav {
  constructor(map) {
    this.map = map;
    this.g = new Float32Array(W * H);
    this.f = new Float32Array(W * H);
    this.from = new Int32Array(W * H);
    this.state = new Uint8Array(W * H); // 0 new, 1 open, 2 closed
    // Cost field: cells next to walls are a bit more expensive so bots walk the middle of lanes.
    this.cost = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c = 1;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (!map.walkable(x + ox, y + oy)) c = 1.35;
      this.cost[y * W + x] = c;
    }
  }

  nearestWalkable(cx, cy) {
    if (this.map.walkable(cx, cy)) return [cx, cy];
    for (let r = 1; r < 6; r++) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      if (this.map.walkable(cx + ox, cy + oy)) return [cx + ox, cy + oy];
    }
    return [cx, cy];
  }

  find(fromV, toCell) {
    const map = this.map;
    const [sx, sy] = this.nearestWalkable(...map.toCell(fromV));
    const [tx, ty] = this.nearestWalkable(toCell[0], toCell[1]);
    const start = sy * W + sx, goal = ty * W + tx;
    this.state.fill(0);
    const open = [start];
    this.g[start] = 0;
    this.f[start] = octile(sx, sy, tx, ty);
    this.from[start] = -1;
    this.state[start] = 1;
    let found = false;
    while (open.length) {
      // Small grid: linear scan for the best node is fast enough and allocation free.
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (this.f[open[i]] < this.f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goal) { found = true; break; }
      this.state[cur] = 2;
      const cx = cur % W, cy = (cur / W) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = cx + ox, ny = cy + oy;
        if (!map.walkable(nx, ny)) continue;
        if (ox && oy && (!map.walkable(cx + ox, cy) || !map.walkable(cx, cy + oy))) continue;
        const ni = ny * W + nx;
        if (this.state[ni] === 2) continue;
        const step = (ox && oy ? Math.SQRT2 : 1) * this.cost[ni];
        const ng = this.g[cur] + step;
        if (this.state[ni] === 1 && ng >= this.g[ni]) continue;
        this.g[ni] = ng;
        this.f[ni] = ng + octile(nx, ny, tx, ty);
        this.from[ni] = cur;
        if (this.state[ni] !== 1) { this.state[ni] = 1; open.push(ni); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = goal; c !== -1; c = this.from[c]) cells.push([c % W, (c / W) | 0]);
    cells.reverse();
    return this.smooth(cells).map(([x, y]) => new THREE.Vector3((x + 0.5) * CELL, 0, (y + 0.5) * CELL));
  }

  // Drop intermediate cells while a straight, clearance-checked line exists.
  smooth(cells) {
    if (cells.length <= 2) return cells;
    const out = [cells[0]];
    let anchor = 0;
    for (let i = 2; i < cells.length; i++) {
      if (!this.clearLine(cells[anchor], cells[i])) {
        out.push(cells[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(cells[cells.length - 1]);
    return out;
  }

  clearLine(a, b) {
    const ax = a[0] + 0.5, ay = a[1] + 0.5, bx = b[0] + 0.5, by = b[1] + 0.5;
    const dist = Math.hypot(bx - ax, by - ay);
    const n = Math.ceil(dist * 4);
    const px = -(by - ay) / dist, py = (bx - ax) / dist; // perpendicular for clearance
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      for (const o of [-0.3, 0, 0.3]) {
        if (!this.map.walkable(Math.floor(x + px * o), Math.floor(y + py * o))) return false;
      }
    }
    return true;
  }
}

function octile(ax, ay, bx, by) {
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}
