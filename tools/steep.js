// Steile Hänge: die besten Ameisen aus Dateien vergleichen (oben von 3 Startrichtungen je Neigung).
//   node tools/steep.js datei1.json [datei2.json ...]   (Neigungen per BENCH_SLOPES, Standard 25,30,32,34,36)
const fs = require("fs");
const { S } = require("../test/load");
globalThis.cfg = {
  slopes: (process.env.BENCH_SLOPES || "25,30,32,34,36").split(",").map(Number),
  sets: process.argv.slice(2).map((f) => ({ name: f.replace(/.*\//, ""), nets: JSON.parse(fs.readFileSync(f, "utf8")).members.map((m) => m.net) })),
};
console.log(S(`(() => {
  const out = ["oben von 3 bei " + cfg.slopes.map((s) => s + "°").join("/") + " – beste 4 je Datei"];
  for (const set of cfg.sets) {
    const rows = set.nets.map((j, idx) => {
      const net = brainFromJSON(j), per = cfg.slopes.map((s) => evaluate(net, { seconds: 15, world: { slopeDeg: s }, starts: [90, 50, 130] }).reachedCount);
      return { idx, per, score: per.reduce((a, b, i) => a + b * (1 + i), 0) };
    }).sort((a, b) => b.score - a.score).slice(0, 4);
    out.push(set.name.padEnd(28) + rows.map((r) => "#" + r.idx + " [" + r.per.join("/") + "]").join("  "));
  }
  return out.join("\\n");
})()`));
