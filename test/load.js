// Lädt die Quelldateien wie der Browser: klassische Skripte im selben globalen Bereich.
// (runInThisContext statt eigenem vm-Kontext: dort ist jeder Zugriff auf globale Namen etwa 5× langsamer.)
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = ["ant.js", "physics.js", "gait.js", "scent.js", "nn.js", "brain.js", "evolution.js", "ga.js"];
const ctx = globalThis;
for (const f of SRC) vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8"), { filename: f });
const S = (code) => vm.runInThisContext(code);

let failed = 0;
function check(name, ok, info) {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}  ${JSON.stringify(info, (k, v) => typeof v === "number" ? +v.toFixed(3) : v)}`);
  if (!ok) failed++;
}
function done() { process.exit(failed ? 1 : 0); }

module.exports = { S, ctx, check, done };
