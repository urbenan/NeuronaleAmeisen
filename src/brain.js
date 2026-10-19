// Gehirn der Ameise: Sensoren -> Netz-Eingänge, Netz-Ausgänge -> Gelenk-Sollwerte.
//
// Eingänge (28), alle etwa im Bereich −1..+1:
//   Duft Stärke (0..1), Duft Richtung (−1 rechts .. +1 links)
//   Takt sin/cos: innerer Taktgeber, gibt dem Netz einen Rhythmus für den Gang
//   6 × Fusskontakt (1 = am Boden)
//   18 × Gelenkwinkel, auf den Gelenkbereich normiert (−1 = Minimum, +1 = Maximum)
// Ausgänge (18): Sollwert pro Gelenk, tanh −1..+1 -> Gelenkbereich (0 = Mitte)
//
// Wie bei echten Tieren ist die Steuerung träge: Das Netz rechnet nur rateHz-mal pro Sekunde,
// und die Muskeln folgen dem Befehl mit der Zeitkonstante muscleTau. Ohne das kann ein Netz die
// Gelenke mit 50–90 Hz zittern lassen, und die Füsse rutschen nur noch.

const BRAIN_DEFAULTS = { hidden: 16, clockHz: 3, rateHz: 60, muscleTau: 0.05 };

const INPUT_GROUPS = [
  { name: "Duft", from: 0, n: 2 },
  { name: "Takt", from: 2, n: 2 },
  { name: "Kontakt", from: 4, n: 6 },
  { name: "Winkel", from: 10, n: 18 },
];
const JOINT_SHORT = ["α", "β", "γ"];
const JOINT_LABELS = LEG_NAMES.flatMap((l) => JOINT_SHORT.map((j) => `${l} ${j}`));
const INPUT_NAMES = ["Duft Stärke", "Duft Richtung", "Takt sin", "Takt cos",
  ...LEG_NAMES.map((l) => `Kontakt ${l}`), ...JOINT_LABELS];
const OUTPUT_NAMES = JOINT_LABELS;
const N_IN = INPUT_NAMES.length, N_OUT = OUTPUT_NAMES.length;

function createBrain(seed, hidden = BRAIN_DEFAULTS.hidden) {
  return createNet(N_IN, hidden, N_OUT, makeRng(seed));
}

function brainInputs(ant, sense, t, clockHz, x = new Float64Array(N_IN)) {
  x[0] = sense.intensity;
  x[1] = Math.max(-1, Math.min(1, sense.diff));
  const ph = 2 * Math.PI * clockHz * t;
  x[2] = Math.sin(ph); x[3] = Math.cos(ph);
  for (let l = 0; l < 6; l++) x[4 + l] = ant.contact[l];
  for (let i = 0; i < 18; i++) {
    const [lo, hi] = JOINT_LIMITS[i % 3];
    x[10 + i] = (2 * ant.joints[i] / DEG - lo - hi) / (hi - lo);
  }
  return x;
}

// Muskel: Sollwert läuft dem Netz-Befehl mit Zeitkonstante tau nach (dt = Zeit seit letztem Befehl)
function applyBrainOutputs(ant, y, dt = Infinity, tau = BRAIN_DEFAULTS.muscleTau) {
  const f = Math.min(1, dt / tau);
  for (let i = 0; i < 18; i++) {
    const [lo, hi] = JOINT_LIMITS[i % 3];
    const want = (lo + (y[i] + 1) / 2 * (hi - lo)) * DEG;
    ant.targets[i] += (want - ant.targets[i]) * f;
  }
}

// Steuerung über die Zeit: ruft das Netz nur alle 1/rateHz Sekunden auf, dazwischen bleibt der Befehl.
function createController(net, params = BRAIN_DEFAULTS) {
  return { net, params, nextT: 0 };
}

// apply = false: Netz rechnet nur mit (für die Anzeige), steuert aber nicht
function controllerStep(ctrl, ant, sense, t, apply = true) {
  const p = ctrl.params, period = 1 / p.rateHz;
  if (t + 1e-9 >= ctrl.nextT) {
    brainInputs(ant, sense, t, p.clockHz, ctrl.net.x);
    netForward(ctrl.net, ctrl.net.x);
    ctrl.nextT += period;
  }
  // Muskel bei jedem Physikschritt nachführen
  if (apply) applyBrainOutputs(ant, ctrl.net.y, PHYSICS_DT, p.muscleTau);
}
