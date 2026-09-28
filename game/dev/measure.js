import * as THREE from 'three';
import { Assets } from '../src/assets.js';
const ids = ['usp', 'glock', 'deagle', 'mp9', 'ak47', 'm4a4', 'awp', 'knife'];
const W = 1400, H = 520;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const assets = new Assets(renderer);
const which = new URLSearchParams(location.search).get('w') || 'ak47';
assets.load().then(() => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f1ea);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2.5));
  const m = assets.weaponModel(which, { measure: true });
  m.traverse((o) => { if (o.isMesh) { const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach((x) => { x.metalness = 0; x.color.offsetHSL(0, 0, 0.25); }); } });
  scene.add(m);
  const box = new THREE.Box3().setFromObject(m);
  const zoomTop = new URLSearchParams(location.search).get('top');
  let halfW = Math.max(box.max.z, -box.min.z) + 0.03;
  let halfH = halfW * H / W;
  const needH = Math.max(box.max.y, -box.min.y) + 0.02;
  if (needH > halfH) { halfH = needH; halfW = halfH * W / H; }
  let cy = 0;
  if (zoomTop) { halfW /= 1.6; halfH /= 1.6; cy = box.max.y - halfH * 0.55; }
  const span = halfW * 2;
  const zc = zoomTop ? parseFloat(zoomTop) / 100 : 0;
  const cam = new THREE.OrthographicCamera(-halfW + zc, halfW + zc, halfH + cy, -halfH + cy, -5, 5);
  cam.position.set(1, 0, 0); cam.lookAt(0, 0, 0);
  renderer.render(scene, cam);
  // grid overlay: screen x = -z, screen y = y (cm labels)
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
  c2.style.position = 'absolute'; c2.style.left = '0'; c2.style.top = '0';
  document.body.appendChild(c2);
  const ctx = c2.getContext('2d');
  const px = (sx) => (sx + halfW - zc) / span * W, py = (sy) => (halfH + cy - sy) / (2 * halfH) * H;
  ctx.font = '11px sans-serif';
  for (let cm = -100; cm <= 100; cm++) {
    const v = cm / 100;
    const major = cm % 5 === 0;
    ctx.strokeStyle = major ? 'rgba(200,0,0,0.45)' : 'rgba(0,0,200,0.12)';
    ctx.beginPath(); ctx.moveTo(px(v), 0); ctx.lineTo(px(v), H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, py(v)); ctx.lineTo(W, py(v)); ctx.stroke();
    if (major) { ctx.fillStyle = '#a00'; ctx.fillText(`z${-cm}`, px(v) + 2, 12); ctx.fillText(`y${cm}`, 2, py(v) - 2); }
  }
  ctx.fillStyle = '#000'; ctx.font = '16px sans-serif';
  ctx.fillText(`${which}  box z[${(box.min.z*100).toFixed(1)}, ${(box.max.z*100).toFixed(1)}] y[${(box.min.y*100).toFixed(1)}, ${(box.max.y*100).toFixed(1)}] cm  (muzzle → right)`, 60, H - 10);
  document.title = 'done';
});
