// Nachahmungslernen prüfen:  node test/test_imitate.js   (ca. 1 Minute)
const { S, check, done } = require("./load");

// Lehrer über die trägen Muskeln (Umkehrung des Muskelfilters) läuft fast so schnell wie direkt gesteuert
let r = S(`(() => {
  const d0 = collectImitation(null, makeRng(1), { episodes: 4, maxSlope: 0.001, seconds: 6 });
  const d20 = collectImitation(null, makeRng(1), { episodes: 4, maxSlope: 20, seconds: 6 });
  const inRange = d0.Y.every((y) => y.every((v) => v >= -0.98 && v <= 0.98));
  return { flach: d0.speed, bisZwanzig: d20.speed, rutscht: d20.slipFrac, inRange };
})()`);
check("Lehrer über Muskeln: flach > 1.5 cm/s, bis 20° > 1.2 cm/s, rutscht < 5 %, Ausgänge im Bereich",
  r.flach > 1.5 && r.bisZwanzig > 1.2 && r.rutscht < 0.05 && r.inRange, r);

// Backpropagation: Fehler sinkt deutlich
r = S(`(() => {
  const rng = makeRng(2), d = collectImitation(null, rng, { episodes: 6, seconds: 4 });
  const net = createBrain(2);
  const before = trainImitation(net, d.X, d.Y, { epochs: 1, lr: 0, rng });
  const after = trainImitation(net, d.X, d.Y, { epochs: 8, rng });
  return { before, after };
})()`);
check("Backpropagation: Fehler sinkt um mehr als das Zehnfache", r.after < r.before / 10, r);

// Ganzer Ablauf mit 2 DAgger-Runden: Netz läuft selbst rutschfrei zur Duftquelle
r = S(`(() => {
  const net = imitate(3, { rounds: 2, episodes: 20 });
  const e = evaluate(net, { seconds: 15, world: { slopeDeg: 15 }, starts: [90, 50, 130] });
  return { oben: e.reachedCount + "/" + e.runs, rutscht: e.slipFrac };
})()`);
check("Nachgeahmtes Netz schafft 15° aus 3 Richtungen, rutscht < 10 %", r.oben === "3/3" && r.rutscht < 0.1, r);
done();
