import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
const fl = new FBXLoader();
const out = {};
(async () => {
  for (const n of ['AssaultRifle_2','AssaultRifle2_1','SubmachineGun_2','Pistol_1','Pistol_2','Pistol_5','SniperRifle_3','Knife_1']) {
    const o = await fl.loadAsync('../assets/guns/' + n + '.fbx');
    const meshes = [];
    o.traverse((m) => { if (m.isMesh) meshes.push({ name: m.name, verts: m.geometry.attributes.position.count, groups: m.geometry.groups.length, mats: (Array.isArray(m.material) ? m.material : [m.material]).map((x) => x.name) }); });
    out[n] = { root: [o.rotation.toArray().slice(0,3), o.scale.toArray()], meshes };
  }
  window.__out = out; document.title = 'done';
})();
