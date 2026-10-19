// Lernen per Neuroevolution: (1+λ)-Evolutionsstrategie.
//   1. λ Kinder = Kopien des Elternnetzes, alle Gewichte leicht verändert (Gauss-Rauschen, Stärke sigma)
//   2. Jedes Kind läuft eine Episode -> Fitness
//   3. Ist das beste Kind mindestens so gut wie die Eltern, ersetzt es sie, sonst bleiben die Eltern
//   sigma passt sich an (1/5-Erfolgsregel): bei Erfolg grösser (mutiger), bei Misserfolg kleiner.
// Mit λ = 1 ist das die einfachste Form ("mutieren, besser -> behalten"). Versuche zeigten aber:
// λ = 8 und sigma >= 0.05 bleiben viel seltener in einer Sackgasse stecken.

const EPISODE_DEFAULTS = {
  seconds: 10,            // maximale Dauer
  world: { slopeDeg: 0 }, // Abweichungen von WORLD_DEFAULTS; Schritt 4: zuerst flach
  scent: {},              // Abweichungen von SCENT_DEFAULTS
  start: { x: 0, y: 0, headingDeg: 90 },
  starts: null,           // mehrere Startrichtungen, z. B. [90, 50, 130]: Fitness = Mittelwert (zwingt zum Duft-Folgen)
  slopeMix: null,         // mehrere Neigungen als Anteil der aktuellen, z. B. [1, 0.5, 0]: verlernt das Flache nicht
  slipWeight: 1,          // 1: nur der Weg mit haftenden Füssen zählt (Fitness × (1 − Rutschanteil))
};

const EVOLUTION_DEFAULTS = { lambda: 8, sigma: 0.1, sigmaMin: 0.05, sigmaMax: 0.5 };

// Curriculum: erst flach lernen; erreicht das beste Netz bei allen Starts das Ziel, wird es steiler.
const CURRICULUM_DEFAULTS = { slope: 0, target: 20, step: 2 };

// Eine Episode ohne Zeichnen. Fitness = wie viel näher die Ameise der Duftquelle gekommen ist (cm);
// am Ziel: Bonus + gesparte Zeit (je schneller, desto besser). Positive Fitness wird mit
// (1 − Rutschanteil) gewichtet: Schrubben mit rutschenden Füssen zählt kaum, Stillstehen bringt nichts.
// (Eine feste Rutsch-Strafe war eine Falle: Zufallsnetze rutschen viel, Stillstehen gewann immer.)
function runEpisode(net, opts = {}) {
  const o = { ...EPISODE_DEFAULTS, ...opts };
  const world = { ...WORLD_DEFAULTS, ...o.world };
  const scent = { ...SCENT_DEFAULTS, ...o.scent };
  const ant = createAnt(o.start.x, o.start.y, o.start.headingDeg * DEG);
  const ctrl = createController(net, { ...BRAIN_DEFAULTS, ...(o.brain || {}) }, world);
  const dt = PHYSICS_DT, steps = Math.round(o.seconds / dt);
  const d0 = Math.hypot(ant.x - scent.x, ant.y - scent.y);
  const trail = o.trail ? [{ x: ant.x, y: ant.y }] : null;
  let slip = 0, contact = 0, reached = null, t = 0;
  for (let s = 0; s < steps; s++) {
    controllerStep(ctrl, ant, senseScent(ant, scent), t);
    physicsStep(ant, world, dt);
    t += dt;
    for (let l = 0; l < 6; l++) { contact += ant.contact[l]; slip += ant.slipping[l]; }
    if (trail && s % 24 === 0) trail.push({ x: ant.x, y: ant.y });
    if (ant.y >= scent.y) { reached = t; break; }
  }
  const progress = d0 - Math.hypot(ant.x - scent.x, ant.y - scent.y);
  const slipFrac = contact ? slip / contact : 0;
  const base = reached !== null ? d0 + 10 + 2 * (o.seconds - reached) : progress;
  const fitness = base > 0 ? base * (1 - o.slipWeight * slipFrac) : base;
  return { fitness, progress, reached, seconds: t, slipFrac, x: ant.x, y: ant.y, trail };
}

// Bewertung über alle Startrichtungen (und ggf. Neigungen): Mittelwerte; Ziel gilt als erreicht,
// wenn es bei allen Läufen klappt
function evaluate(net, opts = {}) {
  const starts = opts.starts && opts.starts.length ? opts.starts : null;
  const mix = opts.slopeMix && opts.slopeMix.length ? opts.slopeMix : null;
  if (!starts && !mix) { const r = runEpisode(net, opts); return { ...r, reachedCount: r.reached !== null ? 1 : 0, runs: 1 }; }
  const w = { ...EPISODE_DEFAULTS.world, ...(opts.world || {}) };
  const heads = starts || [(opts.start || EPISODE_DEFAULTS.start).headingDeg];
  const res = [];
  for (const h of heads) for (const f of mix || [1]) {
    res.push(runEpisode(net, { ...opts, start: { x: 0, y: 0, headingDeg: h }, world: { ...w, slopeDeg: w.slopeDeg * f } }));
  }
  const mean = (k) => res.reduce((a, r) => a + r[k], 0) / res.length;
  const reachedCount = res.filter((r) => r.reached !== null).length;
  return {
    fitness: mean("fitness"), progress: mean("progress"), slipFrac: mean("slipFrac"),
    reached: reachedCount === res.length ? Math.max(...res.map((r) => r.reached)) : null,
    reachedCount, runs: res.length, perStart: res,
  };
}

function createEvolution(seed, opts = {}) {
  const p = { ...EVOLUTION_DEFAULTS, ...opts };
  const parent = opts.parent ? netClone(opts.parent) : createBrain(seed);
  const evo = {
    seed, rng: makeRng(seed ^ 0x9e3779b9), parent,
    lambda: p.lambda, sigma: p.sigma, sigmaMin: p.sigmaMin, sigmaMax: p.sigmaMax,
    episode: { ...(opts.episode || {}) },
    curriculum: opts.curriculum ? { ...CURRICULUM_DEFAULTS, ...opts.curriculum } : null,
    best: null, generation: 0, accepted: 0, episodes: 1,
    pending: null,         // laufende Generation: bestes Kind bisher und Anzahl gelaufener Kinder
    history: [],           // pro Generation: Fitness der Eltern und des besten Kindes
  };
  if (evo.curriculum) evo.episode.world = { ...(evo.episode.world || {}), slopeDeg: evo.curriculum.slope };
  evo.best = evaluate(parent, evo.episode);
  evo.history.push({ gen: 0, episodes: 1, best: evo.best.fitness, child: evo.best.fitness, progress: evo.best.progress, sigma: evo.sigma, ok: true, slope: currentSlope(evo) });
  return evo;
}

function currentSlope(evo) {
  return evo.episode.world && evo.episode.world.slopeDeg != null ? evo.episode.world.slopeDeg : EPISODE_DEFAULTS.world.slopeDeg;
}

// Nächste Stufe, wenn das beste Netz bei allen Starts oben ankommt. Gibt true zurück, wenn es steiler wurde.
function curriculumCheck(evo) {
  const c = evo.curriculum;
  if (!c || c.slope >= c.target || evo.best.reachedCount < evo.best.runs) return false;
  c.slope = Math.min(c.target, c.slope + c.step);
  evo.episode.world = { ...(evo.episode.world || {}), slopeDeg: c.slope };
  evo.best = evaluate(evo.parent, evo.episode);     // unter den neuen Bedingungen neu bewerten
  return true;
}

// Ein Kind laufen lassen. Gibt die abgeschlossene Generation zurück, sobald alle λ Kinder gelaufen sind.
function evolveTick(evo) {
  if (!evo.pending) evo.pending = { n: 0, net: null, res: null };
  const g = evo.pending;
  const kid = netMutate(netClone(evo.parent), evo.sigma, evo.rng);
  const r = evaluate(kid, evo.episode);
  evo.episodes++;
  if (!g.res || r.fitness > g.res.fitness) { g.net = kid; g.res = r; }
  if (++g.n < evo.lambda) return null;

  evo.pending = null;
  evo.generation++;
  const ok = g.res.fitness >= evo.best.fitness;
  if (ok) { evo.parent = g.net; evo.best = g.res; evo.accepted++; }
  evo.sigma *= ok ? Math.exp(0.2) : Math.exp(-0.05);   // Gleichgewicht bei 20 % Erfolg
  evo.sigma = Math.min(evo.sigmaMax, Math.max(evo.sigmaMin, evo.sigma));
  const levelUp = curriculumCheck(evo);
  const h = { gen: evo.generation, episodes: evo.episodes, best: evo.best.fitness, child: g.res.fitness, progress: evo.best.progress, sigma: evo.sigma, ok, slope: currentSlope(evo), levelUp };
  evo.history.push(h);
  return h;
}

// Eine ganze Generation (für Tests und Skripte)
function evolveStep(evo) {
  let h = null;
  while (!h) h = evolveTick(evo);
  return h;
}

// ---------- Lernstand speichern / laden ----------
// Enthält das beste Netz, Zähler, sigma, Curriculum, Lernwelt und die Lernkurve (auf max. 1500 Punkte
// ausgedünnt). Der Zufallsgenerator wird neu gestartet: Nach dem Laden geht es gleichwertig, aber nicht
// Bit für Bit identisch weiter.
const SAVE_FORMAT = "neuronale-ameisen/lernstand-1";

function evoToJSON(evo, extra = {}) {
  const h = evo.history, maxPts = 1500;
  const keep = h.length <= maxPts ? h : h.filter((p, i) => i === h.length - 1 || p.ok || p.levelUp || i % Math.ceil(h.length / maxPts) === 0);
  return {
    format: SAVE_FORMAT, saved: new Date().toISOString(),
    seed: evo.seed, generation: evo.generation, accepted: evo.accepted, episodes: evo.episodes,
    lambda: evo.lambda, sigma: evo.sigma, sigmaMin: evo.sigmaMin,
    episode: evo.episode, curriculum: evo.curriculum,
    net: netToJSON(evo.parent),
    history: keep.map((p) => ({ ...p, best: +p.best.toFixed(4), child: +p.child.toFixed(4), progress: +p.progress.toFixed(3), sigma: +p.sigma.toFixed(4) })),
    ...extra,
  };
}

function evoFromJSON(o) {
  if (!o || o.format !== SAVE_FORMAT) throw new Error("Keine Lernstand-Datei der Neuronalen Ameisen");
  const evo = createEvolution(o.seed, {
    parent: brainFromJSON(o.net), lambda: o.lambda, sigma: o.sigma, sigmaMin: o.sigmaMin,
    episode: o.episode, curriculum: o.curriculum,
  });
  evo.rng = makeRng((o.seed ^ o.generation * 2654435761) >>> 0);
  evo.generation = o.generation; evo.accepted = o.accepted; evo.episodes = o.episodes;
  evo.history = o.history;
  return evo;
}
