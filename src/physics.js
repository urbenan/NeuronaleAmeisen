// Einfaches Physikmodell: starrer Körper in der Ebene (x, y, Drehung), Beine als Kinematik.
// Vortrieb entsteht nur durch Reibung an den Füssen, die den Boden berühren (z <= 0).
//
// Reibung pro Fuss ("Haften"): Beim Aufsetzen merkt sich der Fuss einen Ankerpunkt am Boden.
// Eine steife Feder mit Dämpfer hält ihn dort, begrenzt auf mu * N (Coulomb). Reicht die Reibung
// nicht, gleitet der Fuss und der Anker wandert mit. Die Kräfte werden implizit gelöst
// (3x3-Gleichungssystem für vx, vy, omega), damit die Simulation auch bei steifen Federn stabil bleibt.

const PHYSICS_DT = 1 / 240;   // fester Zeitschritt in s

const WORLD_DEFAULTS = {
  g: 981,              // cm/s²
  slopeDeg: 15,        // Neigung der Ebene; hangaufwärts = +y
  slopeXDeg: 0,        // seitliche Neigung; > 0: nach +x ansteigend (Viewer: iPhone seitlich kippen)
  mu: 0.8,             // Reibung Fuss/Boden
  muBelly: 0.6,        // Reibung, wenn der Bauch aufliegt
  minSupport: 3,       // weniger Standbeine -> Bauch trägt einen Teil des Gewichts
  legGive: 0.05,       // Nachgiebigkeit des Beins in cm: so weit federt ein Fuss unter 1/3 Körpergewicht
                       // seitlich, bevor er rutscht. Echte Beine sind elastisch; ganz steif müssten die
                       // Füsse geometrisch perfekt zusammenarbeiten, sonst rutscht immer einer.
  legDamping: 0.5,     // Dämpfungsgrad der Beinfeder (1 = kritisch gedämpft)
};

function moveJoints(ant, dt) {
  const j = ant.joints, t = ant.targets;
  const maxStep = JOINT_MAX_SPEED * dt;
  for (let i = 0; i < 18; i++) {
    const target = clampTarget(i, t[i]);
    const step = Math.max(-maxStep, Math.min(maxStep, JOINT_KP * (target - j[i]) * dt));
    j[i] += step;
  }
}

function solve3(A, b) {
  // Gauss-Elimination ohne Pivotsuche (A ist symmetrisch positiv definit)
  const M = [A[0].slice(), A[1].slice(), A[2].slice()], r = b.slice();
  for (let i = 0; i < 3; i++) {
    for (let k = i + 1; k < 3; k++) {
      const f = M[k][i] / M[i][i];
      for (let c = i; c < 3; c++) M[k][c] -= f * M[i][c];
      r[k] -= f * r[i];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = r[i];
    for (let c = i + 1; c < 3; c++) s -= M[i][c] * x[c];
    x[i] = s / M[i][i];
  }
  return x;
}

function physicsStep(ant, world, dt) {
  const G = ANT_GEOM;
  const m = G.mass, I = G.inertia;
  const slope = world.slopeDeg * DEG, slopeX = (world.slopeXDeg || 0) * DEG;

  // 1. Gelenke bewegen, Fussbewegung relativ zum Körper bestimmen
  const oldFeet = ant.feet;
  moveJoints(ant, dt);
  updateKinematics(ant);

  const c = Math.cos(ant.heading), s = Math.sin(ant.heading);
  const contacts = [];
  for (let l = 0; l < 6; l++) {
    const f = ant.feet[l], o = oldFeet[l];
    ant.contact[l] = f.z <= 0 ? 1 : 0;
    ant.slipping[l] = 0;
    ant.footForce[l].x = 0; ant.footForce[l].y = 0;
    if (!ant.contact[l]) { ant.anchors[l] = null; continue; }
    const rx = c * f.x - s * f.y, ry = s * f.x + c * f.y;   // Hebelarm in Weltrichtung
    if (!ant.anchors[l]) ant.anchors[l] = { x: ant.x + rx, y: ant.y + ry };
    const ulx = (f.x - o.x) / dt, uly = (f.y - o.y) / dt;
    contacts.push({
      leg: l, rx, ry,
      ux: c * ulx - s * uly, uy: s * ulx + c * uly,          // Fussgeschwindigkeit relativ zum Körper
      ex: ant.x + rx - ant.anchors[l].x, ey: ant.y + ry - ant.anchors[l].y,   // Abstand zum Anker
      mu: world.mu, N: 0, slip: false, fx: 0, fy: 0,
    });
  }

  // 2. Normalkräfte: Gewicht auf die Standbeine verteilt; bei zu wenigen trägt der Bauch
  //    (verteilt auf die 3 Körpersegmente) den Rest
  const Ntot = m * world.g * Math.cos(slope) * Math.cos(slopeX);
  const nLegs = contacts.length;
  ant.bellyFrac = Math.max(0, (world.minSupport - nLegs) / world.minSupport);
  for (const ct of contacts) ct.N = Ntot * (1 - ant.bellyFrac) / nLegs;
  if (ant.bellyFrac > 0) {
    for (const g of G.segments) {
      contacts.push({ leg: -1, rx: c * g.x, ry: s * g.x, ux: 0, uy: 0, ex: 0, ey: 0,
        mu: world.muBelly, N: Ntot * ant.bellyFrac * g.m / m, slip: false, fx: 0, fy: 0 });
    }
  }

  // 3. Haften/Gleiten implizit lösen
  // Feder kp und Dämpfer kd pro Fuss; implizit: F = -k * (v_rutsch + kp/k * Abstand) mit k = kd + kp*dt
  const kp = m * world.g / 3 / world.legGive;
  const kd = 2 * world.legDamping * Math.sqrt(kp * m / 3);
  const k = kd + kp * dt;
  for (const ct of contacts) { ct.ux += kp / k * ct.ex; ct.uy += kp / k * ct.ey; }
  const Fgx = -m * world.g * Math.sin(slopeX), Fgy = -m * world.g * Math.sin(slope);
  let sol = [ant.vx, ant.vy, ant.omega];
  for (let iter = 0; iter < 5; iter++) {
    const A = [[m, 0, 0], [0, m, 0], [0, 0, I]];
    const b = [m * ant.vx + dt * Fgx, m * ant.vy + dt * Fgy, I * ant.omega];
    for (const ct of contacts) {
      const jx = -ct.ry, jy = ct.rx;    // omega x r = omega * (jx, jy)
      if (ct.slip) {
        b[0] += dt * ct.fx; b[1] += dt * ct.fy; b[2] += dt * (jx * ct.fx + jy * ct.fy);
      } else {
        const kd = dt * k;
        A[0][0] += kd; A[1][1] += kd;
        A[0][2] += kd * jx; A[2][0] += kd * jx;
        A[1][2] += kd * jy; A[2][1] += kd * jy;
        A[2][2] += kd * (jx * jx + jy * jy);
        b[0] -= kd * ct.ux; b[1] -= kd * ct.uy; b[2] -= kd * (jx * ct.ux + jy * ct.uy);
      }
    }
    sol = solve3(A, b);
    let changed = false;
    for (const ct of contacts) {
      if (ct.slip) continue;
      const jx = -ct.ry, jy = ct.rx;
      const fx = -k * (sol[0] + sol[2] * jx + ct.ux);
      const fy = -k * (sol[1] + sol[2] * jy + ct.uy);
      const fmax = ct.mu * ct.N, fn = Math.hypot(fx, fy);
      if (fn > fmax) {
        ct.slip = true; ct.fx = fx / fn * fmax; ct.fy = fy / fn * fmax; changed = true;
      } else {
        ct.fx = fx; ct.fy = fy;
      }
    }
    if (!changed) break;
  }

  // 4. Integrieren
  ant.vx = sol[0]; ant.vy = sol[1]; ant.omega = sol[2];
  ant.x += ant.vx * dt; ant.y += ant.vy * dt; ant.heading += ant.omega * dt;
  for (const ct of contacts) {
    if (ct.leg < 0) continue;
    ant.footForce[ct.leg].x = ct.fx; ant.footForce[ct.leg].y = ct.fy;
    ant.slipping[ct.leg] = ct.slip ? 1 : 0;
    if (ct.slip) ant.anchors[ct.leg] = null;   // gleitender Fuss: neuer Anker im nächsten Schritt
  }
}
