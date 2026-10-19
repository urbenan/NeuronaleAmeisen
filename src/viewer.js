// Viewer fürs iPhone: trainierte Ameisen im Vollbild, die Neigung kommt vom Lagesensor.
// Bildschirm = Boden. Oberkante anheben -> bergauf nach oben, seitlich kippen -> seitlich geneigt.
// «Nullpunkt»: aktuelle Haltung gilt als flach. Antippen versetzt die Duftquelle.
// Zwei Finger: zoomen (und verschieben), ein Finger ziehen: verschieben, Doppeltippen: Gesamtansicht.
// Wer an der Duftquelle ankommt oder aus dem Bild rutscht, startet unten neu.

// Beim Bündeln (build_web.py) werden hier die Lernstufen aus trained/viewer/ eingesetzt
// (Liste, von früh nach spät): [{ label, data }]
const EMBEDDED_ANTS = /*__TRAINED__*/null;
const BUILD = "__BUILD__";     // build_web.py setzt hier die Version ein (zum Prüfen, ob die neue Version läuft)

const MAIN_STORE = "neuronale-ameisen-lernstand";    // Lernstand der Hauptseite (gleiche Adresse)
const VIEWER_STORE = "neuronale-ameisen-viewer";     // im Viewer geladene Datei
const MAX_SLOPE = 45, FIELD_CM = 14;                 // Bildbreite in cm
const DT = PHYSICS_DT;

const world = { ...WORLD_DEFAULTS, slopeDeg: 0, slopeXDeg: 0, scent: { ...SCENT_DEFAULTS } };
const cv = document.getElementById("cv");
const $ = (id) => document.getElementById(id);
let ants = [], arrived = 0, sourceName = "";
let field = { w: 0, h: 0, scale: 30, x0: 0, x1: 0, y0: 0, y1: 0 };   // Simulationsfläche
const cam = { zoom: 1, cx: 0, cy: 0 };                                   // Kamera (nur Ansicht)
const ZOOM_MIN = 0.6, ZOOM_MAX = 6;
const rng = makeRng(Date.now() >>> 0);

// ---------- Netze laden ----------
function netsFrom(o) {
  if (o.members) return o.members.map((m) => brainFromJSON(m.net));     // Kolonie
  if (o.net) return [brainFromJSON(o.net)];                             // eine Ameise
  throw new Error("Keine Ameisen in der Datei");
}
function describe(o) {
  if (o.viewerInfo) return o.viewerInfo;
  const kind = o.members ? `Kolonie, ${o.members.length} Ameisen` : "eine Ameise";
  const slope = o.curriculum ? o.curriculum.slope : o.episode && o.episode.world ? o.episode.world.slopeDeg : 0;
  return `${kind}, Generation ${o.generation}, gelernt bis ${slope}°`;
}
function readStore(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
// Auswahl: ungelernt, eingebaute Lernstufen, Lernstand der Hauptseite, geladene Datei
function sources() {
  const list = [{ key: "random", label: "Ungelernt (Zufallsnetze)", random: true }];
  for (const e of EMBEDDED_ANTS || []) list.push({ key: "stufe:" + e.label, label: e.label, data: e.data });
  const main = readStore(MAIN_STORE);
  if (main) list.push({ key: "main", label: "Aus der Hauptseite", data: main });
  const file = readStore(VIEWER_STORE);
  if (file) list.push({ key: "file", label: "Geladene Datei", data: file });
  return list;
}
function fillSourceMenu(selectKey) {
  const list = sources(), sel = $("source");
  sel.innerHTML = list.map((s) => `<option value="${s.key}">${s.label}</option>`).join("");
  // Standard: die letzte (beste) eingebaute Stufe
  const embedded = list.filter((s) => s.key.startsWith("stufe:"));
  sel.value = selectKey && list.some((s) => s.key === selectKey) ? selectKey : embedded.length ? embedded[embedded.length - 1].key : list[0].key;
  return list;
}
function useSource(key) {
  const list = sources(), s = list.find((x) => x.key === key) || list[0];
  let nets = null;
  if (s && !s.random) {
    try { nets = netsFrom(s.data); sourceName = `${s.label}: ${describe(s.data)}`; } catch (e) { nets = null; }
  }
  if (!nets) {
    const seed0 = Math.floor(rng() * 1e6);
    nets = Array.from({ length: 16 }, (_, i) => createBrain(seed0 + i));
    sourceName = "Ungelernt: 16 Zufallsnetze – so fängt jede Kolonie an";
  }
  // eine einzelne Ameise: mehrere Kopien laufen lassen
  while (nets.length < 16) nets = nets.concat(nets.map(netClone)).slice(0, 16);   // wenige Individuen: doppelt
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
  if (cam.zoom === 1) resetCam();
}
function resetCam() {
  cam.zoom = 1; cam.cx = (field.x0 + field.x1) / 2; cam.cy = (field.y0 + field.y1) / 2;
}
// Bildschirm <-> Welt über die Kamera
function camScale() { return field.scale * cam.zoom; }
function toScreen(x, y) { return [field.w / 2 + (x - cam.cx) * camScale(), field.h / 2 - (y - cam.cy) * camScale()]; }
function toWorldXY(px, py) { return [cam.cx + (px - field.w / 2) / camScale(), cam.cy - (py - field.h / 2) / camScale()]; }
function clampCam() {
  cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom));
  cam.cx = Math.max(field.x0, Math.min(field.x1, cam.cx));
  cam.cy = Math.max(field.y0, Math.min(field.y1, cam.cy));
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
  `• <b>Auswahl unten</b>: Lernstufen von ungelernt bis nachgeahmt vergleichen.<br>` +
  `• <b>Zwei Finger</b>: zoomen · <b>ziehen</b>: verschieben · <b>doppelt tippen</b>: ganze Fläche.<br>` +
  `• Getestet bis 25° – noch steiler rutschen sie irgendwann ab.<br><br>${sourceName}<br><span style="color:var(--muted)">Version ${BUILD}</span>`);
// Gesten: Antippen = Duftquelle setzen, ziehen = verschieben, zwei Finger = zoomen, doppelt = Gesamtansicht.
// Finger über Touch Events (auf dem iPhone zuverlässiger für zwei Finger, und preventDefault hält
// Safaris eigenes Seiten-Zoomen ab), die Maus am Computer über Pointer Events.
const pointers = new Map();      // aktive Finger/Maus: id -> [x, y] im Canvas
let gesture = null, lastTap = 0;
function localXY(e) { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
function center() {
  const pts = [...pointers.values()];
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}
function spread() {
  const pts = [...pointers.values()];
  return pts.length > 1 ? Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) : 0;
}
// Beginn oder Wechsel der Fingerzahl: Ausgangslage merken (Weltpunkt unter der Fingermitte)
function startGesture(fresh) {
  const [mx, my] = center();
  gesture = { mx, my, dist: spread(), zoom: cam.zoom, anchor: toWorldXY(mx, my),
    moved: fresh || !gesture ? 0 : gesture.moved, multi: (!fresh && gesture && gesture.multi) || pointers.size > 1 };
}
function moveGesture() {
  if (!gesture || !pointers.size) return;
  const [mx, my] = center();
  gesture.moved = Math.max(gesture.moved, Math.hypot(mx - gesture.mx, my - gesture.my));
  if (pointers.size > 1 && gesture.dist > 0) {
    cam.zoom = gesture.zoom * spread() / gesture.dist;
    gesture.moved = Math.max(gesture.moved, 99);
  }
  if (gesture.moved < 8) return;
  // der Weltpunkt unter den Fingern bleibt unter den Fingern
  cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom));
  cam.cx = gesture.anchor[0] - (mx - field.w / 2) / camScale();
  cam.cy = gesture.anchor[1] + (my - field.h / 2) / camScale();
  clampCam();
}
// letzter Finger weg: war es ein Tippen? (px, py = wo er losgelassen wurde)
function endGesture(px, py, isUp) {
  if (pointers.size > 0) { startGesture(false); return; }     // ein Finger bleibt: weiter verschieben
  const tap = gesture && !gesture.multi && gesture.moved < 8 && isUp;
  gesture = null;
  if (!tap) return;
  const now = performance.now();
  if (now - lastTap < 300) { resetCam(); lastTap = 0; return; }   // Doppeltippen
  lastTap = now;
  [world.scent.x, world.scent.y] = toWorldXY(px, py);
  world.scent.placed = true;
}

// Finger (iPhone)
function setTouches(list) {
  pointers.clear();
  for (const t of list) pointers.set(t.identifier, localXY(t));
}
cv.addEventListener("touchstart", (e) => {
  e.preventDefault();
  showBar();
  const fresh = pointers.size === 0;
  setTouches(e.touches);
  startGesture(fresh);
}, { passive: false });
cv.addEventListener("touchmove", (e) => {
  e.preventDefault();
  setTouches(e.touches);
  moveGesture();
}, { passive: false });
function touchEnd(e) {
  e.preventDefault();
  const [px, py] = localXY(e.changedTouches[0]);
  setTouches(e.touches);
  endGesture(px, py, e.type === "touchend");
}
cv.addEventListener("touchend", touchEnd, { passive: false });
cv.addEventListener("touchcancel", touchEnd, { passive: false });

// Maus (Computer)
cv.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse") return;
  showBar();
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, localXY(e));
  startGesture(true);
});
cv.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || !pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, localXY(e));
  moveGesture();
});
for (const type of ["pointerup", "pointercancel"]) cv.addEventListener(type, (e) => {
  if (e.pointerType !== "mouse" || !pointers.has(e.pointerId)) return;
  const [px, py] = localXY(e);
  pointers.delete(e.pointerId);
  endGesture(px, py, type === "pointerup");
});
// Mausrad (Computer): zoomen um den Mauszeiger
cv.addEventListener("wheel", (e) => {
  e.preventDefault();
  const [px, py] = localXY(e), [wx, wy] = toWorldXY(px, py);
  cam.zoom *= Math.exp(-e.deltaY * 0.0015);
  cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom));
  cam.cx = wx - (px - field.w / 2) / camScale(); cam.cy = wy + (py - field.h / 2) / camScale();
  clampCam();
}, { passive: false });
// iPhone-Safari: eigene Seiten-Zoomgeste und Doppeltipp-Zoom unterdrücken
for (const type of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
window.addEventListener("resize", layout);

// ---------- Zeichnen ----------
function draw() {
  const { ctx, w, h } = fitCanvas(cv);
  const sc = camScale();
  const sx = (x) => w / 2 + (x - cam.cx) * sc, sy = (y) => h / 2 - (y - cam.cy) * sc;
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
if (!EMBEDDED_ANTS) message("Noch keine trainierten Ameisen eingebaut – es laufen Zufallsnetze.<br>Trainieren in der Hauptseite, oder «Datei…» mit einem gespeicherten Lernstand (.json).");
requestAnimationFrame(frame);
