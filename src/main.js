// Oberfläche und Simulationsschleife: Physik + Test-Gang (Schritt 1), Duft + Fühler (Schritt 2),
// Netz + Netz-Anzeige (Schritt 3), Lernen per Neuroevolution (Schritt 4).

const DT = PHYSICS_DT;
const world = { ...WORLD_DEFAULTS, slopeDeg: 0, scent: { ...SCENT_DEFAULTS }, goalY: SCENT_DEFAULTS.y };
const gait = { ...GAIT_DEFAULTS };
const start = { headingDeg: 90 };
const view = { cx: 0, cy: 0, scale: 120, trail: [], showForces: true, forceScale: 0, sense: true };

let netSeed = 1, ctrl = createController(createBrain(netSeed));
const netView = { mode: "weights", hover: null, pinned: false };
let matHover = null;

let ant, sense, simTime, running = true, speed = 1, mode = "gait", follow = true, stopAtGoal = true;
let goalTime = null, vSmooth = 0, gaitHistory = [], stepCount = 0;

const $ = (id) => document.getElementById(id);

function reset(headingDeg = start.headingDeg) {
  ant = createAnt(0, 0, headingDeg * DEG);
  sense = senseScent(ant, world.scent);
  gait.turn = 0;
  ctrl.nextT = 0;
  simTime = 0; goalTime = null; vSmooth = 0; gaitHistory = []; stepCount = 0;
  view.cx = ant.x; view.cy = ant.y; view.trail = [{ x: 0, y: 0 }];
}

// ---------- Schieberegler für Welt und Gang ----------
const SLIDERS = [
  { obj: world, key: "slopeDeg", label: "Neigung", min: 0, max: 45, step: 1, fmt: (v) => v + "°" },
  { obj: world, key: "mu", label: "Reibung μ", min: 0.1, max: 1.5, step: 0.05, fmt: (v) => v.toFixed(2) },
  { obj: gait, key: "freq", label: "Schrittfrequenz", min: 0.5, max: 6, step: 0.1, fmt: (v) => v.toFixed(1) + " Hz", gait: true },
  { obj: gait, key: "stride", label: "Schrittlänge (halb)", min: 0.05, max: 0.3, step: 0.01, fmt: (v) => v.toFixed(2) + " cm", gait: true },
  { obj: gait, key: "lift", label: "Hubhöhe Fuss", min: 0, max: 0.3, step: 0.01, fmt: (v) => v.toFixed(2) + " cm", gait: true },
  { obj: gait, key: "turn", label: "Lenkung (− rechts, + links)", min: -1, max: 1, step: 0.05, fmt: (v) => v.toFixed(2), gait: true, steer: true },
  { obj: world.scent, key: "x", label: "Duftquelle seitlich", min: -10, max: 10, step: 0.5, fmt: (v) => v.toFixed(1) + " cm" },
  { obj: world.scent, key: "lambda", label: "Duft-Reichweite λ", min: 3, max: 30, step: 1, fmt: (v) => v + " cm" },
  { obj: world.scent, key: "noise", label: "Messrauschen Fühler", min: 0, max: 0.3, step: 0.01, fmt: (v) => Math.round(v * 100) + " %" },
  { obj: start, key: "headingDeg", label: "Startrichtung (setzt zurück)", min: 0, max: 360, step: 15, fmt: (v) => v + "°", onChange: () => reset() },
];
// Lern-Einstellungen
const learn = { on: false, tempo: "fast", evo: null, envKey: "", rate: 0, seconds: 15, lambda: 8, slipWeight: 1,
  curriculum: true, target: 20, step: 2, starts: 3, demoIdx: 0 };
const START_SETS = { 1: [90], 3: [90, 50, 130] };
SLIDERS.push(
  { box: "learn-sliders", obj: learn, key: "seconds", label: "Episodendauer", min: 3, max: 30, step: 1, fmt: (v) => v + " s" },
  { box: "learn-sliders", obj: learn, key: "lambda", label: "Varianten pro Generation", min: 1, max: 16, step: 1, fmt: (v) => v,
    onChange: () => { if (learn.evo) learn.evo.lambda = learn.lambda; $("lr-lambda").textContent = learn.lambda; } },
  { box: "learn-sliders", obj: learn, key: "slipWeight", label: "Rutschen zählt nicht (Gewichtung)", min: 0, max: 1, step: 0.1, fmt: (v) => Math.round(v * 100) + " %" },
  { box: "learn-sliders", obj: learn, key: "target", label: "Ziel-Neigung (Curriculum)", min: 2, max: 35, step: 1, fmt: (v) => v + "°", cur: true },
  { box: "learn-sliders", obj: learn, key: "step", label: "Stufe (Curriculum)", min: 1, max: 6, step: 1, fmt: (v) => "+" + v + "°", cur: true },
);
const sliderEls = SLIDERS.map((s) => {
  const wrap = document.createElement("label");
  wrap.className = "slider";
  wrap.innerHTML = `<span>${s.label}</span><output></output><input type="range" min="${s.min}" max="${s.max}" step="${s.step}">`;
  const inp = wrap.querySelector("input"), out = wrap.querySelector("output");
  inp.value = s.obj[s.key]; out.textContent = s.fmt(+inp.value);
  inp.addEventListener("input", () => { s.obj[s.key] = +inp.value; out.textContent = s.fmt(+inp.value); if (s.onChange) s.onChange(); });
  $(s.box || "sliders").appendChild(wrap);
  return { s, wrap, inp, out };
});

// ---------- Gelenk-Tabelle: Anzeige im Gang-Modus, Sollwerte in der Handsteuerung ----------
const jointInputs = [];
(() => {
  const box = $("joints");
  box.innerHTML = `<span></span>` + JOINT_NAMES.map((n) => `<span class="hd">${n}</span>`).join("");
  for (let l = 0; l < 6; l++) {
    const name = document.createElement("span");
    name.className = "leg"; name.textContent = LEG_NAMES[l];
    box.appendChild(name);
    for (let j = 0; j < 3; j++) {
      const [lo, hi] = JOINT_LIMITS[j];
      const cell = document.createElement("label");
      cell.className = "joint";
      cell.innerHTML = `<input type="range" min="${lo}" max="${hi}" step="1" aria-label="${LEG_NAMES[l]} ${JOINT_NAMES[j]}"><output></output>`;
      const inp = cell.querySelector("input"), out = cell.querySelector("output");
      const i = l * 3 + j;
      inp.addEventListener("input", () => {
        if (mode !== "hand") return;
        ant.targets[i] = +inp.value * DEG;
        if (allLegs.checked) for (let k = 0; k < 6; k++) ant.targets[k * 3 + j] = +inp.value * DEG;
      });
      box.appendChild(cell);
      jointInputs.push({ inp, out });
    }
  }
})();
const allLegs = (() => {
  const row = document.createElement("div");
  row.className = "group";
  row.innerHTML = `<button>Grundstellung</button><label class="check"><input type="checkbox"> gleiches Gelenk an allen Beinen</label>`;
  row.querySelector("button").addEventListener("click", () => { for (let l = 0; l < 6; l++) ant.targets.set(NEUTRAL_POSE[l], l * 3); });
  $("joints").before(row);
  return row.querySelector("input");
})();

function updateJointInputs() {
  for (let i = 0; i < 18; i++) {
    const { inp, out } = jointInputs[i];
    const shown = mode === "hand" ? ant.targets[i] : ant.joints[i];
    if (document.activeElement !== inp) inp.value = Math.round(shown / DEG);
    out.textContent = Math.round(ant.joints[i] / DEG) + "°";
    inp.disabled = mode !== "hand";
  }
}

// ---------- Bedienung ----------
function setRunning(on) { running = on; $("run").textContent = running ? "Pause" : goalTime !== null ? "Weiter" : "Start"; }
$("run").addEventListener("click", () => setRunning(!running));
$("stop-goal").addEventListener("change", (e) => { stopAtGoal = e.target.checked; });
$("reset").addEventListener("click", () => { reset(); setRunning(true); });
$("follow").addEventListener("change", (e) => { follow = e.target.checked; updateSliderStates(); });
$("forces").addEventListener("change", (e) => { view.showForces = e.target.checked; });
document.querySelectorAll('input[name="speed"]').forEach((r) => r.addEventListener("change", () => { speed = +r.value; }));
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", () => {
  mode = r.value;
  if (mode === "hand") ant.targets.set(ant.joints);
  updateSliderStates();
}));
function updateSliderStates() {
  for (const { s, wrap, inp } of sliderEls) {
    const off = (s.gait && mode !== "gait") || (s.steer && follow) || (s.cur && !learn.curriculum) ||
      (s.obj === world && s.key === "slopeDeg" && learn.curriculum && learn.evo);
    wrap.classList.toggle("off", off); inp.disabled = off;
  }
}
// Lenkregler zeigt im Duft-Modus den aktuellen Wert der Test-Lenkung
const turnSlider = sliderEls.find((e) => e.s.steer);
updateSliderStates();

// Zoom mit Mausrad und Zwei-Finger-Geste
const cv = $("world");
cv.addEventListener("wheel", (e) => {
  e.preventDefault();
  view.scale = Math.min(250, Math.max(15, view.scale * Math.exp(-e.deltaY * 0.0015)));
}, { passive: false });
const touches = new Map();
let pinchStart = null;
cv.addEventListener("pointerdown", (e) => { touches.set(e.pointerId, e); if (touches.size === 2) pinchStart = { d: pinchDist(), s: view.scale }; });
cv.addEventListener("pointermove", (e) => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, e);
  if (pinchStart && touches.size === 2) view.scale = Math.min(250, Math.max(15, pinchStart.s * pinchDist() / pinchStart.d));
});
for (const ev of ["pointerup", "pointercancel"]) cv.addEventListener(ev, (e) => { touches.delete(e.pointerId); pinchStart = null; });
function pinchDist() { const [a, b] = [...touches.values()]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1; }

// ---------- Simulation ----------
function simStep() {
  sense = senseScent(ant, world.scent);
  if (follow) gait.turn = scentSteer(gait.turn, sense, 0.8, DT);
  if (mode === "gait") tripodTargets(ant, simTime, gait);
  controllerStep(ctrl, ant, sense, simTime, mode === "net");
  physicsStep(ant, world, DT);
  simTime += DT;
  vSmooth += (ant.vy - vSmooth) * Math.min(1, DT / 0.5);
  if (goalTime === null && ant.y >= world.goalY) {
    goalTime = simTime;
    if (stopAtGoal && !learn.on) setRunning(false);
  }
  // Beim Lernen: Vorführung des besten Netzes immer wieder neu starten (mit dem neuesten besten Netz)
  if (learn.on && mode === "net" && (simTime >= learn.seconds || goalTime !== null)) restartDemo();
  if (++stepCount % 2 === 0) {
    gaitHistory.push(Array.from(ant.contact, (c, l) => (c ? (ant.slipping[l] ? 2 : 1) : 0)));
    if (gaitHistory.length > GAIT_HISTORY) gaitHistory.shift();
  }
  if (stepCount % 24 === 0) {
    view.trail.push({ x: ant.x, y: ant.y });
    if (view.trail.length > 2000) view.trail.shift();
  }
}

let last = performance.now(), acc = 0;
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (learn.on) learnFrame();
  if (running) {
    acc += real * speed;
    while (running && acc >= DT) { simStep(); acc -= DT; }
  }
  view.cx += (ant.x - view.cx) * 0.15;
  view.cy += (ant.y - view.cy) * 0.15;
  view.forceScale = 2.5 / (ANT_GEOM.mass * world.g);
  drawWorld(cv, world, ant, view);
  drawGait($("gait"), gaitHistory);
  drawNetPanel();
  drawLearnPanel();
  updateStats();
  updateJointInputs();
  requestAnimationFrame(frame);
}

function updateStats() {
  $("st-t").textContent = simTime.toFixed(1) + " s";
  $("st-y").textContent = ant.y.toFixed(1) + " cm";
  $("st-v").textContent = vSmooth.toFixed(2) + " cm/s";
  $("st-legs").textContent = ant.contact.reduce((a, b) => a + b, 0) + (ant.bellyFrac > 0 ? " (Bauch am Boden)" : "");
  $("st-slip").textContent = ant.slipping.reduce((a, b) => a + b, 0);
  $("st-goal").textContent = goalTime !== null ? `erreicht: ${goalTime.toFixed(1)} s` : `${world.goalY} cm`;
  $("st-goal-box").classList.toggle("win", goalTime !== null);

  // Fühler: Balken = gemessene Konzentration; Richtung: Mitte = geradeaus, links/rechts = Duft von dort
  $("se-l").style.width = (sense.left * 100).toFixed(1) + "%";
  $("se-r").style.width = (sense.right * 100).toFixed(1) + "%";
  $("se-lv").textContent = sense.left.toFixed(3);
  $("se-rv").textContent = sense.right.toFixed(3);
  const d = Math.max(-1, Math.min(1, sense.diff));
  const bar = $("se-d");
  bar.style.left = (50 - Math.max(0, d) * 50) + "%";
  bar.style.width = (Math.abs(d) * 50) + "%";
  $("se-dv").textContent = (sense.diff >= 0 ? "+" : "") + sense.diff.toFixed(2);
  const dist = Math.hypot(ant.x - world.scent.x, ant.y - world.scent.y);
  const where = Math.abs(sense.diff) < 0.15 ? "geradeaus (oder genau hinten)" : sense.diff > 0 ? "links" : "rechts";
  $("se-text").textContent = `Duft kommt von ${where} · Abstand zur Quelle ${dist.toFixed(1)} cm`;
  if (follow) { turnSlider.inp.value = gait.turn; turnSlider.out.textContent = turnSlider.s.fmt(gait.turn); }
}

// ---------- Netz-Anzeige ----------
$("net-new").addEventListener("click", newNet);
document.querySelectorAll('input[name="lines"]').forEach((r) => r.addEventListener("change", () => {
  netView.mode = r.value;
  $("line-what").textContent = r.value === "flow" ? "Signal = Gewicht × Aktivierung der Quelle" : "Gewichte";
}));
const netCv = $("net");
netCv.addEventListener("pointermove", (e) => {
  if (netView.pinned) return;
  const b = netCv.getBoundingClientRect();
  netView.hover = netHit(netView, e.clientX - b.left, e.clientY - b.top);
});
netCv.addEventListener("pointerleave", () => { if (!netView.pinned) netView.hover = null; });
// Antippen/Klicken hält die Auswahl fest, nochmals tippen löst sie
netCv.addEventListener("click", (e) => {
  const b = netCv.getBoundingClientRect();
  const hit = netHit(netView, e.clientX - b.left, e.clientY - b.top);
  const same = hit && netView.hover && hit.layer === netView.hover.layer && hit.idx === netView.hover.idx && netView.pinned;
  netView.hover = same ? null : hit;
  netView.pinned = !!netView.hover;
});
const matrices = {};
for (const id of ["w1", "w2"]) {
  const cv = $(id);
  cv.addEventListener("pointermove", (e) => {
    const b = cv.getBoundingClientRect();
    const hit = matrices[id] && matrices[id].hit(e.clientX - b.left, e.clientY - b.top);
    matHover = hit ? { id, ...hit } : null;
  });
  cv.addEventListener("pointerleave", () => { matHover = null; });
}

function drawNetPanel() {
  const net = ctrl.net, sel = netView.hover;
  const which = learn.evo ? `bestes Netz nach Generation ${ctrl.gen || 0}` : "Zufallsnetz";
  $("net-title").textContent = "– " + which + (mode === "net" ? ", steuert die Ameise" : ", rechnet nur mit (Steuerung: " + (mode === "gait" ? "Dreifuss-Gang" : "Hand") + ")");
  $("net-seed").textContent = `Startwert ${netSeed} · ${netParamCount(net)} Gewichte und Schwellen`;
  drawNet(netCv, net, netView);
  $("net-info").textContent = netHoverText(net, sel);
  const hidLabels = Array.from({ length: net.nHid }, (_, j) => "N" + (j + 1));
  const hl1 = sel ? (sel.layer === 0 ? { row: sel.idx } : sel.layer === 1 ? { col: sel.idx } : null) : null;
  const hl2 = sel ? (sel.layer === 1 ? { row: sel.idx } : sel.layer === 2 ? { col: sel.idx } : null) : null;
  matrices.w1 = drawMatrix($("w1"), net.W1, net.nIn, net.nHid, INPUT_NAMES, hidLabels, hl1);
  matrices.w2 = drawMatrix($("w2"), net.W2, net.nHid, net.nOut, hidLabels, OUTPUT_NAMES.map((n) => n.split(" ")[0]), hl2, 3);
  $("w1max").textContent = "Skala ±" + matrices.w1.max.toFixed(2);
  $("w2max").textContent = "Skala ±" + matrices.w2.max.toFixed(2);
  if (matHover) {
    const [rl, cl] = matHover.id === "w1" ? [INPUT_NAMES, hidLabels] : [hidLabels, OUTPUT_NAMES];
    $("mat-info").textContent = `${matHover.id.toUpperCase()}: ${rl[matHover.r]} → ${(matHover.id === "w2" ? OUTPUT_NAMES : cl)[matHover.c]} = ${matHover.v >= 0 ? "+" : "−"}${Math.abs(matHover.v).toFixed(3)}`;
  }
}

// ---------- Lernen ----------
const LEARN_BUDGET = { watch: 5, fast: 40, turbo: 250 };   // Rechenzeit pro Bild in ms (mind. 1 Episode)

// Lernwelt = die Welt, die oben eingestellt ist; mit Curriculum bestimmt das Lernen die Neigung.
// Startrichtungen: 1 = wie oben eingestellt, 3 = zusätzlich ±40° daneben
function learnStarts() {
  return learn.starts === 1 ? [start.headingDeg] : [start.headingDeg, start.headingDeg - 40, start.headingDeg + 40];
}
function learnEpisodeOpts() {
  return {
    seconds: learn.seconds, slipWeight: learn.slipWeight,
    world: { slopeDeg: world.slopeDeg, mu: world.mu }, scent: { ...world.scent },
    starts: learnStarts(),
  };
}

function learnFrame() {
  if (learn.evo && learn.curriculum) world.slopeDeg = currentSlope(learn.evo);   // Curriculum führt
  const opts = learnEpisodeOpts(), key = JSON.stringify(opts);
  if (!learn.evo) {
    learn.evo = createEvolution(netSeed, { parent: ctrl.net, lambda: learn.lambda, episode: opts,
      curriculum: learn.curriculum ? { slope: world.slopeDeg, target: learn.target, step: learn.step } : null });
    updateSliderStates();
  } else if (key !== learn.envKey) {
    // Welt oder Regeln geändert: bestes Netz unter den neuen Bedingungen neu bewerten
    learn.evo.episode = opts; learn.evo.pending = null;
    learn.evo.best = evaluate(learn.evo.parent, opts);
  }
  const c = learn.evo.curriculum;
  if (c) { c.target = learn.target; c.step = learn.step; }
  learn.envKey = key;
  const t0 = performance.now(), budget = LEARN_BUDGET[learn.tempo];
  let n = 0;
  do {
    const h = evolveTick(learn.evo);
    n += learnStarts().length;
    if (h && h.levelUp) { world.slopeDeg = h.slope; learn.envKey = JSON.stringify(learnEpisodeOpts()); syncSlider(); }
  } while (performance.now() - t0 < budget);
  const dt = (performance.now() - (learn.lastT || t0)) / 1000;
  learn.lastT = performance.now();
  if (dt > 0 && dt < 2) learn.rate += (n / dt - learn.rate) * 0.1;
}

// Vorführung: bestes Netz, reihum aus jeder Startrichtung
function restartDemo() {
  ctrl = createController(netClone(learn.evo.parent));
  ctrl.gen = learn.evo.generation;
  const starts = learnStarts();
  reset(starts[learn.demoIdx++ % starts.length]);
}

function syncSlider() {
  for (const e of sliderEls) if (e.s.obj === world && e.s.key === "slopeDeg") { e.inp.value = world.slopeDeg; e.out.textContent = e.s.fmt(world.slopeDeg); }
}

$("cur-on").addEventListener("change", (e) => {
  learn.curriculum = e.target.checked;
  if (learn.evo) learn.evo.curriculum = learn.curriculum ? { ...CURRICULUM_DEFAULTS, slope: world.slopeDeg, target: learn.target, step: learn.step } : null;
  updateSliderStates();
});
document.querySelectorAll('input[name="starts"]').forEach((r) => r.addEventListener("change", () => { learn.starts = +r.value; }));

function setLearning(on) {
  learn.on = on;
  $("learn").textContent = on ? "Lernen pausieren" : learn.evo ? "Weiter lernen" : "Lernen starten";
  if (on) {
    if (mode !== "net") $("m-net").click();
    learnFrame();
    restartDemo();
    setRunning(true);
  } else if (learn.evo) {
    restartDemo();
    autoSave();
  }
}
$("learn").addEventListener("click", () => setLearning(!learn.on));
$("learn-reset").addEventListener("click", newNet);
document.querySelectorAll('input[name="tempo"]').forEach((r) => r.addEventListener("change", () => { learn.tempo = r.value; learn.rate = 0; }));

// Neues Zufallsnetz: Lernen beginnt von vorn
function newNet() {
  netSeed = 1 + Math.floor(Math.random() * 99999);
  ctrl = createController(createBrain(netSeed));
  learn.evo = null; learn.envKey = ""; learn.rate = 0; learn.demoIdx = 0;
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* egal */ }
  $("lr-store").textContent = "Neues Zufallsnetz – der Lernstand wird automatisch in diesem Browser gesichert.";
  if (learn.curriculum) { world.slopeDeg = 0; syncSlider(); }
  setLearning(false);
  updateSliderStates();
  reset();
}

function drawLearnPanel() {
  const e = learn.evo;
  drawLearnCurve($("curve"), e ? e.history : [], e && e.curriculum ? e.curriculum.target : null);
  $("lr-title").textContent = e ? `– Startnetz ${netSeed}` + (learn.on ? `, lernt (${learn.tempo === "turbo" ? "Turbo" : learn.tempo})` : ", pausiert") : "";
  $("lr-gen").textContent = e ? e.generation : 0;
  $("lr-eps").textContent = e ? e.episodes * (e.best.runs || 1) : 0;
  $("lr-rate").textContent = learn.on && learn.rate ? Math.round(learn.rate) : "–";
  const c = e && e.curriculum;
  $("lr-slope").textContent = e ? (c ? `${currentSlope(e)}° von ${c.target}°` : `${currentSlope(e)}°`) : "–";
  $("lr-slope-box").classList.toggle("win", !!(c && currentSlope(e) >= c.target && e.best.reachedCount === e.best.runs));
  $("lr-weg").textContent = e ? e.best.progress.toFixed(1) + " cm" : "–";
  $("lr-slip").textContent = e ? Math.round(100 * e.best.slipFrac) + " %" : "–";
  $("lr-sigma").textContent = e ? `${e.sigma.toFixed(2)} · ${e.generation ? Math.round(100 * e.accepted / e.generation) : 0}%` : "–";
  $("lr-goal").textContent = !e ? "–" : `${e.best.reachedCount}/${e.best.runs}` + (e.best.reached !== null ? ` in ${e.best.reached.toFixed(1)} s` : "");
  $("lr-goal-box").classList.toggle("win", !!(e && e.best.reached !== null));
}

// ---------- Lernstand sichern ----------
// Automatisch im Browser (localStorage, alle 5 s beim Lernen und beim Pausieren) und als Datei.
const STORE_KEY = "neuronale-ameisen-lernstand";
const UI_KEYS = ["seconds", "lambda", "slipWeight", "curriculum", "target", "step", "starts"];

function saveState() {
  return evoToJSON(learn.evo, { netSeed, ui: Object.fromEntries(UI_KEYS.map((k) => [k, learn[k]])), mu: world.mu });
}
function autoSave() {
  if (!learn.evo) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(saveState()));
    $("lr-store").textContent = `Lernstand im Browser gesichert (${new Date().toLocaleTimeString("de-CH")}). Beim nächsten Öffnen geht es hier weiter.`;
  } catch (e) {
    $("lr-store").textContent = "Automatisches Sichern im Browser nicht möglich – «Speichern (.json)» benutzen.";
  }
}
setInterval(() => { if (learn.on) autoSave(); }, 5000);

function applyState(o, source) {
  const evo = evoFromJSON(o);
  learn.on = false;
  learn.evo = evo;
  netSeed = o.netSeed || evo.seed;
  if (o.ui) for (const k of UI_KEYS) if (k in o.ui) learn[k] = o.ui[k];
  if (o.mu) world.mu = o.mu;
  if (evo.episode.scent) Object.assign(world.scent, evo.episode.scent);
  if (evo.episode.starts) start.headingDeg = evo.episode.starts[0];
  world.slopeDeg = currentSlope(evo);
  learn.envKey = JSON.stringify(learnEpisodeOpts());
  evo.episode = learnEpisodeOpts();
  // Bedienelemente nachführen
  for (const e of sliderEls) { e.inp.value = e.s.obj[e.s.key]; e.out.textContent = e.s.fmt(e.s.obj[e.s.key]); }
  $("cur-on").checked = learn.curriculum;
  $("st-" + learn.starts).checked = true;
  $("lr-lambda").textContent = learn.lambda;
  if (mode !== "net") $("m-net").click();
  setLearning(false);
  updateSliderStates();
  const when = new Date(o.saved).toLocaleString("de-CH");
  $("lr-store").textContent = `${source}: Lernstand vom ${when}, Generation ${evo.generation}, Neigung ${currentSlope(evo)}°. «Weiter lernen» setzt fort.`;
}

$("save").addEventListener("click", () => {
  if (!learn.evo) { $("lr-store").textContent = "Noch nichts gelernt – zuerst «Lernen starten»."; return; }
  const blob = new Blob([JSON.stringify(saveState())], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ameise-gen${learn.evo.generation}-${currentSlope(learn.evo)}grad.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  autoSave();
});
$("load").addEventListener("click", () => $("load-file").click());
$("load-file").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  f.text().then((t) => applyState(JSON.parse(t), `Geladen aus ${f.name}`))
    .catch((err) => { $("lr-store").textContent = "Laden fehlgeschlagen: " + err.message; });
  e.target.value = "";
});

reset();
try {
  const saved = localStorage.getItem(STORE_KEY);
  if (saved) applyState(JSON.parse(saved), "Aus dem Browser");
} catch (e) { /* kein Speicher oder alter Stand: frisch beginnen */ }
requestAnimationFrame(frame);
