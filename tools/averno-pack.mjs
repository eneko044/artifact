// Prepares Freedoom for Averno:
//  - downloads the Freedoom release (BSD licence) if it is not cached yet,
//  - ships each IWAD gzipped inside a base64 .json (the artifact host only serves web
//    media types, see tools/pack.mjs),
//  - extracts a few graphics from the WADs as PNG for the launcher page.
//
//   node tools/averno-pack.mjs [path/to/freedoom-0.13.0.zip]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const VERSION = '0.13.0';
const URL_ZIP = `https://github.com/freedoom/freedoom/releases/download/v${VERSION}/freedoom-${VERSION}.zip`;
const root = new URL('../averno/', import.meta.url).pathname;
const zip = process.argv[2] || path.join(os.tmpdir(), `freedoom-${VERSION}.zip`);

if (!fs.existsSync(zip)) {
  console.log('downloading', URL_ZIP);
  execFileSync('curl', ['-sSfL', '-o', zip, URL_ZIP], { stdio: 'inherit' });
}
const unzip = (name) => execFileSync('unzip', ['-p', zip, `freedoom-${VERSION}/${name}`], { maxBuffer: 1 << 26 });

function readWad(buf) {
  const n = buf.readInt32LE(4), dir = buf.readInt32LE(8);
  const lumps = [];
  for (let i = 0; i < n; i++) {
    const o = dir + i * 16;
    lumps.push({
      name: buf.toString('latin1', o + 8, o + 16).replace(/\0.*$/, ''),
      data: buf.subarray(buf.readInt32LE(o), buf.readInt32LE(o) + buf.readInt32LE(o + 4)),
    });
  }
  const get = (name) => lumps.find((l) => l.name === name)?.data;
  return { lumps, get };
}

// Doom picture format: column posts of palette indices, 0xff ends a column.
function decodePatch(data, pal) {
  const w = data.readUInt16LE(0), h = data.readUInt16LE(2);
  const rgba = Buffer.alloc(w * h * 4);
  for (let x = 0; x < w; x++) {
    let p = data.readUInt32LE(8 + x * 4);
    while (data[p] !== 0xff) {
      const top = data[p], len = data[p + 1];
      for (let i = 0; i < len; i++) {
        const c = data[p + 3 + i], o = ((top + i) * w + x) * 4;
        rgba[o] = pal[c * 3]; rgba[o + 1] = pal[c * 3 + 1]; rgba[o + 2] = pal[c * 3 + 2]; rgba[o + 3] = 255;
      }
      p += len + 4;
    }
  }
  return { w, h, rgba };
}

const png = (img, file) => sharp(img.rgba, { raw: { width: img.w, height: img.h, channels: 4 } })
  .png({ compressionLevel: 9, palette: true }).toFile(file);

fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.mkdirSync(path.join(root, 'img'), { recursive: true });
const manifest = {};

for (const [phase, name] of [[1, 'freedoom1.wad'], [2, 'freedoom2.wad']]) {
  const wad = unzip(name);
  const gz = zlib.gzipSync(wad, { level: 9 });
  const sha1 = crypto.createHash('sha1').update(wad).digest('hex');
  fs.writeFileSync(path.join(root, 'data', `${name}.json`), JSON.stringify({ name, size: wad.length, sha1, b64: gz.toString('base64') }));
  manifest[name] = { size: wad.length, gz: gz.length, sha1 };
  console.log(name, (wad.length / 1e6).toFixed(1), 'MB ->', (gz.length / 1e6).toFixed(1), 'MB gzip');

  const { get } = readWad(wad);
  const pal = get('PLAYPAL');
  await png(decodePatch(get('TITLEPIC'), pal), path.join(root, 'img', `titlepic${phase}.png`));
  if (phase === 1) {
    // Status bar faces from healthy to battered, one per difficulty.
    for (let i = 0; i < 5; i++) await png(decodePatch(get(`STFST${i}1`), pal), path.join(root, 'img', `face${i + 1}.png`));
  }
}
fs.writeFileSync(path.join(root, 'data', 'manifest.json'), JSON.stringify(manifest, null, 1));
