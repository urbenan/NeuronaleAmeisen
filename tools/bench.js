// Kolonien vergleichen wie im Viewer: Wie viele Ameisen kommen bei welcher Neigung oben an?
//   node tools/bench.js kolonie1.json [kolonie2.json ...]
// Jede Ameise läuft bei 0°, 5°, 10°, 15°, 20°, 25° je aus 3 Startrichtungen (15 s).
// Ausgewiesen: die besten 16 (wie für den Viewer ausgewählt, Rang nach Fitness bei 0°/10°/20°)
// und die ganze Kolonie. Der Steigungssinn wird so verwendet, wie die Kolonie trainiert wurde.
const fs = require("fs");
const { S } = require("../test/load");
const SLOPES = [0, 5, 10, 15, 20, 25];
for (const file of process.argv.slice(2)) {
  globalThis.cfg = { data: JSON.parse(fs.readFileSync(file, "utf8")), slopes: SLOPES };
  const r = JSON.parse(S(`(() => {
    const d = cfg.data, sense = !(d.episode && d.episode.brain && d.episode.brain.slopeSense === false);
    const rows = d.members.map((m) => {
      const net = brainFromJSON(m.net), per = {};
      let rank = 0;
      for (const s of cfg.slopes) {
        const e = evaluate(net, { seconds: 15, world: { slopeDeg: s }, starts: [90, 50, 130], brain: { slopeSense: sense } });
        per[s] = e.reachedCount / e.runs;
        if (s === 0 || s === 10 || s === 20) rank += e.fitness;
      }
      return { rank, per };
    }).sort((a, b) => b.rank - a.rank);
    const pct = (list, s) => Math.round(100 * list.reduce((a, x) => a + x.per[s], 0) / list.length);
    const top = rows.slice(0, 16);
    return JSON.stringify({ sense, n: rows.length, top: cfg.slopes.map((s) => pct(top, s)), all: cfg.slopes.map((s) => pct(rows, s)) });
  })()`));
  const name = file.replace(/.*\//, "");
  console.log(`${name} (Steigungssinn ${r.sense ? "an" : "aus"}, ${r.n} Ameisen)`);
  console.log(`  Neigung:          ${SLOPES.map((s) => (s + "°").padStart(5)).join("")}`);
  console.log(`  beste 16 oben:    ${r.top.map((p) => (p + "%").padStart(5)).join("")}`);
  console.log(`  ganze Kolonie:    ${r.all.map((p) => (p + "%").padStart(5)).join("")}`);
}
