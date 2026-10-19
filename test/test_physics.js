// Physik-Checks ohne Browser:  node test/test_physics.js
// Lädt die Quelldateien wie der Browser (klassische Skripte in einem gemeinsamen Kontext).

const { S, ctx, check, done } = require("./load");

function run({ slopeDeg = 0, mu = 0.8, seconds = 5, gait = true, gaitParams = {} }) {
  ctx.cfg = { slopeDeg, mu, seconds, gait, gaitParams };
  return S(`(() => {
    const world = { ...WORLD_DEFAULTS, slopeDeg: cfg.slopeDeg, mu: cfg.mu };
    const p = { ...GAIT_DEFAULTS, ...cfg.gaitParams };
    const ant = createAnt(0, 0, Math.PI / 2);
    const dt = 1 / 240;
    let maxN = 0, minLegs = 6, sumLegs = 0, steps = 0;
    for (let t = 0; t < cfg.seconds; t += dt) {
      if (cfg.gait) tripodTargets(ant, t, p);
      physicsStep(ant, world, dt);
      const n = ant.contact.reduce((a, b) => a + b, 0);
      minLegs = Math.min(minLegs, n); sumLegs += n; steps++;
      if (!Number.isFinite(ant.x + ant.y + ant.heading)) return { error: "NaN" };
    }
    return { x: ant.x, y: ant.y, headingDeg: ant.heading * 180 / Math.PI, avgLegs: sumLegs / steps, minLegs };
  })()`);
}

S("updateKinematics(createAnt())");
const neutral = S("createAnt().feet.map(f => f.z)");
check("Grundstellung: alle Füsse am Boden", neutral.every((z) => z <= 0 && z > -0.05), { z: neutral });

let r = run({ slopeDeg: 0, gait: false });
check("Stehen auf Ebene: keine Bewegung", Math.hypot(r.x, r.y) < 1e-3, r);

r = run({ slopeDeg: 20, gait: false });
check("Stehen am Hang 20° (mu 0.8): hält", Math.abs(r.y) < 0.01, r);

r = run({ slopeDeg: 45, mu: 0.5, gait: false, seconds: 1 });
check("Stehen am Hang 45° (mu 0.5): rutscht ab", r.y < -1, r);

const flat = run({ slopeDeg: 0 });
check("Dreifuss-Gang Ebene: läuft vorwärts (+y)", flat.y > 2 && Math.abs(flat.x) < 0.5 * flat.y, flat);

r = run({ slopeDeg: 15 });
check("Dreifuss-Gang Hang 15°: kommt hoch", r.y > 1, r);

r = run({ slopeDeg: 0, gaitParams: { turn: 0.5 } });
check("Lenkung turn=+0.5: dreht nach links", r.headingDeg > 100, r);

r = run({ slopeDeg: 0, gaitParams: { freq: 6 } });
check("Doppelte Frequenz: schneller", r.y > flat.y * 1.3, r);

done();
