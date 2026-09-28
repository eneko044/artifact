import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { WEAPONS } from './config.js';

export const TEXTURE_SETS = {
  sandstone: { name: 'large_sandstone_blocks_01', scale: 3.2 },
  plaster: { name: 'yellow_plaster_02', scale: 3.0 },
  clay: { name: 'patterned_clay_plaster', scale: 2.6 },
  gravel: { name: 'sandy_gravel', scale: 4.0 },
  paving: { name: 'red_sandstone_pavement', scale: 3.0 },
  planks: { name: 'weathered_planks', scale: 1.6 },
  metal: { name: 'rusty_metal_02', scale: 2.0 },
  concrete: { name: 'concrete_wall_008', scale: 2.5 },
  brick: { name: 'sandstone_brick_wall_01', scale: 2.4 },
  worn: { name: 'worn_plaster_wall', scale: 3.0 },
};

export const PROP_MODELS = [
  'wooden_crate_02', 'Barrel_01', 'concrete_road_barrier',
  'metal_jerrycan', 'cardboard_box_01', 'covered_car', 'old_tyre',
  'stick_grenade',
];

export class Assets {
  constructor(renderer) {
    this.renderer = renderer;
    this.manager = new THREE.LoadingManager();
    this.textures = {};
    this.materials = {};
    this.models = {};
    this.guns = {};
    this.soldier = null;
    this.envMap = null;
    this.skyTexture = null;
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
  }

  async load(onProgress) {
    const tl = new THREE.TextureLoader(this.manager);
    const gl = new GLTFLoader(this.manager);
    const fl = new FBXLoader(this.manager);
    const rl = new RGBELoader(this.manager);

    const jobs = [];
    let done = 0;
    const track = (p) => p.then((v) => { done++; onProgress?.(done / jobs.length); return v; });

    const loadTex = (url, srgb) => new Promise((res, rej) => {
      tl.load(url, (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = Math.min(8, this.maxAniso);
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        res(t);
      }, undefined, rej);
    });

    for (const [key, set] of Object.entries(TEXTURE_SETS)) {
      jobs.push(track(Promise.all([
        loadTex(`assets/tex/${set.name}_diff.jpg`, true),
        loadTex(`assets/tex/${set.name}_nor.jpg`, false),
        loadTex(`assets/tex/${set.name}_arm.jpg`, false),
      ]).then(([map, normalMap, arm]) => {
        this.textures[key] = { map, normalMap, arm, scale: set.scale };
        this.materials[key] = new THREE.MeshStandardMaterial({
          map, normalMap, aoMap: arm, roughnessMap: arm, metalnessMap: arm,
          roughness: 1, metalness: key === 'metal' ? 1 : 0.0, aoMapIntensity: 0.8,
          normalScale: new THREE.Vector2(1.1, 1.1),
        });
      })));
    }

    // Binary assets are shipped as base64 JSON (the host only serves web media types).
    const bin = (url) => fetch(`${url}.json`).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    }).then(({ b64 }) => {
      const s = atob(b64);
      const u = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
      return u.buffer;
    });
    const glb = (url, base) => bin(url).then((buf) => new Promise((res, rej) => gl.parse(buf, base, res, rej)));

    for (const name of PROP_MODELS) {
      jobs.push(track(glb(`assets/models/${name}/${name}.glb`, `assets/models/${name}/`).then((g) => {
        g.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            const m = o.material;
            if (m.map) m.map.anisotropy = Math.min(8, this.maxAniso);
            m.envMapIntensity = 0.5;
          }
        });
        this.models[name] = g.scene;
      })));
    }

    jobs.push(track(glb('assets/models/Soldier.glb', 'assets/models/').then((g) => { this.soldier = g; })));

    const fbxSources = new Set(Object.values(WEAPONS).filter((w) => w.model.kind === 'fbx').map((w) => w.model.src));
    for (const src of fbxSources) {
      jobs.push(track(bin(src).then((buf) => { this.guns[src] = fl.parse(buf, 'assets/guns/'); })));
    }

    jobs.push(track(bin('assets/hdri/sky_1k.hdr').then((buf) => {
      const d = rl.parse(buf);
      const hdr = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
      hdr.colorSpace = THREE.LinearSRGBColorSpace;
      hdr.minFilter = hdr.magFilter = THREE.LinearFilter;
      hdr.generateMipmaps = false;
      hdr.flipY = true;
      hdr.needsUpdate = true;
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      this.skyTexture = hdr;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envMap = pmrem.fromEquirectangular(hdr).texture;
      pmrem.dispose();
    })));

    await Promise.all(jobs);
    this.prepareGuns();
  }

  // Quaternius guns ship as flat-colored FBX meshes with near-black Phong colors.
  // Rebuild them as PBR materials from a named palette, with a subtle detail normal
  // so they catch light like machined metal, polymer and oiled wood.
  prepareGuns() {
    const detail = this.textures.metal.normalMap.clone();
    detail.repeat.set(4, 4);
    detail.needsUpdate = true;
    const P = {
      wood: [0x7a4a2a, 0.55, 0.0], darkwood: [0x4a2f1e, 0.6, 0.0],
      black: [0x1b1c1e, 0.42, 0.35], black2: [0x131415, 0.5, 0.2],
      darkmetal: [0x2a2c2f, 0.42, 0.6], metal: [0x3d4044, 0.38, 0.65],
      lightmetal: [0x7b7f85, 0.34, 0.75], lightmetal2: [0xa7abb1, 0.3, 0.8],
      grey: [0x55584f, 0.55, 0.2], green: [0x56633f, 0.62, 0.05],
      glass: [0x0b1a2e, 0.05, 0.3], main: [0x2a2c2f, 0.45, 0.4],
      maindark: [0x1a1b1d, 0.45, 0.4], mainlight: [0x3a3d41, 0.4, 0.5],
    };
    for (const obj of Object.values(this.guns)) {
      obj.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const out = mats.map((m) => {
          const key = (m.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const [hex, rough, metal] = P[key] || [0x2f3134, 0.4, 0.6];
          const std = new THREE.MeshStandardMaterial({
            color: hex, roughness: rough, metalness: metal,
            normalMap: key === 'glass' ? null : detail,
            normalScale: new THREE.Vector2(0.15, 0.15),
            envMapIntensity: 0.35,
          });
          std.name = m.name;
          return std;
        });
        o.material = Array.isArray(o.material) ? out : out[0];
        o.castShadow = true;
      });
    }
  }

  // Returns a new Object3D of a weapon model, normalised so its barrel points down -Z,
  // its length equals def.model.length, and its origin sits at the grip.
  weaponModel(id) {
    const def = WEAPONS[id];
    let src;
    if (def.model.kind === 'fbx') src = this.guns[def.model.src];
    else src = this.models[def.model.src.split('/')[2]];
    const inner = src.clone(true);
    const holder = new THREE.Group();
    // Wrap the source so its own import transform (FBX axis fix-ups) stays intact.
    const spin = new THREE.Group();
    spin.add(inner);
    holder.add(spin);
    // FBX guns: muzzle toward +X, up +Y.
    if (def.model.kind === 'fbx') spin.rotation.y = Math.PI / 2;
    holder.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(holder);
    const s = box.getSize(new THREE.Vector3());
    const k = def.model.length / (id === 'he' ? s.y : s.z);
    spin.scale.multiplyScalar(k);
    holder.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3());
    const len = box.max.z - box.min.z;
    const h = box.max.y - box.min.y;
    // Grip point sits toward the rear, a little below the bore line.
    const gripZ = box.max.z - len * (def.slot === 1 ? 0.34 : 0.62);
    const gripY = box.min.y + h * (def.slot === 1 ? 0.55 : 0.6);
    if (id === 'knife' || id === 'he') spin.position.sub(c);
    else spin.position.sub(new THREE.Vector3(c.x, gripY, gripZ));
    holder.userData.muzzle = new THREE.Vector3(0, box.max.y - gripY - h * (def.slot === 1 ? 0.3 : 0.2), box.min.z - gripZ);
    holder.userData.length = len;
    holder.userData.height = h;
    holder.userData.front = box.min.z - gripZ; // negative
    holder.userData.rear = box.max.z - gripZ;
    holder.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return holder;
  }
}
