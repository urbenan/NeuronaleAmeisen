// Kolonie auf der Kommandozeile trainieren (schneller als im Browser, mehrere Kerne parallel nutzbar).
//   node tools/train.js --seed 2 --episodes 30000 --out trained/x.json [Optionen]
// Optionen:
//   --from datei.json   von einer gespeicherten Kolonie weiterlernen (sonst Zufallsnetze, Curriculum ab 0°)
//   --target 20         Ziel-Neigung des Curriculums, --step 2: Stufe
//   --mix 1,0.5,0       pro Bewertung zusätzlich bei diesen Anteilen der aktuellen Neigung laufen
//   --no-sense          Steigungssinn aus (Eingänge "Hang" bleiben 0) – zum Vergleich
// Budget in Episoden (eine Episode = ein Lauf von 15 s), damit Varianten mit mehr Läufen pro Bewertung
// fair verglichen werden. Die Datei lässt sich in der Hauptseite («Laden (.json)») und im Viewer verwenden.
const fs = require("fs");
const { S } = require("../test/load");

const arg = (name, def) => { const i = process.argv.indexOf("--" + name); return i < 0 ? def : process.argv[i + 1]; };
globalThis.cfg = {
  seed: +arg("seed", 1), budget: +arg("episodes", 30000), out: arg("out", "trained/kolonie-neu.json"),
  from: arg("from", null), target: +arg("target", 20), step: +arg("step", 2),
  mix: arg("mix", null) ? arg("mix").split(",").map(Number) : null, sense: !process.argv.includes("--no-sense"),
};
if (cfg.from) cfg.fromData = JSON.parse(fs.readFileSync(cfg.from, "utf8"));
const t0 = Date.now();
const json = S(`(() => {
  let col;
  if (cfg.fromData) {
    col = colonyFromJSON(cfg.fromData);
    col.curriculum = { ...CURRICULUM_DEFAULTS, ...(col.curriculum || {}), target: cfg.target, step: cfg.step };
  } else {
    const ep = { seconds: 15, slipWeight: 1, world: { slopeDeg: 0, mu: WORLD_DEFAULTS.mu }, scent: { ...SCENT_DEFAULTS }, starts: [90, 50, 130] };
    col = createColony(cfg.seed, { episode: ep, curriculum: { target: cfg.target, step: cfg.step } });
  }
  col.episode.slopeMix = cfg.mix;
  col.episode.brain = { slopeSense: cfg.sense };
  col.rng = makeRng((cfg.seed * 7919) >>> 0);
  const runs = (col.episode.starts || [0]).length * (cfg.mix || [1]).length;
  const startEvals = col.episodes;
  let next = 3000;
  while ((col.episodes - startEvals) * runs < cfg.budget) {
    colonyStep(col);
    const used = (col.episodes - startEvals) * runs;
    if (used >= next) {
      next += 3000;
      console.log(used + " Episoden: Neigung " + currentSlope(col) + "°, Weg " + col.best.progress.toFixed(1) + " cm, Ziel " + col.best.reachedCount + "/" + col.best.runs);
    }
  }
  const ui = { seconds: 15, lambda: 8, slipWeight: 1, curriculum: true, target: cfg.target, step: cfg.step, starts: 3,
               method: "colony", size: col.size, gaSigma: col.sigma, crossover: col.crossover };
  return JSON.stringify(colonyToJSON(col, { netSeed: cfg.seed, ui, mu: col.episode.world.mu,
    summary: { slope: currentSlope(col), reached: col.best.reachedCount, runs: col.best.runs, progress: col.best.progress, sense: cfg.sense, mix: cfg.mix } }));
})()`);
fs.writeFileSync(cfg.out, json);
console.log(`gespeichert: ${cfg.out} (${Math.round(json.length / 1024)} KB, ${((Date.now() - t0) / 60000).toFixed(1)} min)`);
