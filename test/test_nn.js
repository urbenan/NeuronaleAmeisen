// Netz und Gehirn prüfen:  node test/test_nn.js
const { S, check, done } = require("./load");

let r = S(`(() => {
  const net = createNet(3, 2, 2, () => 0.5);
  net.W1.set([1, 0, 0, 1, 1, 1]); net.b1.set([0, -1]);
  net.W2.set([1, -1, 2, 0]); net.b2.set([0.5, 0]);
  const y = Array.from(netForward(net, [0.5, -0.5, 1]));
  const h0 = Math.tanh(0.5 + 1), h1 = Math.tanh(-0.5 + 1 - 1);
  const want = [Math.tanh(h0 + 2 * h1 + 0.5), Math.tanh(-h0)];
  return { y, want };
})()`);
check("Vorwärtsdurchlauf von Hand nachgerechnet", r.y.every((v, i) => Math.abs(v - r.want[i]) < 1e-12), r);

r = S(`(() => {
  const a = createBrain(42), b = createBrain(42), c = createBrain(43);
  return { same: a.W1.every((v, i) => v === b.W1[i]), differ: a.W1.some((v, i) => v !== c.W1[i]),
           nIn: a.nIn, nOut: a.nOut, params: netParamCount(a) };
})()`);
check("Gleicher Startwert -> gleiches Netz, anderer -> anderes", r.same && r.differ, r);
check("Topologie 28 -> 16 -> 18", r.nIn === 28 && r.nOut === 18 && r.params === 28 * 16 + 16 + 16 * 18 + 18, r);

r = S(`(() => {
  const a = createBrain(1), b = netClone(a);
  netMutate(b, 0.1, makeRng(7));
  let d = 0, n = 0;
  for (const k of ["W1", "b1", "W2", "b2"]) for (let i = 0; i < a[k].length; i++) { d += (a[k][i] - b[k][i]) ** 2; n++; }
  const back = netFromJSON(JSON.parse(JSON.stringify(netToJSON(b))));
  const maxErr = Math.max(...["W1", "b1", "W2", "b2"].map((k) => Math.max(...b[k].map((v, i) => Math.abs(v - back[k][i])))));
  return { rmsChange: Math.sqrt(d / n), maxErr };
})()`);
check("Mutation sigma 0.1 ändert Gewichte um ≈ 0.1", Math.abs(r.rmsChange - 0.1) < 0.02, r);
check("Speichern/Laden (JSON) verlustfrei bis 1e-6", r.maxErr < 1e-6, r);

r = S(`(() => {
  const ant = createAnt(0, 0, 90 * DEG);
  const x = brainInputs(ant, { intensity: 0.4, diff: 2 }, 0, 3);
  return { x: Array.from(x), min: Math.min(...x), max: Math.max(...x) };
})()`);
check("Eingänge im Bereich −1..+1", r.min >= -1 && r.max <= 1, { min: r.min, max: r.max, first: r.x.slice(0, 10) });

r = S(`(() => {
  const ant = createAnt(0, 0, 90 * DEG);
  applyBrainOutputs(ant, new Float64Array(18).fill(1));
  const hi = Array.from(ant.targets.slice(0, 3), (v) => Math.round(v / DEG));
  applyBrainOutputs(ant, new Float64Array(18).fill(-1));
  const lo = Array.from(ant.targets.slice(0, 3), (v) => Math.round(v / DEG));
  return { hi, lo };
})()`);
check("Ausgänge ±1 -> Gelenkgrenzen", r.hi.join() === "40,60,130" && r.lo.join() === "-40,-20,20", r);

r = S(`(() => {
  const world = { ...WORLD_DEFAULTS }, scent = { ...SCENT_DEFAULTS };
  const ctrl = createController(createBrain(5)), ant = createAnt(0, 0, 90 * DEG), dt = PHYSICS_DT;
  for (let t = 0; t < 10; t += dt) { controllerStep(ctrl, ant, senseScent(ant, scent), t); physicsStep(ant, world, dt); }
  return { x: ant.x, y: ant.y, ok: [ant.x, ant.y, ant.heading].every(Number.isFinite) };
})()`);
check("Zufallsnetz steuert 10 s ohne Absturz", r.ok, r);
// Zufallsnetze dürfen die Gelenke nicht zittern lassen (träge Muskeln, Netz mit 60 Hz)
r = S(`(() => {
  const world = { ...WORLD_DEFAULTS }, scent = { ...SCENT_DEFAULTS };
  let worst = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const ctrl = createController(createBrain(seed)), ant = createAnt(0, 0, 90 * DEG), dt = PHYSICS_DT;
    let prev = Float64Array.from(ant.joints), prevD = new Float64Array(18), flips = 0;
    for (let t = 0; t < 5; t += dt) {
      controllerStep(ctrl, ant, senseScent(ant, scent), t); physicsStep(ant, world, dt);
      for (let i = 0; i < 18; i++) { const d = ant.joints[i] - prev[i]; if (d * prevD[i] < -1e-12) flips++; prevD[i] = d; }
      prev.set(ant.joints);
    }
    worst = Math.max(worst, flips / 18 / 5);
  }
  return { worstReversalsPerJointPerS: worst };
})()`);
check("Kein Zittern: höchstens 30 Richtungswechsel pro Gelenk und Sekunde", r.worstReversalsPerJointPerS <= 30, r);
done();
