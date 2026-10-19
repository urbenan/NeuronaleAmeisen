// Kolonie auf der Kommandozeile trainieren (schneller als im Browser, mehrere Kerne parallel nutzbar).
//   node tools/train.js <Startwert> <Bewertungen> <Ausgabe.json>
// Einstellungen wie die Seite: 24 Ameisen, 3 Startrichtungen, 15 s, Curriculum 0 -> 20° in 2°-Stufen.
// Die Datei lässt sich in der Hauptseite («Laden (.json)») und im Viewer verwenden.
const fs = require("fs");
const { S } = require("../test/load");
const [seed, budget, out] = [+process.argv[2] || 1, +process.argv[3] || 10000, process.argv[4] || "trained/kolonie.json"];
globalThis.cfg = { seed, budget };
const t0 = Date.now();
const json = S(`(() => {
  const ep = { seconds: 15, slipWeight: 1, world: { slopeDeg: 0, mu: WORLD_DEFAULTS.mu }, scent: { ...SCENT_DEFAULTS }, starts: [90, 50, 130] };
  const col = createColony(cfg.seed, { episode: ep, curriculum: { target: 20, step: 2 } });
  let next = 1000;
  while (col.episodes < cfg.budget) {
    colonyStep(col);
    if (col.episodes >= next) {
      next += 1000;
      console.log(col.episodes + " Bewertungen: Neigung " + currentSlope(col) + "°, Weg " + col.best.progress.toFixed(1) + " cm, Ziel " + col.best.reachedCount + "/3");
    }
  }
  const ui = { seconds: 15, lambda: 8, slipWeight: 1, curriculum: true, target: 20, step: 2, starts: 3,
               method: "colony", size: col.size, gaSigma: col.sigma, crossover: col.crossover };
  return JSON.stringify(colonyToJSON(col, { netSeed: cfg.seed, ui, mu: ep.world.mu,
    summary: { slope: currentSlope(col), reached: col.best.reachedCount, progress: col.best.progress } }));
})()`);
fs.writeFileSync(out, json);
console.log(`gespeichert: ${out} (${Math.round(json.length / 1024)} KB, ${((Date.now() - t0) / 60000).toFixed(1)} min)`);
