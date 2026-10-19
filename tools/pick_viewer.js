// Viewer-Kolonie zusammenstellen: aus gespeicherten Kolonien die einzeln besten Ameisen auswählen.
//   node tools/pick_viewer.js <Anzahl> <Ausgabe.json> <kolonie1.json> [kolonie2.json ...]
// Bewertung je Ameise: 3 Startrichtungen bei 0°, 10° und 20° (Summe der Fitness).
const fs = require("fs");
const { S } = require("../test/load");
const [count, out, ...files] = process.argv.slice(2);
globalThis.cfg = { count: +count, cols: files.map((f) => ({ name: f, data: JSON.parse(fs.readFileSync(f, "utf8")) })) };
const res = JSON.parse(S(`(() => {
  const all = [];
  for (const c of cfg.cols) c.data.members.forEach((m, i) => {
    const net = brainFromJSON(m.net);
    let score = 0, ok = 0;
    const per = {};
    for (const slope of [0, 10, 20]) {
      const r = evaluate(net, { seconds: 15, world: { slopeDeg: slope }, starts: [90, 50, 130] });
      score += r.fitness; ok += r.reachedCount; per[slope] = r.reachedCount;
    }
    all.push({ from: c.name, id: m.id, score, ok, per, net: m.net });
  });
  all.sort((a, b) => b.score - a.score);
  return JSON.stringify(all.slice(0, cfg.count));
})()`));
const base = cfg.cols[0].data;
const outJson = {
  ...base, members: res.map((r) => ({ id: r.id, parents: null, net: r.net, from: r.from })),
  viewer: { picked: res.map((r) => ({ from: r.from, id: r.id, score: +r.score.toFixed(1), oben: r.per })) },
  viewerInfo: process.env.VIEWER_INFO || null,
};
fs.writeFileSync(out, JSON.stringify(outJson));
for (const r of res) console.log(`${r.from.replace(/.*\//, "")} #${r.id}: Fitness ${r.score.toFixed(1)}, oben bei 0°/10°/20°: ${r.per[0]}/${r.per[10]}/${r.per[20]} von 3`);
console.log(`gespeichert: ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
