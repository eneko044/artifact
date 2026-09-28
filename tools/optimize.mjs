// Recompresses downloaded CC0 textures so the whole game stays light to load.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('../game/assets/', import.meta.url).pathname;
const small = ['metal_jerrycan', 'cardboard_box_01', 'old_tyre', 'stick_grenade', 'Barrel_01', 'wooden_crate_02', 'concrete_road_barrier'];
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); }
let before = 0, after = 0;
for (const f of walk(root).filter((f) => f.endsWith('.jpg'))) {
  const buf = fs.readFileSync(f);
  before += buf.length;
  const isSmall = small.some((s) => f.includes(`/models/${s}/`));
  const size = isSmall ? 512 : 1024;
  const q = f.includes('_nor') ? 82 : 76;
  const out = await sharp(buf).resize(size, size, { fit: 'inside' }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
  const keep = out.length < buf.length ? out : buf;
  fs.writeFileSync(f, keep);
  after += keep.length;
}
console.log('jpg MB', (before / 1e6).toFixed(1), '->', (after / 1e6).toFixed(1));
