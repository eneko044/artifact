// The artifact host only serves web media types, so binary assets (.glb .fbx .hdr and
// glTF buffers) are shipped as base64 inside .json files. glTF+bin pairs become GLB
// first (images stay external .jpg files next to them).
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('../game/assets/', import.meta.url).pathname;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const write = (file, buf) => fs.writeFileSync(file + '.json', JSON.stringify({ b64: Buffer.from(buf).toString('base64') }));

function toGlb(gltfPath) {
  const dir = path.dirname(gltfPath);
  const json = JSON.parse(fs.readFileSync(gltfPath, 'utf8'));
  const bin = fs.readFileSync(path.join(dir, json.buffers[0].uri));
  json.buffers = [{ byteLength: bin.length }];
  let jsonBuf = Buffer.from(JSON.stringify(json));
  const jpad = (4 - (jsonBuf.length % 4)) % 4;
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
  const bpad = (4 - (bin.length % 4)) % 4;
  const binBuf = Buffer.concat([bin, Buffer.alloc(bpad)]);
  const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const h = Buffer.alloc(12);
  h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binBuf.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, jh, jsonBuf, bh, binBuf]);
}

let n = 0;
for (const f of walk(root)) {
  if (/\.(glb|fbx|hdr)$/.test(f)) { write(f, fs.readFileSync(f)); n++; }
  else if (f.endsWith('.gltf')) { write(f.replace(/\.gltf$/, '.glb'), toGlb(f)); n++; }
}
console.log('packed', n, 'binary assets');
