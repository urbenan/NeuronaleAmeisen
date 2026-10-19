// Nachahmungslernen auf der Kommandozeile: Netz lernt den Dreifuss-Gang per Backpropagation (DAgger),
// daraus wird eine Startkolonie für die Evolution (vorgeübtes Netz + leicht mutierte Kopien).
//   node tools/imitate.js --seed 1 --hidden 16 --rounds 6 --out trained/vorgeuebt-h16.json
//   Lehrer-Gang variieren (jede Ameise ein eigener Stil): --stride 0.2 --lift 0.15 --steer 0.8
// Die Datei lässt sich mit tools/train.js --from weiter verbessern, in der Hauptseite laden und im Viewer zeigen.
const fs = require("fs");
const { S } = require("../test/load");
const GAIT_DEFAULTS_CLI = S("GAIT_DEFAULTS");

const arg = (name, def) => { const i = process.argv.indexOf("--" + name); return i < 0 ? def : process.argv[i + 1]; };
globalThis.cfg = { seed: +arg("seed", 1), hidden: +arg("hidden", 16), rounds: +arg("rounds", 6),
  episodes: +arg("episodes", 40), out: arg("out", "trained/vorgeuebt.json"), size: +arg("size", 24),
  stride: +arg("stride", GAIT_DEFAULTS_CLI.stride), lift: +arg("lift", GAIT_DEFAULTS_CLI.lift), steer: +arg("steer", 0.8) };
globalThis.say = (s) => console.log(s);
const t0 = Date.now();
const json = S(`(() => {
  const gait = { ...IMITATE_DEFAULTS.gait, stride: cfg.stride, lift: cfg.lift };
  const net = imitate(cfg.seed, { rounds: cfg.rounds, hidden: cfg.hidden, episodes: cfg.episodes, gait, steerGain: cfg.steer, log: say });
  // Startkolonie: das vorgeübte Netz und leicht mutierte Kopien davon
  const rng = makeRng(cfg.seed + 99);
  const nets = [net, ...Array.from({ length: cfg.size - 1 }, () => netMutate(netClone(net), 0.003, rng))];
  const ep = { seconds: 15, slipWeight: 1, world: { slopeDeg: 0, mu: WORLD_DEFAULTS.mu }, scent: { ...SCENT_DEFAULTS },
               starts: [90, 50, 130], slopeMix: [1, 0.5, 0], brain: { slopeSense: true } };
  const col = createColony(cfg.seed, { nets, episode: ep, sigma: 0.004, curriculum: { slope: 0, target: 30, step: 2 } });
  const ui = { seconds: 15, lambda: 8, slipWeight: 1, curriculum: true, target: 30, step: 2, starts: 3, mix: 3,
               method: "colony", size: col.size, gaSigma: col.sigma, crossover: col.crossover };
  return JSON.stringify(colonyToJSON(col, { netSeed: cfg.seed, ui, mu: ep.world.mu, summary: { imitation: true, hidden: cfg.hidden, stride: cfg.stride, lift: cfg.lift, steer: cfg.steer } }));
})()`);
fs.writeFileSync(cfg.out, json);
console.log(`gespeichert: ${cfg.out} (${Math.round(json.length / 1024)} KB, ${((Date.now() - t0) / 60000).toFixed(1)} min)`);
