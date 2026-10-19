// Nachahmungslernen: Das Netz lernt per Backpropagation (wie beim Ziffern-Projekt), den programmierten
// Dreifuss-Gang mit Duft-Lenkung nachzumachen. Danach verbessert die Evolution den Gang weiter.
//
// Lehrer: tripodTargets + scentSteer (gait.js, scent.js). Er steuert über dieselben trägen Muskeln wie
// das Netz. Damit die gewünschte Bewegung trotzdem genau ankommt, gibt er den Befehl als Umkehrung des
// Muskelfilters vor: u = Ziel + tau · (Änderungsrate des Ziels), dazu einen halben Netz-Takt Vorlauf.
// (Nur vorauszurechnen reichte nicht: Der Filter schwächt bei 3 Hz den Ausschlag auf ~73 % ab, die
// Ameise schleifte dann zur Hälfte der Zeit den Bauch und kam am Hang kaum voran.)
// DAgger: Runde 0 sammelt Daten, während der Lehrer läuft. Ab Runde 1 läuft das Netz selbst, und der
// Lehrer sagt für jede erreichte Situation, was er getan hätte. So lernt das Netz auch, sich aus eigenen
// kleinen Fehlern wieder zu fangen (reines Nachmachen entgleist sonst schnell).

const IMITATE_DEFAULTS = {
  episodes: 40, seconds: 8, maxSlope: 25,
  gait: { ...GAIT_DEFAULTS, freq: BRAIN_DEFAULTS.clockHz },   // Lehrer im Takt der inneren Uhr
  steerGain: 0.8,
};

// Befehle des Lehrers als Netz-Ausgänge (−1..+1 im Gelenkbereich)
function teacherOutputs(t, turn, p, out = new Float64Array(N_OUT)) {
  const pt = { ...p, turn }, h = PHYSICS_DT, lead = 0.5 / BRAIN_DEFAULTS.rateHz, tau = BRAIN_DEFAULTS.muscleTau;
  const at = (tt) => { const tmp = { targets: new Float64Array(18) }; tripodTargets(tmp, tt, pt); return tmp.targets; };
  const c = at(t + lead), a = at(t + lead + h), b = at(t + lead - h);
  for (let i = 0; i < 18; i++) {
    const [lo, hi] = JOINT_LIMITS[i % 3];
    const u = c[i] + tau * (a[i] - b[i]) / (2 * h);
    out[i] = Math.max(-0.98, Math.min(0.98, 2 * (u / DEG - lo) / (hi - lo) - 1));
  }
  return out;
}

// Episoden laufen lassen und (Eingang, Lehrer-Ausgang) bei jedem Netz-Takt sammeln.
// net = null: Lehrer steuert; sonst steuert das Netz (Lehrer gibt nur die Antwort vor).
function collectImitation(net, rng, opts = {}) {
  const o = { ...IMITATE_DEFAULTS, ...opts };
  const X = [], Y = [];
  let reached = 0, speed = 0, slip = 0, contact = 0;
  for (let e = 0; e < o.episodes; e++) {
    const world = { ...WORLD_DEFAULTS, slopeDeg: rng() * o.maxSlope, slopeXDeg: 0 };
    const scent = { ...SCENT_DEFAULTS, x: (rng() - 0.5) * 8 };
    const ant = createAnt((rng() - 0.5) * 6, 0, (90 + (rng() - 0.5) * 120) * DEG);
    const brain = net || createNet(N_IN, 1, N_OUT, () => 0.5);
    const ctrl = createController(brain, BRAIN_DEFAULTS, world);
    const period = 1 / BRAIN_DEFAULTS.rateHz;
    const yT = new Float64Array(N_OUT);
    let turn = 0, nextT = 0, t = 0;
    const d0 = Math.hypot(ant.x - scent.x, ant.y - scent.y);
    for (let s = 0; s < Math.round(o.seconds / PHYSICS_DT); s++) {
      const sense = senseScent(ant, scent);
      turn = scentSteer(turn, sense, o.steerGain, PHYSICS_DT);
      if (t + 1e-9 >= nextT) {
        nextT += period;
        const x = brainInputs(ant, sense, t, BRAIN_DEFAULTS.clockHz, new Float64Array(N_IN), world, true);
        teacherOutputs(t, turn, o.gait, yT);
        X.push(x); Y.push(Float64Array.from(yT));
        if (!net) ctrl.net.y.set(yT);      // Lehrer steuert über die Muskeln
      }
      if (net) controllerStep(ctrl, ant, sense, t);
      else applyBrainOutputs(ant, ctrl.net.y, PHYSICS_DT, BRAIN_DEFAULTS.muscleTau);
      physicsStep(ant, world, PHYSICS_DT);
      t += PHYSICS_DT;
      for (let l = 0; l < 6; l++) { contact += ant.contact[l]; slip += ant.slipping[l]; }
      if (Math.hypot(ant.x - scent.x, ant.y - scent.y) < 1) { reached++; break; }
    }
    speed += (d0 - Math.hypot(ant.x - scent.x, ant.y - scent.y)) / t;
  }
  return { X, Y, reached, episodes: o.episodes, speed: speed / o.episodes, slipFrac: contact ? slip / contact : 0 };
}

// Backpropagation mit Adam auf mittleren quadratischen Fehler, Minibatches
function trainImitation(net, X, Y, opts = {}) {
  const { epochs = 8, batch = 64, lr = 0.003, rng = Math.random } = opts;
  const { nIn, nHid, nOut } = net;
  const keys = ["W1", "b1", "W2", "b2"];
  if (!net.adam) net.adam = { t: 0, m: {}, v: {} };
  const A = net.adam;
  for (const k of keys) if (!A.m[k]) { A.m[k] = new Float64Array(net[k].length); A.v[k] = new Float64Array(net[k].length); }
  const g = Object.fromEntries(keys.map((k) => [k, new Float64Array(net[k].length)]));
  const dz2 = new Float64Array(nOut), dz1 = new Float64Array(nHid);
  const order = Array.from(X.keys());
  let loss = 0;
  for (let ep = 0; ep < epochs; ep++) {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    loss = 0;
    for (let b0 = 0; b0 < order.length; b0 += batch) {
      for (const k of keys) g[k].fill(0);
      const n = Math.min(batch, order.length - b0);
      for (let q = 0; q < n; q++) {
        const idx = order[b0 + q], x = X[idx], yt = Y[idx];
        netForward(net, x);
        const h = net.h, y = net.y;
        for (let k = 0; k < nOut; k++) {
          const d = y[k] - yt[k];
          loss += d * d;
          dz2[k] = 2 * d * (1 - y[k] * y[k]) / (n * nOut);
          g.b2[k] += dz2[k];
        }
        for (let j = 0; j < nHid; j++) {
          let s = 0;
          const row = j * nOut;
          for (let k = 0; k < nOut; k++) { g.W2[row + k] += h[j] * dz2[k]; s += net.W2[row + k] * dz2[k]; }
          dz1[j] = s * (1 - h[j] * h[j]);
          g.b1[j] += dz1[j];
        }
        for (let i = 0; i < nIn; i++) {
          const xi = x[i];
          if (xi === 0) continue;
          const row = i * nHid;
          for (let j = 0; j < nHid; j++) g.W1[row + j] += xi * dz1[j];
        }
      }
      // Adam
      A.t++;
      const b1c = 1 - Math.pow(0.9, A.t), b2c = 1 - Math.pow(0.999, A.t);
      for (const k of keys) {
        const p = net[k], m = A.m[k], v = A.v[k], gk = g[k];
        for (let i = 0; i < p.length; i++) {
          m[i] = 0.9 * m[i] + 0.1 * gk[i];
          v[i] = 0.999 * v[i] + 0.001 * gk[i] * gk[i];
          p[i] -= lr * (m[i] / b1c) / (Math.sqrt(v[i] / b2c) + 1e-8);
        }
      }
    }
    loss /= order.length * nOut;
  }
  return loss;
}

// Ganzer Ablauf: Runde 0 mit dem Lehrer, dann DAgger-Runden mit dem Netz; Daten werden gesammelt.
function imitate(seed, opts = {}) {
  const { rounds = 6, hidden = BRAIN_DEFAULTS.hidden, log = () => {} } = opts;
  const rng = makeRng(seed);
  const net = createBrain(seed, hidden);
  const X = [], Y = [];
  for (let r = 0; r <= rounds; r++) {
    const d = collectImitation(r === 0 ? null : net, rng, opts);
    X.push(...d.X); Y.push(...d.Y);
    const loss = trainImitation(net, X, Y, { rng, epochs: r === 0 ? 15 : 6 });
    log(`Runde ${r}: ${r === 0 ? "Lehrer" : "Netz "} lief: ${d.speed.toFixed(2)} cm/s zur Duftquelle, rutscht ${Math.round(100 * d.slipFrac)} % · Daten ${X.length}, Fehler danach ${loss.toFixed(4)}`);
  }
  delete net.adam;
  return net;
}
