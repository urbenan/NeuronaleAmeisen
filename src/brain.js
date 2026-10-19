// Gehirn der Ameise: Sensoren -> Netz-Eingänge, Netz-Ausgänge -> Gelenk-Sollwerte.
//
// Eingänge (30), alle etwa im Bereich −1..+1:
//   Duft Stärke (0..1), Duft Richtung (−1 rechts .. +1 links)
//   Takt sin/cos: innerer Taktgeber, gibt dem Netz einen Rhythmus für den Gang
//   6 × Fusskontakt (1 = am Boden)
//   18 × Gelenkwinkel, auf den Gelenkbereich normiert (−1 = Minimum, +1 = Maximum)
//   Hang vorne / Hang seitlich: Steigungssinn (wie die Schwerkraft-Sinneshaare echter Ameisen).
//     vorne > 0: vor mir geht es bergauf; seitlich > 0: links ist bergauf. ±1 entspricht etwa ±24°.
//     (Kamen erst später dazu – deshalb am Ende; ältere Netze mit 28 Eingängen werden beim Laden
//     mit Gewicht 0 für diese Eingänge erweitert und laufen damit unverändert weiter.)
// Ausgänge (18): Sollwert pro Gelenk, tanh −1..+1 -> Gelenkbereich (0 = Mitte)
//
// Wie bei echten Tieren ist die Steuerung träge: Das Netz rechnet nur rateHz-mal pro Sekunde,
// und die Muskeln folgen dem Befehl mit der Zeitkonstante muscleTau. Ohne das kann ein Netz die
// Gelenke mit 50–90 Hz zittern lassen, und die Füsse rutschen nur noch.

const BRAIN_DEFAULTS = { hidden: 16, clockHz: 3, rateHz: 60, muscleTau: 0.05, slopeSense: true };

const INPUT_GROUPS = [
  { name: "Duft", from: 0, n: 2 },
  { name: "Takt", from: 2, n: 2 },
  { name: "Kontakt", from: 4, n: 6 },
  { name: "Winkel", from: 10, n: 18 },
  { name: "Hang", from: 28, n: 2 },
];
const JOINT_SHORT = ["α", "β", "γ"];
const JOINT_LABELS = LEG_NAMES.flatMap((l) => JOINT_SHORT.map((j) => `${l} ${j}`));
const INPUT_NAMES = ["Duft Stärke", "Duft Richtung", "Takt sin", "Takt cos",
  ...LEG_NAMES.map((l) => `Kontakt ${l}`), ...JOINT_LABELS, "Hang vorne", "Hang seitlich"];
const OUTPUT_NAMES = JOINT_LABELS;
const N_IN = INPUT_NAMES.length, N_OUT = OUTPUT_NAMES.length;

function createBrain(seed, hidden = BRAIN_DEFAULTS.hidden) {
  return createNet(N_IN, hidden, N_OUT, makeRng(seed));
}

// Netz aus einer Datei; ältere Netze mit weniger Eingängen bekommen die neuen mit Gewicht 0
function brainFromJSON(o) {
  return netFromJSON(o, N_IN);
}

// Steigung in Körperrichtung: Aufwärts-Richtung des Hangs (sin der Neigungen) auf vorne/links projiziert
function slopeSense(ant, world) {
  if (!world) return [0, 0];
  const gx = Math.sin((world.slopeXDeg || 0) * DEG), gy = Math.sin((world.slopeDeg || 0) * DEG);
  const c = Math.cos(ant.heading), s = Math.sin(ant.heading);
  const k = 2.5, clamp = (v) => Math.max(-1, Math.min(1, v));
  return [clamp(k * (gx * c + gy * s)), clamp(k * (-gx * s + gy * c))];
}

function brainInputs(ant, sense, t, clockHz, x = new Float64Array(N_IN), world = null, useSlope = true) {
  x[0] = sense.intensity;
  x[1] = Math.max(-1, Math.min(1, sense.diff));
  const ph = 2 * Math.PI * clockHz * t;
  x[2] = Math.sin(ph); x[3] = Math.cos(ph);
  for (let l = 0; l < 6; l++) x[4 + l] = ant.contact[l];
  for (let i = 0; i < 18; i++) {
    const [lo, hi] = JOINT_LIMITS[i % 3];
    x[10 + i] = (2 * ant.joints[i] / DEG - lo - hi) / (hi - lo);
  }
  const [fwd, side] = useSlope ? slopeSense(ant, world) : [0, 0];
  x[28] = fwd; x[29] = side;
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
// world: für den Steigungssinn (ohne world spürt die Ameise keinen Hang)
function createController(net, params = BRAIN_DEFAULTS, world = null) {
  return { net, params: { ...BRAIN_DEFAULTS, ...params }, nextT: 0, world };
}

// apply = false: Netz rechnet nur mit (für die Anzeige), steuert aber nicht
function controllerStep(ctrl, ant, sense, t, apply = true) {
  const p = ctrl.params, period = 1 / p.rateHz;
  if (t + 1e-9 >= ctrl.nextT) {
    brainInputs(ant, sense, t, p.clockHz, ctrl.net.x, ctrl.world, p.slopeSense);
    netForward(ctrl.net, ctrl.net.x);
    ctrl.nextT += period;
  }
  // Muskel bei jedem Physikschritt nachführen
  if (apply) applyBrainOutputs(ant, ctrl.net.y, PHYSICS_DT, p.muscleTau);
}
