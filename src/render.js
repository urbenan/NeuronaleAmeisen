// Zeichnen: Welt von oben (Hang, Höhenlinien, Ziel), Ameise, Kräfte und Gangbild.
// Die Kamera folgt der Ameise; Welt-y (hangaufwärts) zeigt auf dem Bildschirm nach oben.

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function fitCanvas(cv) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function drawWorld(cv, world, ant, view) {
  const { ctx, w, h } = fitCanvas(cv);
  const sc = view.scale;                         // px pro cm
  const sx = (x) => w / 2 + (x - view.cx) * sc;
  const sy = (y) => h / 2 - (y - view.cy) * sc;
  const toWx = (px) => view.cx + (px - w / 2) / sc;
  const toWy = (py) => view.cy - (py - h / 2) / sc;

  // Hang: Farbe nach Höhe, unten (Start) hell, oben (Ziel) kräftiger
  const yTop = toWy(0), yBot = toWy(h);
  const grad = ctx.createLinearGradient(0, sy(0), 0, sy(world.goalY));
  grad.addColorStop(0, cssVar("--ground-lo"));
  grad.addColorStop(1, cssVar("--ground-hi"));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  drawScent(ctx, world.scent, sx, sy, sc);

  // Höhenlinien alle 1 cm (hangaufwärts), dicker alle 5 cm
  ctx.font = "11px " + cssVar("--font-num");
  ctx.textBaseline = "bottom";
  const sin = Math.sin(world.slopeDeg * DEG);
  for (let y = Math.floor(yBot); y <= yTop; y++) {
    const major = y % 5 === 0;
    ctx.strokeStyle = cssVar(major ? "--grid-major" : "--grid");
    ctx.lineWidth = major ? 1.2 : 1;
    ctx.beginPath(); ctx.moveTo(0, sy(y)); ctx.lineTo(w, sy(y)); ctx.stroke();
    if (major) {
      ctx.fillStyle = cssVar("--muted");
      ctx.fillText(`${y} cm · Höhe ${(y * sin).toFixed(1)} cm`, 6, sy(y) - 2);
    }
  }
  // senkrechte Hilfslinien, damit man seitliches Driften sieht
  ctx.strokeStyle = cssVar("--grid");
  for (let x = Math.floor(toWx(0)); x <= toWx(w); x++) {
    ctx.beginPath(); ctx.moveTo(sx(x), 0); ctx.lineTo(sx(x), h); ctx.stroke();
  }

  // Start- und Ziellinie
  for (const [y, label, col] of [[0, "Start", "--muted"], [world.goalY, "Ziel", "--goal"]]) {
    const py = sy(y);
    if (py < -20 || py > h + 20) continue;
    ctx.strokeStyle = cssVar(col); ctx.lineWidth = 2.5; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = cssVar(col); ctx.font = "600 12px " + cssVar("--font-ui");
    ctx.fillText(label, w - 44, py - 4);
  }

  // Spur
  if (view.trail.length > 1) {
    ctx.strokeStyle = cssVar("--trail"); ctx.lineWidth = 2;
    ctx.beginPath();
    view.trail.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
    ctx.stroke();
  }

  drawAnt(ctx, ant, sx, sy, sc, view);
}

// Duftwolke um die Quelle; Ringe bei C = 0.8, 0.6, 0.4, 0.2, 0.1
function drawScent(ctx, scent, sx, sy, sc) {
  const cx = sx(scent.x), cy = sy(scent.y), col = cssVar("--scent-rgb");
  const R = 3 * scent.lambda * sc;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `rgba(${col}, ${(0.35 * Math.exp(-3 * i / 6)).toFixed(3)})`);
  g.addColorStop(1, `rgba(${col}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = `rgba(${col}, 0.45)`; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
  ctx.font = "11px " + cssVar("--font-num"); ctx.fillStyle = `rgba(${col}, 0.9)`; ctx.textBaseline = "bottom";
  for (const c of [0.8, 0.6, 0.4, 0.2, 0.1]) {
    const r = -Math.log(c) * scent.lambda * sc;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillText(c.toFixed(1), cx + r * 0.7071 + 3, cy + r * 0.7071 - 1);
  }
  ctx.setLineDash([]);
  ctx.fillStyle = `rgb(${col})`;
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 2 * Math.PI); ctx.fill();
  ctx.font = "600 12px " + cssVar("--font-ui"); ctx.fillText("Duftquelle", cx + 9, cy - 4);
}

function drawAnt(ctx, ant, sx, sy, sc, view) {
  const G = ANT_GEOM;
  const P = (px, py) => { const p = toWorld(ant, px, py); return [sx(p.x), sy(p.y)]; };
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // Beine: von oben gesehen; ein angehobenes Bein wirkt durch die Projektion kürzer
  const legCol = cssVar("--ant-leg");
  G.legs.forEach((leg, l) => {
    const f = ant.feet[l];
    const [hx, hy] = P(leg.hipX, leg.hipY), [kx, ky] = P(f.kx, f.ky), [fx, fy] = P(f.x, f.y);
    ctx.strokeStyle = legCol;
    ctx.lineWidth = Math.max(1.5, 0.06 * sc);
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.lineWidth = Math.max(1, 0.04 * sc);
    ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    // Fuss: gefüllt = Bodenkontakt, rot = rutscht, Ring = in der Luft
    const r = Math.max(2.5, 0.05 * sc);
    ctx.beginPath(); ctx.arc(fx, fy, r, 0, 2 * Math.PI);
    if (ant.contact[l]) { ctx.fillStyle = cssVar(ant.slipping[l] ? "--slip" : "--stance"); ctx.fill(); }
    else { ctx.strokeStyle = cssVar("--swing"); ctx.lineWidth = 1.5; ctx.stroke(); }
  });

  // Fühler (zweiteilig)
  ctx.strokeStyle = legCol; ctx.lineWidth = Math.max(1, 0.03 * sc);
  for (const a of antennaPoints(ant)) {
    ctx.beginPath();
    ctx.moveTo(sx(a.base.x), sy(a.base.y)); ctx.lineTo(sx(a.elbow.x), sy(a.elbow.y)); ctx.lineTo(sx(a.tip.x), sy(a.tip.y));
    ctx.stroke();
  }
  // Fühlerspitzen = Duftsensoren
  if (view.sense) {
    const col = cssVar("--scent-rgb");
    antennaPoints(ant).forEach((a) => {
      ctx.beginPath(); ctx.arc(sx(a.tip.x), sy(a.tip.y), Math.max(2.5, 0.045 * sc), 0, 2 * Math.PI);
      ctx.fillStyle = `rgb(${col})`; ctx.fill();
    });
  }

  // Körper: Abdomen, Thorax, Kopf als Ellipsen
  const rot = -ant.heading;     // Bildschirm-y zeigt nach unten
  for (const g of [G.segments[2], G.segments[1], G.segments[0]]) {
    const [cx, cy] = P(g.x, 0);
    ctx.beginPath(); ctx.ellipse(cx, cy, g.rx * sc, g.ry * sc, rot, 0, 2 * Math.PI);
    ctx.fillStyle = cssVar("--ant-body"); ctx.fill();
    ctx.strokeStyle = cssVar("--ant-edge"); ctx.lineWidth = 1; ctx.stroke();
  }

  // Reibungskräfte an den Füssen (wirken auf den Körper)
  if (view.showForces) {
    const fs = view.forceScale * sc;
    ctx.strokeStyle = cssVar("--force"); ctx.fillStyle = cssVar("--force"); ctx.lineWidth = 2;
    G.legs.forEach((leg, l) => {
      if (!ant.contact[l]) return;
      const f = ant.feet[l], F = ant.footForce[l];
      const [fx, fy] = P(f.x, f.y);
      const ex = fx + F.x * fs, ey = fy - F.y * fs;
      if (Math.hypot(ex - fx, ey - fy) < 2) return;
      arrow(ctx, fx, fy, ex, ey);
    });
  }
}

function arrow(ctx, x0, y0, x1, y1) {
  const a = Math.atan2(y1 - y0, x1 - x0), s = 6;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - s * Math.cos(a - 0.4), y1 - s * Math.sin(a - 0.4));
  ctx.lineTo(x1 - s * Math.cos(a + 0.4), y1 - s * Math.sin(a + 0.4));
  ctx.closePath(); ctx.fill();
}

// Gangbild: pro Bein eine Zeile, dunkel = Fuss am Boden, rot = rutscht. Neueste Werte rechts.
function drawGait(cv, history) {
  const { ctx, w, h } = fitCanvas(cv);
  ctx.fillStyle = cssVar("--surface"); ctx.fillRect(0, 0, w, h);
  const labelW = 26, rowH = h / 6, n = history.length;
  const colW = (w - labelW) / GAIT_HISTORY;
  ctx.font = "11px " + cssVar("--font-num"); ctx.textBaseline = "middle";
  const stance = cssVar("--stance"), slip = cssVar("--slip");
  for (let l = 0; l < 6; l++) {
    ctx.fillStyle = cssVar("--muted");
    ctx.fillText(LEG_NAMES[l], 2, (l + 0.5) * rowH);
    for (let i = 0; i < n; i++) {
      const v = history[i][l];
      if (!v) continue;
      ctx.fillStyle = v === 2 ? slip : stance;
      ctx.fillRect(labelW + (GAIT_HISTORY - n + i) * colW, l * rowH + 2, Math.ceil(colW), rowH - 4);
    }
  }
}
const GAIT_HISTORY = 240;
