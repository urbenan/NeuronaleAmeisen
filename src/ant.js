// Ameise: Geometrie, Gelenke und Vorwärtskinematik.
// Einheiten: cm, s, Masse relativ (nur Verhältnisse zählen), Winkel intern in Radiant.
// Körperkoordinaten: x' nach vorne (zum Kopf), y' nach links, z nach oben.

const DEG = Math.PI / 180;

const LEG_NAMES = ["L1", "L2", "L3", "R1", "R2", "R3"];
const JOINT_NAMES = ["α Hüfte (dreh)", "β Hüfte (heben)", "γ Knie"];

// Gelenkgrenzen [min, max] in Grad, gleich für alle Beine
const JOINT_LIMITS = [
  [-40, 40],   // α: Drehung um die Hochachse, + = nach vorne
  [-20, 60],   // β: Oberschenkel heben, + = nach oben
  [20, 130],   // γ: Knie beugen, + = Unterschenkel nach unten
];
const JOINT_MAX_SPEED = 900 * DEG;  // rad/s
const JOINT_KP = 200;               // 1/s, wie schnell ein Gelenk dem Sollwert folgt

const ANT_GEOM = (() => {
  // 3 Massenpunkte entlang der Körperachse; x relativ zum Thorax-Mittelpunkt
  const segments = [
    { name: "Kopf", x: 0.42, m: 0.25, rx: 0.13, ry: 0.11 },
    { name: "Thorax", x: 0.12, m: 0.35, rx: 0.17, ry: 0.09 },
    { name: "Abdomen", x: -0.32, m: 0.6, rx: 0.25, ry: 0.17 },
  ];
  const mass = segments.reduce((s, g) => s + g.m, 0);
  const comX = segments.reduce((s, g) => s + g.m * g.x, 0) / mass;
  // Ab hier alles relativ zum Schwerpunkt
  for (const g of segments) g.x -= comX;
  const inertia = segments.reduce((s, g) => s + g.m * (g.x * g.x + (g.rx * g.rx + g.ry * g.ry) / 4), 0);

  const thoraxX = segments[1].x;
  const legs = [];
  const hipX = [0.08, 0.0, -0.08];      // relativ zum Thorax
  const restDeg = [45, 90, 135];         // Ruherichtung von oben, 0° = nach vorne
  for (let side = 0; side < 2; side++) {
    const s = side === 0 ? 1 : -1;       // links +1, rechts -1
    for (let i = 0; i < 3; i++) {
      legs.push({ name: LEG_NAMES[side * 3 + i], side: s, hipX: thoraxX + hipX[i], hipY: s * 0.07, rest: restDeg[i] * DEG });
    }
  }
  const head = segments[0];
  return {
    segments, mass, inertia, legs,
    hipHeight: 0.2, femur: 0.35, tibia: 0.45,
    // Fühler: zweiteilig (Schaft + Geissel), ab der Kopfspitze
    antenna: { baseX: head.x + head.rx * 0.8, baseY: 0.04, scape: 0.2, flag: 0.3, angle1: 35 * DEG, angle2: 20 * DEG },
  };
})();

function createAnt(x = 0, y = 0, heading = Math.PI / 2) {
  const joints = new Float64Array(18);
  for (let l = 0; l < 6; l++) joints.set(NEUTRAL_POSE[l], l * 3);
  const ant = {
    x, y, heading, vx: 0, vy: 0, omega: 0,
    joints, targets: Float64Array.from(joints),
    feet: [],          // pro Bein: Fuss in Körperkoordinaten {x, y, z}, Knie {kx, ky}
    contact: new Uint8Array(6),
    footForce: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
    slipping: new Uint8Array(6),
    anchors: Array.from({ length: 6 }, () => null),   // Haftpunkt des Fusses in Weltkoordinaten
    bellyFrac: 0,
  };
  updateKinematics(ant);
  return ant;
}

// Fuss- und Knieposition eines Beins in Körperkoordinaten
function legKinematics(leg, a, b, g) {
  const G = ANT_GEOM;
  const dir = leg.side * (leg.rest - a);           // Richtung von oben, + a schwenkt zum Kopf
  const cx = Math.cos(dir), cy = Math.sin(dir);
  const r1 = G.femur * Math.cos(b);
  const z1 = G.hipHeight + G.femur * Math.sin(b);
  const r2 = G.tibia * Math.cos(b - g);
  const z = z1 + G.tibia * Math.sin(b - g);
  return {
    kx: leg.hipX + cx * r1, ky: leg.hipY + cy * r1, kz: z1,
    x: leg.hipX + cx * (r1 + r2), y: leg.hipY + cy * (r1 + r2), z,
  };
}

// Inverse Kinematik: Gelenkwinkel [α, β, γ], damit der Fuss bei (fx, fy, fz) in Körperkoordinaten steht.
// Knie oben (wie bei der Ameise). Zu weite Ziele werden auf die maximale Reichweite gekürzt.
function legIK(leg, fx, fy, fz) {
  const G = ANT_GEOM, L1 = G.femur, L2 = G.tibia;
  const dx = fx - leg.hipX, dy = fy - leg.hipY;
  const a = leg.rest - leg.side * Math.atan2(dy, dx);
  const r = Math.hypot(dx, dy), dz = fz - G.hipHeight;
  const D = Math.min(Math.hypot(r, dz), 0.98 * (L1 + L2));
  const g = Math.acos(Math.max(-1, Math.min(1, (D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2))));
  const b = Math.atan2(dz, r) + Math.atan2(L2 * Math.sin(g), L1 + L2 * Math.cos(g));
  return [a, b, g];
}

// Grundstellung: Fuss in Ruherichtung, 0.5 cm von der Hüfte, knapp unter Bodenhöhe
const STANCE_REACH = 0.5, STANCE_Z = -0.01;
const NEUTRAL_FEET = ANT_GEOM.legs.map((leg) => {
  const dir = leg.side * leg.rest;
  return { x: leg.hipX + STANCE_REACH * Math.cos(dir), y: leg.hipY + STANCE_REACH * Math.sin(dir) };
});
const NEUTRAL_POSE = ANT_GEOM.legs.map((leg, l) => legIK(leg, NEUTRAL_FEET[l].x, NEUTRAL_FEET[l].y, STANCE_Z));

function updateKinematics(ant) {
  const j = ant.joints;
  ant.feet = ANT_GEOM.legs.map((leg, l) => legKinematics(leg, j[l * 3], j[l * 3 + 1], j[l * 3 + 2]));
}

function clampTarget(i, v) {
  const [lo, hi] = JOINT_LIMITS[i % 3];
  return Math.min(hi * DEG, Math.max(lo * DEG, v));
}

// Körperkoordinaten -> Welt
function toWorld(ant, px, py) {
  const c = Math.cos(ant.heading), s = Math.sin(ant.heading);
  return { x: ant.x + c * px - s * py, y: ant.y + s * px + c * py };
}

// Fühlerspitzen (später Duftsensoren): [links, rechts] in Weltkoordinaten
function antennaPoints(ant) {
  const A = ANT_GEOM.antenna;
  return [1, -1].map((s) => {
    const a1 = s * A.angle1, a2 = s * (A.angle1 + A.angle2);
    const bx = A.baseX, by = s * A.baseY;
    const ex = bx + A.scape * Math.cos(a1), ey = by + A.scape * Math.sin(a1);
    const tx = ex + A.flag * Math.cos(a2), ty = ey + A.flag * Math.sin(a2);
    return { base: toWorld(ant, bx, by), elbow: toWorld(ant, ex, ey), tip: toWorld(ant, tx, ty) };
  });
}
