import * as THREE from 'three';

// Hand and magazine anchors for every weapon, measured from side renders of the
// normalised models (centimetres, origin at the bounding-box centre, barrel toward -Z,
// up +Y). `grip` is where the right palm wraps, `support` where the left hand holds,
// `mag` is the capsule used to cut the magazine out of the mesh (a → b along its axis).
export const RIG_DATA = {
  ak47: { kind: 'rifle', muzzle: [7.7, -41], eject: [8, 3], grip: [0.5, 16.5], gripAngle: 0.42, trigger: [2.5, 8.5], support: [5.2, -8], mag: { a: [4.3, 2.8], b: [-12.2, -6.2], r: 3.9 }, bolt: [9, 0], boltX: 2.5 },
  m4a4: { kind: 'rifle', muzzle: [7.5, -42], eject: [8, 8], grip: [-1.5, 19], gripAngle: 0.5, trigger: [1.5, 11], support: [5, -10], mag: { a: [1.1, 2.6], b: [-14.6, -0.6], r: 3.3 }, bolt: [10.2, 18.5], boltX: 0 },
  mp9: { kind: 'rifle', muzzle: [5, -20], eject: [6, -2], grip: [-0.5, 3.6], gripAngle: 0.4, trigger: [1, -2], support: [2.2, -11], mag: { a: [-0.2, -6], b: [-9.3, -6], r: 1.8 }, bolt: [7.5, 1], boltX: 0 },
  awp: { kind: 'bolt', muzzle: [2.5, -52.5], eject: [3, 17], grip: [-2.5, 24], gripAngle: 0.45, trigger: [-2.5, 18], support: [-2.2, -8], procMag: { pos: [-3.2, 9], size: [2.8, 4.5, 7.5], angle: 0 }, bolt: [2.2, 21], boltX: 3.5 },
  usp: { kind: 'pistol', muzzle: [4, -10.5], eject: [4.5, 3], grip: [-2, 6.5], gripAngle: 0.32, trigger: [0.5, 1.5], support: [-3, 5.5], procMag: { pos: [-2.5, 6.8], size: [2.2, 9, 3.2], angle: 0.32 }, slide: [4.5, 8] },
  glock: { kind: 'pistol', muzzle: [4, -10], eject: [4.5, 3], grip: [-2, 6.2], gripAngle: 0.3, trigger: [0.5, 1.5], support: [-3, 5.2], procMag: { pos: [-2.5, 6.5], size: [2.2, 9, 3.2], angle: 0.3 }, slide: [4.5, 8] },
  deagle: { kind: 'pistol', muzzle: [5, -13.5], eject: [5.5, 4], grip: [-2.5, 8.5], gripAngle: 0.34, trigger: [0.5, 2], support: [-3.5, 7.5], procMag: { pos: [-3, 8.8], size: [2.6, 11, 3.8], angle: 0.34 }, slide: [5.5, 10.5] },
  knife: { kind: 'knife', grip: [0, 10], gripAngle: Math.PI / 2 },
  he: { kind: 'nade', grip: [0, 0], gripAngle: 0.2 },
};

const cm = (v) => v / 100;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Converts the measured data into weapon-local vectors (origin at the right-hand grip).
export function buildRig(id) {
  const d = RIG_DATA[id];
  const g = V(0, cm(d.grip[0]), cm(d.grip[1]));
  const rel = (p, x = 0) => V(cm(x), cm(p[0]), cm(p[1])).sub(g);
  const a = d.gripAngle;
  // Grip axis runs down and back; "forward" is perpendicular to it in the side plane.
  const down = V(0, -Math.cos(a), Math.sin(a));
  const fwd = V(0, -Math.sin(a), -Math.cos(a));
  const r = {
    kind: d.kind,
    gripOffset: g, // from bbox centre to grip (used when building the model)
    grip: V(0, 0, 0),
    gripDown: down,
    // Right hand: palm on the right side of the grip, knuckles forward and slightly left.
    rightF: fwd.clone().multiplyScalar(0.92).add(V(-0.3, 0, 0)).normalize(),
    rightN: V(-1, 0, 0),
    trigger: d.trigger ? rel(d.trigger) : null,
    support: null, leftF: null, leftN: null,
    bolt: d.bolt ? rel(d.bolt, d.boltX || 0) : null,
    slide: d.slide ? rel(d.slide) : null,
    muzzle: d.muzzle ? rel(d.muzzle) : null,
    eject: d.eject ? rel(d.eject, 1.5) : null,
  };
  if (d.kind === 'rifle' || d.kind === 'bolt') {
    r.support = rel(d.support);
    r.leftF = V(0.72, 0.12, -0.6).normalize();
    r.leftN = V(0.1, 1, 0).normalize();
  } else if (d.kind === 'pistol') {
    r.support = rel(d.support, -1.2);
    r.leftF = V(0.25, -0.5, -0.83).normalize();
    r.leftN = V(1, 0.1, 0).normalize();
  } else if (d.kind === 'knife' || d.kind === 'nade') {
    // Overhand fist: forearm comes from the right, knuckles up, handle through the fist.
    r.rightF = V(-1, 0.15, -0.35).normalize();
    r.rightN = V(0, -1, 0);
  }
  // Magazine grab point and axis.
  if (d.mag) {
    const ma = rel(d.mag.a), mb = rel(d.mag.b);
    r.magCut = { a: V(0, cm(d.mag.a[0]), cm(d.mag.a[1])), b: V(0, cm(d.mag.b[0]), cm(d.mag.b[1])), r: cm(d.mag.r) };
    r.magAxis = mb.clone().sub(ma).normalize();
    r.magGrab = ma.clone().lerp(mb, 0.62).add(V(-0.028, 0, 0));
    r.magWell = ma.clone();
  } else if (d.procMag) {
    const p = rel(d.procMag.pos);
    r.procMag = { pos: p, size: d.procMag.size.map(cm), angle: d.procMag.angle };
    const axis = d.kind === 'pistol' ? down.clone() : V(0, -1, 0);
    r.magAxis = axis;
    r.magGrab = p.clone().addScaledVector(axis, cm(d.procMag.size[1]) * 0.5).add(V(-0.02, 0, 0));
    r.magWell = p.clone();
  }
  // Left hand orientation while holding a magazine: palm against its left face.
  r.grabF = V(0.15, -0.55, -0.82).normalize();
  r.grabN = V(1, 0, 0);
  return r;
}

const smooth = (x) => x * x * (3 - 2 * x);

// Reload choreography. Returns the left-hand target (weapon local), its orientation,
// the magazine state and a tilt for the whole weapon, for progress t in [0, 1].
export function reloadPose(rig, t, out = {}) {
  const kind = rig.kind;
  out.tilt = out.tilt || new THREE.Vector3(); // x: pitch, y: lift, z: roll
  out.left = out.left || new THREE.Vector3();
  const env = t < 0.12 ? smooth(t / 0.12) : t > 0.86 ? smooth((1 - t) / 0.14) : 1;
  const S = rig.support;
  const M = rig.magGrab;
  if (!S || !M) { out.leftMode = 'support'; out.left.copy(S || rig.grip); out.mag = 'rest'; out.tilt.set(0, 0, 0); return out; }
  const out1 = M.clone().addScaledVector(rig.magAxis, 0.14);
  const pouch = M.clone().add(new THREE.Vector3(-0.14, -0.38, 0.12));
  // After seating the magazine the left palm gives its base a firm slap.
  const bolt = M.clone().addScaledVector(rig.magAxis, 0.07).add(new THREE.Vector3(0.01, 0, 0));
  let keys;
  if (kind === 'pistol') {
    keys = [
      [0, S, 's'], [0.12, S.clone().add(new THREE.Vector3(-0.08, -0.12, 0.05)), 's'], [0.3, pouch, 'g'], [0.4, pouch, 'g'],
      [0.52, out1, 'g'], [0.62, M, 'g'], [0.68, M.clone().addScaledVector(rig.magAxis, 0.04), 'g'], [0.8, S, 's'], [1, S, 's'],
    ];
    out.mag = t < 0.12 ? 'rest' : t < 0.2 ? 'eject' : t < 0.4 ? 'hidden' : t < 0.62 ? 'hand' : 'rest';
    out.magEject = t >= 0.12 && t < 0.2 ? (t - 0.12) / 0.08 : 0;
    out.tilt.set(0.22 * env, 0.02 * env, -0.35 * env);
    // Slide release: a sharp snap once the magazine is home.
    if (t > 0.7 && t < 0.78) out.tilt.x -= Math.sin(((t - 0.7) / 0.08) * Math.PI) * 0.12;
  } else {
    keys = [
      [0, S, 's'], [0.1, M, 'g'], [0.14, M, 'g'], [0.26, out1, 'g'], [0.36, pouch, 'g'], [0.46, pouch, 'g'],
      [0.56, out1, 'g'], [0.64, M, 'g'], [0.7, bolt.clone().addScaledVector(rig.magAxis, 0.06), 'g'],
      [0.76, bolt, 'g'], [0.8, bolt.clone().addScaledVector(rig.magAxis, 0.05), 'g'], [1, S, 's'],
    ];
    out.mag = t < 0.14 ? 'rest' : t < 0.27 ? 'hand' : t < 0.44 ? 'drop' : t < 0.64 ? 'hand' : 'rest';
    out.tilt.set(0.2 * env, 0.015 * env, -0.55 * env);
    if (t > 0.6 && t < 0.7) out.tilt.x += Math.sin(((t - 0.6) / 0.1) * Math.PI) * 0.08;
    if (t > 0.76 && t < 0.84) out.tilt.z += Math.sin(((t - 0.76) / 0.08) * Math.PI) * 0.06;
  }
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, p0, m0] = keys[i], [t1, p1, m1] = keys[i + 1];
  const k = smooth(THREE.MathUtils.clamp((t - t0) / Math.max(1e-4, t1 - t0), 0, 1));
  out.left.copy(p0).lerp(p1, k);
  out.leftMode = (k < 0.5 ? m0 : m1) === 's' ? 'support' : 'grab';
  out.leftBlend = m0 === m1 ? (m0 === 's' ? 0 : 1) : (m1 === 'g' ? k : 1 - k);
  out.env = env;
  out.magFollow = M; // grab point on the magazine
  return out;
}
