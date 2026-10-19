// Lernen prüfen:  node test/test_evolution.js   (dauert etwa 1 Minute)
const { S, check, done } = require("./load");

let r = S(`(() => {
  const net = createBrain(3);
  const a = runEpisode(net, { seconds: 3 }), b = runEpisode(net, { seconds: 3 });
  return { a: a.fitness, b: b.fitness };
})()`);
check("Episode reproduzierbar (gleiches Netz -> gleiche Fitness)", r.a === r.b, r);

r = S(`(() => {
  const e1 = createEvolution(5, { episode: { seconds: 2 } }), e2 = createEvolution(5, { episode: { seconds: 2 } });
  for (let i = 0; i < 3; i++) { evolveStep(e1); evolveStep(e2); }
  const mono = e1.history.every((h, i) => i === 0 || h.best >= e1.history[i - 1].best);
  return { f1: e1.best.fitness, f2: e2.best.fitness, episodes: e1.episodes, mono };
})()`);
check("Lernlauf reproduzierbar (gleicher Startwert)", r.f1 === r.f2, r);
check("Beste Fitness sinkt nie, 1 + 3·8 Episoden gezählt", r.mono && r.episodes === 25, r);

r = S(`(() => {
  const evo = createEvolution(2, { episode: { seconds: 2, starts: [90, 50, 130] }, curriculum: { target: 5, step: 2 } });
  const runs = evo.best.runs, before = currentSlope(evo);
  const no = curriculumCheck(evo);                       // Zufallsnetz kommt nicht an -> bleibt flach
  const steps = [];
  for (let i = 0; i < 4; i++) { evo.best.reachedCount = evo.best.runs; curriculumCheck(evo); steps.push(currentSlope(evo)); }
  return { runs, before, no, steps };
})()`);
check("Curriculum: 3 Starts, bleibt flach ohne Erfolg, dann 2° → 4° → 5° (Ziel) und nicht weiter",
  r.runs === 3 && r.before === 0 && !r.no && r.steps.join() === "2,4,5,5", r);

r = S(`(() => {
  const evo = createEvolution(4, { episode: { seconds: 2, starts: [90, 50] }, curriculum: { target: 10, step: 2 } });
  for (let i = 0; i < 3; i++) evolveStep(evo);
  evo.curriculum.slope = 6; evo.episode.world.slopeDeg = 6;
  const text = JSON.stringify(evoToJSON(evo, { ui: { tempo: "turbo" } }));
  const back = evoFromJSON(JSON.parse(text));
  const same = ["W1", "b1", "W2", "b2"].every((k) => back.parent[k].every((v, i) => Math.abs(v - evo.parent[k][i]) < 1e-6));
  let bad = null; try { evoFromJSON({ format: "x" }); } catch (e) { bad = e.message; }
  evolveStep(back);
  return { kb: Math.round(text.length / 1024), same, gen: back.generation, slope: currentSlope(back), hist: back.history.length, bad };
})()`);
check("Lernstand speichern/laden: gleiches Netz, Zähler, Curriculum 6°, lernt weiter", r.same && r.gen === 4 && r.slope >= 6 && r.hist === 5 && r.bad, r);

r = S(`(() => {
  const net = createBrain(3);
  const e = evaluate(net, { seconds: 2, world: { slopeDeg: 10 }, starts: [90, 50], slopeMix: [1, 0.5, 0] });
  return { runs: e.runs, slopes: e.perStart.map((p, i) => i) .length };
})()`);
check("Bewertung über 2 Startrichtungen × 3 Neigungen = 6 Läufe", r.runs === 6, r);

// Echter Lerntest: 150 Generationen (1200 Episoden) auf flachem Boden
r = S(`(() => {
  const evo = createEvolution(1, { episode: { seconds: 10 } });
  const start = runEpisode(evo.parent, { seconds: 10 });
  for (let g = 0; g < 150; g++) evolveStep(evo);
  return { startWeg: start.progress, weg: evo.best.progress, rutscht: evo.best.slipFrac, sigma: evo.sigma };
})()`);
check("Lernt auf flachem Boden: nach 1200 Episoden > 8 cm in 10 s, rutscht < 50 %", r.weg > 8 && r.rutscht < 0.5, r);
done();
