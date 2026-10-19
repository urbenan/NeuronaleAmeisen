// Kolonie: viele Ameisen, jede mit eigenem Netz, lernen gemeinsam per genetischem Algorithmus.
//   1. Jede Ameise läuft ihre Episoden (gleiche Welt, gleiche Startrichtungen) -> Fitness
//   2. Die besten `elite` Ameisen kommen unverändert in die nächste Generation
//   3. Die übrigen Plätze: zwei Eltern per Turnier (die beste von `tournament` zufälligen Ameisen),
//      Kreuzung, dann Mutation (Gauss-Rauschen sigma)
// Kreuzung pro verborgenem Neuron: Das Kind übernimmt Neuron j vollständig (Eingangsgewichte aus W1,
// Schwelle b1, Ausgangsgewichte aus W2) von Mutter oder Vater. So bleiben funktionierende Bausteine
// erhalten; einzelne Gewichte zu mischen würde sie meist zerstören. b2 kommt je Ausgang von einem Elternteil.
// Curriculum wie bei der einzelnen Ameise: Schafft die beste Ameise alle Starts, wird es steiler.

const GA_DEFAULTS = { size: 24, elite: 2, tournament: 3, crossover: 0.7, sigma: 0.07 };

function crossoverNeurons(a, b, rng) {
  const c = netClone(a), H = a.nHid, I = a.nIn, O = a.nOut;
  for (let j = 0; j < H; j++) {
    if (rng() < 0.5) continue;
    for (let i = 0; i < I; i++) c.W1[i * H + j] = b.W1[i * H + j];
    c.b1[j] = b.b1[j];
    for (let k = 0; k < O; k++) c.W2[j * O + k] = b.W2[j * O + k];
  }
  for (let k = 0; k < O; k++) if (rng() < 0.5) c.b2[k] = b.b2[k];
  return c;
}

function createColony(seed, opts = {}) {
  const p = { ...GA_DEFAULTS, ...opts };
  const nets = opts.nets ? opts.nets.map(netClone) : Array.from({ length: p.size }, (_, i) => createBrain(seed * 1000 + i + 1));
  const col = {
    kind: "colony", seed, rng: makeRng(seed ^ 0x51ed270b),
    size: nets.length, elite: p.elite, tournament: p.tournament, crossover: p.crossover, sigma: p.sigma,
    episode: { ...(opts.episode || {}) },
    curriculum: opts.curriculum ? { ...CURRICULUM_DEFAULTS, ...opts.curriculum } : null,
    members: nets.map((net, i) => ({ net, res: null, id: i + 1, parents: null })),
    nextId: nets.length + 1,
    generation: 0, episodes: 0, cursor: 0,
    best: null, bestNet: null,      // beste Ameise der zuletzt fertigen Generation
    history: [],
  };
  if (col.curriculum) col.episode.world = { ...(col.episode.world || {}), slopeDeg: col.curriculum.slope };
  return col;
}

function tournamentPick(col, ranked) {
  let best = null;
  for (let t = 0; t < col.tournament; t++) {
    const m = ranked[Math.floor(col.rng() * ranked.length)];
    if (!best || m.res.fitness > best.res.fitness) best = m;
  }
  return best;
}

// Eine Ameise bewerten. Gibt die abgeschlossene Generation zurück, sobald alle bewertet sind.
function colonyTick(col) {
  // bereits bewertete Ameisen (Elite mit unveränderter Welt) überspringen
  while (col.cursor < col.members.length && col.members[col.cursor].res) col.cursor++;
  if (col.cursor < col.members.length) {
    const m = col.members[col.cursor++];
    m.res = evaluate(m.net, col.episode);
    col.episodes++;
    if (col.cursor < col.members.length) return null;
  }
  return colonyNextGeneration(col);
}

function colonyNextGeneration(col) {
  const ranked = [...col.members].sort((a, b) => b.res.fitness - a.res.fitness);
  const fit = ranked.map((m) => m.res.fitness);
  const top = ranked[0];
  col.best = top.res; col.bestNet = top.net; col.bestId = top.id;
  // fertige Generation in Rangfolge (für die Vorführung: alle Ameisen dieser Generation laufen gleichzeitig)
  col.shown = ranked.map((m, r) => ({ id: m.id, rank: r + 1, net: m.net, res: m.res, parents: m.parents }));
  col.generation++;
  const h = {
    gen: col.generation, episodes: col.episodes, best: fit[0], child: fit[Math.floor(fit.length / 2)],
    mean: fit.reduce((a, v) => a + v, 0) / fit.length, progress: top.res.progress, sigma: col.sigma,
    ok: true, slope: currentSlope(col), levelUp: false,
  };

  // Curriculum: beste Ameise schafft alle Starts -> steiler; dann muss die ganze Kolonie neu bewertet werden
  const c = col.curriculum;
  if (c && c.slope < c.target && top.res.reachedCount === top.res.runs) {
    c.slope = Math.min(c.target, c.slope + c.step);
    col.episode.world = { ...(col.episode.world || {}), slopeDeg: c.slope };
    h.levelUp = true;
  }
  col.history.push(h);

  // nächste Generation
  const next = ranked.slice(0, col.elite).map((m) => ({ ...m, res: h.levelUp ? null : m.res }));
  while (next.length < col.size) {
    const a = tournamentPick(col, ranked);
    let net, parents = [a.id];
    if (col.rng() < col.crossover) {
      const b = tournamentPick(col, ranked);
      net = crossoverNeurons(a.net, b.net, col.rng);
      parents.push(b.id);
    } else {
      net = netClone(a.net);
    }
    netMutate(net, col.sigma, col.rng);
    next.push({ net, res: null, id: col.nextId++, parents });
  }
  col.members = next;
  col.cursor = 0;
  return h;
}

function colonyStep(col) {
  let h = null;
  while (!h) h = colonyTick(col);
  return h;
}

// ---------- Kolonie speichern / laden (alle Netze) ----------
const COLONY_FORMAT = "neuronale-ameisen/kolonie-1";

function colonyToJSON(col, extra = {}) {
  const h = col.history, maxPts = 1500;
  const keep = h.length <= maxPts ? h : h.filter((p, i) => i === h.length - 1 || p.levelUp || i % Math.ceil(h.length / maxPts) === 0);
  return {
    format: COLONY_FORMAT, saved: new Date().toISOString(),
    seed: col.seed, generation: col.generation, episodes: col.episodes, nextId: col.nextId,
    elite: col.elite, tournament: col.tournament, crossover: col.crossover, sigma: col.sigma,
    episode: col.episode, curriculum: col.curriculum,
    members: col.members.map((m) => ({ id: m.id, parents: m.parents, net: netToJSON(m.net) })),
    history: keep.map((p) => ({ ...p, best: +p.best.toFixed(4), child: +p.child.toFixed(4), mean: +p.mean.toFixed(4), progress: +p.progress.toFixed(3) })),
    ...extra,
  };
}

function colonyFromJSON(o) {
  if (!o || o.format !== COLONY_FORMAT) throw new Error("Keine Kolonie-Datei der Neuronalen Ameisen");
  const col = createColony(o.seed, {
    nets: o.members.map((m) => netFromJSON(m.net)), elite: o.elite, tournament: o.tournament,
    crossover: o.crossover, sigma: o.sigma, episode: o.episode, curriculum: o.curriculum,
  });
  o.members.forEach((m, i) => { col.members[i].id = m.id; col.members[i].parents = m.parents; });
  col.rng = makeRng((o.seed ^ o.generation * 2654435761) >>> 0);
  col.generation = o.generation; col.episodes = o.episodes; col.nextId = o.nextId;
  col.history = o.history;
  return col;
}
