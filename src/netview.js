// Netz-Visualisierung wie beim Ziffern-Projekt:
// Topologie (Eingänge | verborgene Neuronen | Ausgänge), Linien = Gewichte (rot negativ, blau positiv,
// dicker = stärker), Kreise = aktuelle Aktivierung. Dazu die Gewichtsmatrizen W1 und W2 als Kacheln.
// Mit der Maus (oder Antippen) ein Neuron wählen: nur seine Verbindungen werden hervorgehoben.

function hexRgb(s) {
  const c = document.createElement("canvas").getContext("2d");
  c.fillStyle = s;
  const h = c.fillStyle;
  return h.startsWith("#") ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : h.match(/\d+/g).slice(0, 3).map(Number);
}
let NV_COL = null;
function nvColors() {
  if (!NV_COL) NV_COL = { neg: hexRgb(cssVar("--neg")), mid: hexRgb(cssVar("--mid")), pos: hexRgb(cssVar("--pos")) };
  return NV_COL;
}
if (typeof matchMedia !== "undefined") matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { NV_COL = null; });

function scaleRgb(t) {          // −1 … +1 -> rot … hell … blau
  const C = nvColors();
  t = Math.max(-1, Math.min(1, t));
  const b = t < 0 ? C.neg : C.pos, u = Math.abs(t);
  return [0, 1, 2].map((i) => Math.round(C.mid[i] + (b[i] - C.mid[i]) * u));
}
const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const maxAbs = (a) => { let m = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > m) m = v; } return m; };

// Positionen der Neuronen; Lücken zwischen Gruppen (Eingänge nach Sensorart, Ausgänge nach Bein)
function netLayout(net, w) {
  const top = 14, rowH = 15, gap = 9;
  const inY = [], outY = [], hidY = [];
  let y = top;
  for (const g of INPUT_GROUPS) { for (let i = 0; i < g.n; i++) { inY.push(y + rowH / 2); y += rowH; } y += gap; }
  const height = y - gap + top;
  y = top + (height - 2 * top - (N_OUT * rowH + 5 * gap)) / 2;
  for (let k = 0; k < N_OUT; k++) { outY.push(y + rowH / 2); y += rowH; if (k % 3 === 2) y += gap; }
  const hsp = (height - 2 * top) / net.nHid;
  for (let j = 0; j < net.nHid; j++) hidY.push(top + hsp * (j + 0.5));
  const small = w < 560;
  return { height, inX: small ? 84 : 104, hidX: w * 0.52, outX: w - (small ? 52 : 64), inY, hidY, outY, r: 5.5 };
}

// Wert, den eine Linie zeigt: Gewicht oder "Signal" = Gewicht × Aktivierung der Quelle
function lineValues(net, mode) {
  if (mode !== "flow") return [net.W1, net.W2];
  const f1 = new Float64Array(net.W1.length), f2 = new Float64Array(net.W2.length);
  for (let i = 0; i < net.nIn; i++) for (let j = 0; j < net.nHid; j++) f1[i * net.nHid + j] = net.W1[i * net.nHid + j] * net.x[i];
  for (let j = 0; j < net.nHid; j++) for (let k = 0; k < net.nOut; k++) f2[j * net.nOut + k] = net.W2[j * net.nOut + k] * net.h[j];
  return [f1, f2];
}

function drawNet(cv, net, st) {
  const w = cv.clientWidth, L = netLayout(net, w);
  if (cv.style.height !== L.height + "px") cv.style.height = L.height + "px";
  const { ctx } = fitCanvas(cv);
  ctx.clearRect(0, 0, w, L.height);
  const [v1, v2] = lineValues(net, st.mode);
  const m1 = maxAbs(v1) || 1, m2 = maxAbs(v2) || 1;
  const sel = st.hover;   // {layer: 0|1|2, idx}
  const lit = (layer, a, b) => !sel || (sel.layer === layer && sel.idx === a) || (sel.layer === layer + 1 && sel.idx === b);
  const H = net.nHid, O = net.nOut;

  const line = (x0, y0, x1, y1, v, m, on) => {
    const u = Math.abs(v) / m;
    if (u < 0.03 && on) return;
    ctx.strokeStyle = rgba(v < 0 ? nvColors().neg : nvColors().pos, on ? (sel ? 0.25 + 0.75 * u : 0.05 + 0.5 * u) : 0.03);
    ctx.lineWidth = on && sel ? 0.8 + 2.5 * u : 0.4 + 1.8 * u;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  };
  // zuerst gedämpfte, dann hervorgehobene Linien (damit diese oben liegen)
  for (const pass of [false, true]) {
    for (let i = 0; i < net.nIn; i++) for (let j = 0; j < H; j++) {
      const on = lit(0, i, j);
      if (on === pass) line(L.inX, L.inY[i], L.hidX, L.hidY[j], v1[i * H + j], m1, on);
    }
    for (let j = 0; j < H; j++) for (let k = 0; k < O; k++) {
      const on = lit(1, j, k);
      if (on === pass) line(L.hidX, L.hidY[j], L.outX, L.outY[k], v2[j * O + k], m2, on);
    }
  }

  const node = (x, y, v, layer, idx) => {
    ctx.beginPath(); ctx.arc(x, y, L.r, 0, 2 * Math.PI);
    ctx.fillStyle = rgba(scaleRgb(v)); ctx.fill();
    const isSel = sel && sel.layer === layer && sel.idx === idx;
    ctx.lineWidth = isSel ? 2.5 : 1; ctx.strokeStyle = isSel ? cssVar("--accent") : cssVar("--muted"); ctx.stroke();
  };
  ctx.font = "11px " + cssVar("--font-num"); ctx.textBaseline = "middle";
  // Eingänge mit Namen links
  ctx.textAlign = "right";
  for (let i = 0; i < net.nIn; i++) {
    node(L.inX, L.inY[i], net.x[i], 0, i);
    ctx.fillStyle = cssVar(sel && sel.layer === 0 && sel.idx === i ? "--ink" : "--muted");
    ctx.fillText(INPUT_NAMES[i], L.inX - L.r - 5, L.inY[i]);
  }
  for (let j = 0; j < H; j++) node(L.hidX, L.hidY[j], net.h[j], 1, j);
  ctx.textAlign = "left";
  for (let k = 0; k < O; k++) {
    node(L.outX, L.outY[k], net.y[k], 2, k);
    ctx.fillStyle = cssVar(sel && sel.layer === 2 && sel.idx === k ? "--ink" : "--muted");
    ctx.fillText(OUTPUT_NAMES[k], L.outX + L.r + 5, L.outY[k]);
  }
  // Spaltentitel
  ctx.textAlign = "center"; ctx.fillStyle = cssVar("--muted"); ctx.font = "600 11px " + cssVar("--font-ui");
  ctx.fillText(`verborgen (${H})`, L.hidX, 6);
  st.layout = L;
}

// Neuron unter der Maus finden
function netHit(st, x, y) {
  const L = st.layout;
  if (!L) return null;
  const cols = [[L.inX, L.inY, 0], [L.hidX, L.hidY, 1], [L.outX, L.outY, 2]];
  let best = null, bd = 12;
  for (const [cx, ys, layer] of cols) ys.forEach((cy, idx) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d < bd) { bd = d; best = { layer, idx }; }
  });
  // auch auf den Namen zeigen erlaubt
  if (!best) for (const [cx, ys, layer] of [[L.inX - 50, L.inY, 0], [L.outX + 25, L.outY, 2]]) ys.forEach((cy, idx) => {
    if (Math.abs(y - cy) < 7 && Math.abs(x - cx) < 50) best = { layer, idx };
  });
  return best;
}

// Text zum gewählten Neuron: Wert, Schwelle und die stärksten Verbindungen
function netHoverText(net, sel) {
  if (!sel) return "Zeige mit der Maus auf ein Neuron (oder tippe es an), um nur seine Verbindungen zu sehen.";
  const f = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);
  const top = (pairs) => pairs.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4).map(([n, v]) => `${n} ${f(v)}`).join(", ");
  const H = net.nHid, O = net.nOut;
  if (sel.layer === 0) {
    const i = sel.idx;
    return `Eingang «${INPUT_NAMES[i]}» = ${f(net.x[i])}. Stärkste Gewichte zu: ` +
      top(Array.from({ length: H }, (_, j) => [`N${j + 1}`, net.W1[i * H + j]]));
  }
  if (sel.layer === 1) {
    const j = sel.idx;
    return `Verborgenes Neuron N${j + 1}: h = tanh(Summe + b1) = ${f(net.h[j])}, Schwelle b1 = ${f(net.b1[j])}. ` +
      `Stärkste Eingänge: ${top(Array.from({ length: net.nIn }, (_, i) => [INPUT_NAMES[i], net.W1[i * H + j]]))}. ` +
      `Stärkste Ausgänge: ${top(Array.from({ length: O }, (_, k) => [OUTPUT_NAMES[k], net.W2[j * O + k]]))}.`;
  }
  const k = sel.idx, [lo, hi] = JOINT_LIMITS[k % 3];
  return `Ausgang «${OUTPUT_NAMES[k]}» = ${f(net.y[k])} -> Sollwinkel ${Math.round(lo + (net.y[k] + 1) / 2 * (hi - lo))}° ` +
    `(Bereich ${lo}…${hi}°), Schwelle b2 = ${f(net.b2[k])}. Stärkste Eingänge: ` +
    top(Array.from({ length: H }, (_, j) => [`N${j + 1}`, net.W2[j * O + k]]));
}

// Gewichtsmatrix als Kacheln: Zeilen = Quelle, Spalten = Ziel. Gemeinsame Farbskala bis ±max.
// colGroup = 3: Spalten in Dreiergruppen (ein Bein = α β γ), Beschriftung pro Gruppe.
function drawMatrix(cv, M, rows, cols, rowLabels, colLabels, hl, colGroup = 1) {
  const w = cv.clientWidth, top = 20;
  const ctx0 = cv.getContext("2d");
  ctx0.font = "10px " + cssVar("--font-num");
  const labW = 8 + Math.max(...rowLabels.map((l) => ctx0.measureText(l).width));
  const cw = (w - labW) / cols, ch = Math.max(9, Math.min(15, cw));
  const h = top + rows * ch + 2;
  if (cv.style.height !== h + "px") cv.style.height = h + "px";
  const { ctx } = fitCanvas(cv);
  ctx.clearRect(0, 0, w, h);
  const m = maxAbs(M) || 1;
  ctx.font = "10px " + cssVar("--font-num"); ctx.textBaseline = "middle";
  ctx.fillStyle = cssVar("--muted"); ctx.textAlign = "center";
  if (colGroup > 1) {
    for (let c = 0; c < cols; c += colGroup) ctx.fillText(colLabels[c], labW + cw * (c + colGroup / 2), top / 2);
  } else {
    const every = cw < 14 ? 3 : 1;
    for (let c = 0; c < cols; c += every) ctx.fillText(colLabels[c], labW + cw * (c + 0.5), top / 2);
  }
  ctx.textAlign = "right";
  for (let r = 0; r < rows; r++) {
    const hot = hl && hl.row === r;
    ctx.fillStyle = cssVar(hot ? "--ink" : "--muted");
    ctx.fillText(rowLabels[r], labW - 4, top + ch * (r + 0.5));
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = rgba(scaleRgb(M[r * cols + c] / m));
      ctx.fillRect(labW + cw * c, top + ch * r, cw - 1, ch - 1);
    }
  }
  if (colGroup > 1) {
    ctx.fillStyle = cssVar("--surface");
    for (let c = colGroup; c < cols; c += colGroup) ctx.fillRect(labW + cw * c - 1.5, top, 2, rows * ch);
  }
  if (hl) {
    ctx.strokeStyle = cssVar("--accent"); ctx.lineWidth = 2;
    if (hl.row != null) ctx.strokeRect(labW - 1, top + ch * hl.row - 1, cw * cols + 1, ch + 1);
    if (hl.col != null) ctx.strokeRect(labW + cw * hl.col - 1, top - 1, cw + 1, ch * rows + 1);
  }
  return { max: m, hit: (x, y) => {
    const c = Math.floor((x - labW) / cw), r = Math.floor((y - top) / ch);
    return c >= 0 && c < cols && r >= 0 && r < rows ? { r, c, v: M[r * cols + c] } : null;
  } };
}
