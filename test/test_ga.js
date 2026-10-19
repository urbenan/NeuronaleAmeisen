// Kolonie (genetischer Algorithmus) prüfen:  node test/test_ga.js
const { S, check, done } = require("./load");

let r = S(`(() => {
  const a = createBrain(1), b = createBrain(2), c = crossoverNeurons(a, b, makeRng(3));
  const H = a.nHid, I = a.nIn, O = a.nOut;
  let whole = true, fromA = 0, fromB = 0;
  for (let j = 0; j < H; j++) {
    const src = c.b1[j] === a.b1[j] && c.W1[j] === a.W1[j] ? a : b;
    src === a ? fromA++ : fromB++;
    for (let i = 0; i < I; i++) if (c.W1[i * H + j] !== src.W1[i * H + j]) whole = false;
    for (let k = 0; k < O; k++) if (c.W2[j * O + k] !== src.W2[j * O + k]) whole = false;
  }
  return { whole, fromA, fromB };
})()`);
check("Kreuzung übernimmt ganze Neuronen, von beiden Eltern", r.whole && r.fromA > 0 && r.fromB > 0, r);

r = S(`(() => {
  const ep = { seconds: 2, starts: [90, 50] };
  const c1 = createColony(7, { size: 8, episode: ep }), c2 = createColony(7, { size: 8, episode: ep });
  for (let g = 0; g < 3; g++) { colonyStep(c1); colonyStep(c2); }
  const mono = c1.history.every((h, i) => i === 0 || h.best >= c1.history[i - 1].best - 1e-12);
  return { f1: c1.best.fitness, f2: c2.best.fitness, gen: c1.generation, size: c1.members.length,
           episodes: c1.episodes, mono, ids: c1.members.map((m) => m.id).slice(0, 4) };
})()`);
check("Kolonie reproduzierbar, Elite: beste Fitness sinkt nie", r.f1 === r.f2 && r.mono, r);
check("Elite wird nicht neu bewertet: 8 + 2·6 Bewertungen", r.episodes === 8 + 2 * 6 && r.size === 8, r);

r = S(`(() => {
  const col = createColony(5, { size: 6, episode: { seconds: 2 }, curriculum: { target: 4, step: 2 } });
  colonyStep(col);
  const back = colonyFromJSON(JSON.parse(JSON.stringify(colonyToJSON(col))));
  const same = back.members.every((m, i) => m.id === col.members[i].id && m.net.W2.every((v, k) => Math.abs(v - col.members[i].net.W2[k]) < 1e-6));
  colonyStep(back);
  return { same, gen: back.generation };
})()`);
check("Kolonie speichern/laden: alle Netze und IDs gleich, lernt weiter", r.same && r.gen === 2, r);

// Lerntest: 24 Ameisen, flach, 50 Generationen
r = S(`(() => {
  const col = createColony(1, { episode: { seconds: 10 } });
  for (let g = 0; g < 50; g++) colonyStep(col);
  return { weg: col.best.progress, rutscht: col.best.slipFrac, evals: col.episodes };
})()`);
check("Kolonie lernt auf flachem Boden: > 8 cm in 10 s", r.weg > 8, r);
done();
