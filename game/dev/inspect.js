import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
const out = {};
const fl = new FBXLoader(), gl = new GLTFLoader();
const guns = ['AssaultRifle_1','AssaultRifle_2','AssaultRifle_3','AssaultRifle_4','AssaultRifle_5','AssaultRifle2_1','AssaultRifle2_2','SubmachineGun_1','SubmachineGun_2','Pistol_1','Pistol_2','Pistol_5','Pistol_6','SniperRifle_1','SniperRifle_2','SniperRifle_3','SniperRifle_4','SniperRifle_5','Knife_1'];
const renderer = new THREE.WebGLRenderer({antialias:true}); renderer.setSize(1600,1000); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdddddd);
scene.add(new THREE.HemisphereLight(0xffffff,0x444444,2)); const dl=new THREE.DirectionalLight(0xffffff,2); dl.position.set(1,2,3); scene.add(dl);
const cam = new THREE.OrthographicCamera(0,5,0,-4,-10,10); cam.position.set(0,0,5);
async function run(){
  let i=0;
  for (const g of guns) {
    const o = await fl.loadAsync('../assets/guns/'+g+'.fbx');
    const b = new THREE.Box3().setFromObject(o); const s=b.getSize(new THREE.Vector3());
    const mats=[]; o.traverse(m=>{ if(m.isMesh){ (Array.isArray(m.material)?m.material:[m.material]).forEach(x=>mats.push(x.name+':'+x.type+':'+x.color?.getHexString())); }});
    out[g] = {size:s.toArray().map(v=>+v.toFixed(2)), min:b.min.toArray().map(v=>+v.toFixed(2)), mats:[...new Set(mats)]};
    // fit into cell, looking along -Z (front view shows X/Y)
    const k = 0.9/Math.max(s.x,s.y,s.z); o.scale.multiplyScalar(k);
    const c = b.getCenter(new THREE.Vector3()).multiplyScalar(k);
    o.position.set((i%5)+0.5-c.x, -Math.floor(i/5)-0.5-c.y, 0);
    scene.add(o); i++;
  }
  const sol = await gl.loadAsync('../assets/models/Soldier.glb');
  const bones=[]; sol.scene.traverse(o=>{ if(o.isBone) bones.push(o.name); });
  const sb = new THREE.Box3().setFromObject(sol.scene);
  out.soldier = {anims: sol.animations.map(a=>a.name+':'+a.duration.toFixed(2)), bones, size: sb.getSize(new THREE.Vector3()).toArray(), rootScale: sol.scene.children.map(c=>c.name+':'+c.scale.toArray())};
  for (const m of ['wooden_crate_01','wooden_crate_02','Barrel_01','concrete_road_barrier','metal_jerrycan','cardboard_box_01','covered_car','old_tyre','service_pistol','stick_grenade']) {
    const g = await gl.loadAsync('../assets/models/'+m+'/'+m+'.gltf');
    const b = new THREE.Box3().setFromObject(g.scene);
    out[m] = {size:b.getSize(new THREE.Vector3()).toArray().map(v=>+v.toFixed(3)), min:b.min.toArray().map(v=>+v.toFixed(3))};
  }
  renderer.render(scene, cam);
  window.__out = out; document.title='done';
}
run().catch(e=>{window.__out={err:String(e.stack||e)}; document.title='done';});
