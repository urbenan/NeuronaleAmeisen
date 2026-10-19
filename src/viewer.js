// Viewer fürs iPhone: trainierte Ameisen im Vollbild, die Neigung kommt vom Lagesensor.
// Bildschirm = Boden. Oberkante anheben -> bergauf nach oben, seitlich kippen -> seitlich geneigt.
// «Nullpunkt»: aktuelle Haltung gilt als flach. Antippen versetzt die Duftquelle.
// Wer an der Duftquelle ankommt oder aus dem Bild rutscht, startet unten neu.

// Beim Bündeln (build_web.py) wird hier eine trainierte Kolonie eingesetzt
const EMBEDDED_ANTS = /*__TRAINED__*/null;

const MAIN_STORE = "neuronale-ameisen-lernstand";    // Lernstand der Hauptseite (gleiche Adresse)
const VIEWER_STORE = "neuronale-ameisen-viewer";     // im Viewer geladene Datei
const MAX_SLOPE = 45, FIELD_CM = 14;                 // Bildbreite in cm
const DT = PHYSICS_DT;

const world = { ...WORLD_DEFAULTS, slopeDeg: 0, slopeXDeg: 0, scent: { ...SCENT_DEFAULTS } };
const cv = document.getElementById("cv");
const $ = (id) => document.getElementById(id);
let ants = [], arrived = 0, sourceName = "";
let field = { w: 0, h: 0, scale: 30, x0: 0, x1: 0, y0: 0, y1: 0 };
const rng = makeRng(Date.now() >>> 0);

// ---------- Netze laden ----------
function netsFrom(o) {
  if (o.members) return o.members.map((m) => brainFromJSON(m.net));     // Kolonie
  if (o.net) return [brainFromJSON(o.net)];                             // eine Ameise
  throw new Error("Keine Ameisen in der Datei");
}
function describe(o) {
  const kind = o.members ? `Kolonie, ${o.members.length} Ameisen` : "eine Ameise";
  const slope = o.curriculum ? o.curriculum.slope : o.episode && o.episode.world ? o.episode.world.slopeDeg : 0;
  return `${kind}, Generation ${o.generation}, gelernt bis ${slope}°`;
}
function readStore(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function sources() {
  const list = [];
  if (EMBEDDED_ANTS) list.push({ key: "embedded", label: "Eingebaute Kolonie", data: EMBEDDED_ANTS });
  const main = readStore(MAIN_STORE);
  if (main) list.push({ key: "main", label: "Aus der Hauptseite", data: main });
  const file = readStore(VIEWER_STORE);
  if (file) list.push({ key: "file", label: "Geladene Datei", data: file });
  return list;
}
function fillSourceMenu(selectKey) {
  const list = sources(), sel = $("source");
  sel.innerHTML = list.map((s) => `<option value="${s.key}">${s.label}</option>`).join("") || `<option value="">Zufallsnetze</option>`;
  if (selectKey && list.some((s) => s.key === selectKey)) sel.value = selectKey;
  return list;
}
function useSource(key) {
  const list = sources(), s = list.find((x) => x.key === key) || list[0];
  let nets;
  if (s) {
    try { nets = netsFrom(s.data); sourceName = `${s.label}: ${describe(s.data)}`; } catch (e) { nets = null; }
  }
  if (!nets) { nets = Array.from({ length: 12 }, (_, i) => createBrain(i + 1)); sourceName = "Zufallsnetze (noch nichts gelernt)"; }
  // eine einzelne Ameise: mehrere Kopien laufen lassen
  while (nets.length < 8) nets = nets.concat(nets.map(netClone)).slice(0, 8);
  ants = nets.slice(0, 32).map((net) => spawn({ ctrl: createController(net, BRAIN_DEFAULTS, world) }, true));
  arrived = 0;
  try { localStorage.setItem("neuronale-ameisen-viewer-quelle", s ? s.key : ""); } catch (e) { /* egal */ }
}

// ---------- Feld und Ameisen ----------
function layout() {
  const w = cv.clientWidth, h = cv.clientHeight;
  const scale = w / FIELD_CM;
  field = { w, h, scale, x0: -w / 2 / scale, x1: w / 2 / scale, y0: -1.5, y1: h / scale - 1.5 };
  if (!world.scent.placed) { world.scent.x = 0; world.scent.y = field.y1 - 2; }
}
function spawn(m, scatter = false) {
  const margin = 1;
  const x = field.x0 + margin + rng() * (field.x1 - field.x0 - 2 * margin);
  const y = scatter ? field.y0 + 1 + rng() * (field.y1 - field.y0) * 0.35 : field.y0 + 0.5;
  m.ant = createAnt(x, y, (90 + (rng() - 0.5) * 80) * DEG);
  m.t = rng();                      // Takt nicht bei allen gleich
  m.ctrl.nextT = m.t;
  return m;
}
function step() {
  for (const m of ants) {
    controllerStep(m.ctrl, m.ant, senseScent(m.ant, world.scent, rng), m.t);
    physicsStep(m.ant, world, DT);
    m.t += DT;
    const a = m.ant;
    if (Math.hypot(a.x - world.scent.x, a.y - world.scent.y) < 0.7) { arrived++; spawn(m); continue; }
    if (a.y < field.y0 - 1.5 || a.y > field.y1 + 1.5 || a.x < field.x0 - 1.5 || a.x > field.x1 + 1.5) spawn(m);
  }
}

// ---------- Lagesensor ----------
// beta: vorne/hinten kippen (Oberkante hoch = +), gamma: seitlich (rechte Kante runter = +).
// Hangaufwärts in Gerätekoordinaten: (−gamma, beta); bei gedrehtem Bildschirm entsprechend drehen.
const tilt = { beta: null, gamma: null }, zero = { beta: 0, gamma: 0 };
let sensorOn = false;
function onOrientation(e) {
  if (e.beta == null) return;
  tilt.beta = e.beta; tilt.gamma = e.gamma;
  if (!sensorOn) { sensorOn = true; showSensorState(); }
}
function screenAngle() {
  return (screen.orientation && screen.orientation.angle) || window.orientation || 0;
}
function targetSlope() {
  if (!sensorOn) return { y: +$("slope").value, x: 0 };
  let gx = -(tilt.gamma - zero.gamma), gy = tilt.beta - zero.beta;
  const a = ((screenAngle() % 360) + 360) % 360;
  if (a === 90) [gx, gy] = [-gy, gx];
  else if (a === 270) [gx, gy] = [gy, -gx];
  else if (a === 180) [gx, gy] = [-gx, -gy];
  const clamp = (v) => Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, v));
  return { x: clamp(gx), y: clamp(gy) };
}
function enableSensor() {
  const D = window.DeviceOrientationEvent;
  if (!D) { message("Dieses Gerät hat keinen Lagesensor – die Neigung lässt sich mit dem Regler einstellen."); return; }
  if (typeof D.requestPermission === "function") {        // iPhone: Erlaubnis nach Antippen
    D.requestPermission().then((state) => {
      if (state === "granted") window.addEventListener("deviceorientation", onOrientation);
      else message("Ohne Erlaubnis für Bewegung & Ausrichtung geht es nur mit dem Regler. In den Safari-Einstellungen lässt sich das ändern.");
    }).catch(() => message("Der Lagesensor braucht eine sichere Verbindung (https). Über GitHub Pages öffnen."));
  } else {
    window.addEventListener("deviceorientation", onOrientation);
    setTimeout(() => { if (!sensorOn) message("Kein Lagesensor gefunden – die Neigung lässt sich mit dem Regler einstellen."); showSensorState(); }, 1500);
  }
}
function showSensorState() {
  $("sensor").hidden = sensorOn;
  $("zero").hidden = !sensorOn;
  $("slider").style.display = sensorOn ? "none" : "flex";
}

// ---------- Bedienung ----------
let hideTimer = null;
function showBar() {
  $("bar").classList.remove("hide");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if ($("msg").hidden) $("bar").classList.add("hide"); }, 5000);
}
function message(html) {
  const m = $("msg");
  m.innerHTML = html + `<br><br><button id="msg-ok">OK</button>`;
  m.hidden = false;
  $("msg-ok").onclick = () => { m.hidden = true; showBar(); };
}
$("sensor").onclick = enableSensor;
$("zero").onclick = () => { zero.beta = tilt.beta || 0; zero.gamma = tilt.gamma || 0; showBar(); };
$("slope").oninput = () => { $("slope-v").textContent = $("slope").value + "°"; };
$("source").onchange = () => { useSource($("source").value); showBar(); };
$("file").onclick = () => $("file-in").click();
$("file-in").onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  f.text().then((t) => {
    const o = JSON.parse(t);
    netsFrom(o);                                          // prüfen
    try { localStorage.setItem(VIEWER_STORE, t); } catch (err) { /* zu gross: nur jetzt verwenden */ }
    fillSourceMenu("file");
    useSource("file");
    if (!sources().some((s) => s.key === "file")) { ants = netsFrom(o).map((net) => spawn({ ctrl: createController(net, BRAIN_DEFAULTS, world) }, true)); }
    message(`Geladen: <b>${f.name}</b><br>${describe(o)}`);
  }).catch((err) => message("Laden fehlgeschlagen: " + err.message));
  e.target.value = "";
};
$("help").onclick = () => message(
  `<b>Ameisen-Viewer</b><br>Jede Ameise hat ihr eigenes, trainiertes Netz.<br><br>` +
  `• <b>iPhone neigen</b> = Hang neigen: Oberkante hoch → bergauf zur Duftquelle. Seitlich kippen → seitlicher Hang.<br>` +
  `• <b>Nullpunkt</b>: so wie du das iPhone gerade hältst, gilt als flach.<br>` +
  `• <b>Antippen</b>: Duftquelle dorthin setzen.<br>` +
  `• Gelernt wurde bis etwa 20° – steiler rutschen sie ab.<br><br>${sourceName}`);
cv.addEventListener("pointerdown", (e) => {
  showBar();
  const b = cv.getBoundingClientRect();
  world.scent.x = field.x0 + (e.clientX - b.left) / field.scale;
  world.scent.y = field.y1 - (e.clientY - b.top) / field.scale;
  world.scent.placed = true;
});
window.addEventListener("resize", layout);

// ---------- Zeichnen ----------
function draw() {
  const { ctx, w, h } = fitCanvas(cv);
  const sc = field.scale;
  const sx = (x) => (x - field.x0) * sc, sy = (y) => (field.y1 - y) * sc;
  ctx.fillStyle = cssVar("--bg"); ctx.fillRect(0, 0, w, h);
  drawScent(ctx, world.scent, sx, sy, sc, false, false);   // nur Farbverlauf, keine Kreise
  // Zentrum der Duftquelle: kleiner zarter Kreis
  ctx.strokeStyle = `rgba(${cssVar("--scent-rgb")}, 0.55)`; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(sx(world.scent.x), sy(world.scent.y), 7, 0, 2 * Math.PI); ctx.stroke();
  const v = { showForces: false, sense: false, feet: false };
  for (const m of ants) drawAnt(ctx, m.ant, sx, sy, sc, v);
  drawSlopeArrow(ctx, w, h);
}
// Pfeil "bergab" unten rechts: Richtung und Länge zeigen, wohin die Schwerkraft zieht
function drawSlopeArrow(ctx, w, h) {
  const s = Math.hypot(world.slopeDeg, world.slopeXDeg);
  if (s < 1) return;
  const cx = w - 46, cy = h - 120, len = 10 + 26 * Math.min(1, s / 30);
  const ax = -world.slopeXDeg / s, ay = world.slopeDeg / s;     // bergab, Bildschirm-y nach unten
  ctx.strokeStyle = cssVar("--muted"); ctx.fillStyle = cssVar("--muted"); ctx.lineWidth = 3;
  arrow(ctx, cx - ax * len / 2, cy - ay * len / 2, cx + ax * len / 2, cy + ay * len / 2);
  ctx.font = "11px " + cssVar("--font-num"); ctx.textAlign = "center";
  ctx.fillText("bergab", cx, cy + 34);
}
// ---------- Schleife ----------
let last = performance.now(), acc = 0;
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Neigung weich nachführen (Sensor zittert)
  const t = targetSlope();
  world.slopeDeg += (t.y - world.slopeDeg) * 0.2;
  world.slopeXDeg += (t.x - world.slopeXDeg) * 0.2;
  acc += real;
  while (acc >= DT) { step(); acc -= DT; }
  draw();
  $("tilt").textContent = `↑ ${Math.round(world.slopeDeg)}° · ↔ ${Math.round(world.slopeXDeg)}°`;
  $("count").textContent = `oben: ${arrived}`;
  requestAnimationFrame(frame);
}

layout();
let startKey = null;
try { startKey = localStorage.getItem("neuronale-ameisen-viewer-quelle"); } catch (e) { /* egal */ }
fillSourceMenu(startKey);
useSource($("source").value);
showSensorState();
showBar();
if (!sources().length) message("Noch keine trainierten Ameisen gefunden – es laufen Zufallsnetze.<br>Trainieren in der Hauptseite, oder «Datei…» mit einem gespeicherten Lernstand (.json).");
requestAnimationFrame(frame);
