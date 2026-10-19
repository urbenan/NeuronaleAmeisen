// Duftfeld und Fühler prüfen:  node test/test_scent.js
const { S, ctx, check, done } = require("./load");

// Sensorwerte bei verschiedenen Blickrichtungen (Quelle genau hangaufwärts in 10 cm)
const sense = (headingDeg) => S(`senseScent(createAnt(0, 10, ${headingDeg} * DEG), { ...SCENT_DEFAULTS })`);
let s = sense(90);
check("Blick zur Quelle: diff ≈ 0", Math.abs(s.diff) < 0.05, s);
check("Intensität ≈ exp(-10/λ)", Math.abs(s.intensity - Math.exp(-1)) < 0.05, s);
s = sense(0);
check("Quelle links (Blick nach rechts): diff > 0.8", s.diff > 0.8, s);
s = sense(180);
check("Quelle rechts (Blick nach links): diff < -0.8", s.diff < -0.8, s);
s = sense(270);
check("Quelle hinten: diff ≈ 0", Math.abs(s.diff) < 0.1, s);

// Test-Lenkung: findet die Ameise mit den Fühlern zur Quelle?
function follow(x0, y0, headingDeg, slopeDeg, seconds = 30, noise = 0) {
  ctx.cfg = { x0, y0, headingDeg, slopeDeg, seconds, noise };
  return S(`(() => {
    const world = { ...WORLD_DEFAULTS, slopeDeg: cfg.slopeDeg };
    const scent = { ...SCENT_DEFAULTS, noise: cfg.noise };
    const p = { ...GAIT_DEFAULTS };
    const ant = createAnt(cfg.x0, cfg.y0, cfg.headingDeg * DEG);
    const dt = 1 / 240;
    let minD = Infinity, tReach = null;
    for (let t = 0; t < cfg.seconds; t += dt) {
      p.turn = scentSteer(p.turn, senseScent(ant, scent), 0.8, dt);
      tripodTargets(ant, t, p);
      physicsStep(ant, world, dt);
      const d = Math.hypot(ant.x - scent.x, ant.y - scent.y);
      if (d < minD) minD = d;
      if (tReach === null && d < 1) tReach = t;
    }
    return { minD, tReach };
  })()`);
}
let r = follow(0, 0, 90, 15);
check("Duft folgen, gerade hoch (15°): erreicht Quelle", r.tReach !== null, r);
r = follow(-8, 0, 0, 15);
check("Duft folgen, Start seitlich + Blick quer: erreicht Quelle", r.tReach !== null, r);
r = follow(5, 2, 270, 15);
check("Duft folgen, Start hangabwärts blickend: erreicht Quelle", r.tReach !== null, r);
r = follow(-8, 0, 0, 15, 30, 0.05);
check("Duft folgen mit 5 % Messrauschen: erreicht Quelle", r.tReach !== null, r);
done();
