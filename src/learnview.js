// Lernkurve: x = Bewertungen, Linie = Fitness des besten Netzes, Punkte = bestes Kind jeder Generation.
// Kinder unter dem sichtbaren Bereich werden am unteren Rand gezeichnet.
// Mit Curriculum: Neigung als grüne Treppe (rechte Achse, 0 .. Ziel-Neigung), Fitness fällt bei jeder neuen Stufe.

function drawLearnCurve(cv, history, slopeTarget = null) {
  const { ctx, w, h } = fitCanvas(cv);
  ctx.clearRect(0, 0, w, h);
  const padL = 40, padR = slopeTarget ? 34 : 10, padT = 10, padB = 24;
  const n = history.length;
  ctx.font = "11px " + cssVar("--font-num"); ctx.fillStyle = cssVar("--muted");
  if (n < 2) {
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Noch keine Generation – «Lernen starten» drücken", w / 2, h / 2);
    return;
  }
  const xMax = history[n - 1].episodes;
  let yMax = 1, yMin = 0;
  for (const p of history) { yMax = Math.max(yMax, p.best); yMin = Math.min(yMin, p.best); }
  yMax *= 1.1;
  const X = (e) => padL + (w - padL - padR) * e / xMax;
  const Y = (v) => padT + (h - padT - padB) * (1 - (Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin));

  // Achsen und Gitter
  ctx.strokeStyle = cssVar("--line"); ctx.lineWidth = 1;
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  const step = niceStep((yMax - yMin) / 4);
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
    ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - padR, Y(v)); ctx.stroke();
    ctx.fillText(+v.toFixed(1), padL - 5, Y(v));
  }
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const xs = niceStep(xMax / 5);
  for (let e = 0; e <= xMax; e += xs) ctx.fillText(e, X(e), h - padB + 6);

  // Kinder als Punkte
  ctx.fillStyle = cssVar("--muted");
  ctx.globalAlpha = 0.45;
  for (const p of history) { ctx.beginPath(); ctx.arc(X(p.episodes), Y(p.child), 1.6, 0, 2 * Math.PI); ctx.fill(); }
  ctx.globalAlpha = 1;

  // Neigung (Curriculum)
  if (slopeTarget) {
    const top = Math.max(slopeTarget, ...history.map((p) => p.slope || 0));
    const YS = (v) => padT + (h - padT - padB) * (1 - v / top);
    ctx.strokeStyle = cssVar("--goal"); ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath();
    history.forEach((p, i) => {
      const v = p.slope || 0;
      if (i === 0) ctx.moveTo(X(p.episodes), YS(v));
      else { ctx.lineTo(X(p.episodes), YS(history[i - 1].slope || 0)); ctx.lineTo(X(p.episodes), YS(v)); }
    });
    ctx.lineTo(w - padR, YS(history[n - 1].slope || 0));
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = cssVar("--goal"); ctx.textAlign = "left"; ctx.textBaseline = "middle";
    for (const v of [0, top / 2, top]) ctx.fillText(Math.round(v) + "°", w - padR + 4, YS(v));
  }

  // bestes Netz als Treppenlinie
  ctx.strokeStyle = cssVar("--accent"); ctx.lineWidth = 2;
  ctx.beginPath();
  history.forEach((p, i) => {
    if (i === 0) ctx.moveTo(X(p.episodes), Y(p.best));
    else { ctx.lineTo(X(p.episodes), Y(history[i - 1].best)); ctx.lineTo(X(p.episodes), Y(p.best)); }
  });
  ctx.stroke();
}

function niceStep(x) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1e-9))));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
