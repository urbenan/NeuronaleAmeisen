// Duftfeld und Fühler-Sensoren.
// Die Duftquelle liegt oben am Hang (auf der Ziellinie). Konzentration C = exp(-Abstand / λ), 0..1.
// Jede Fühlerspitze misst C (optional mit Rauschen). Für das Netz werden daraus normierte Werte:
//   intensity = Mittelwert von C (0 = weit weg, 1 = an der Quelle)
//   diff      = (ln C_links − ln C_rechts) · λ / Fühlerabstand, etwa −1..+1
//               > 0: Duft kommt eher von links,  < 0: eher von rechts
// Der Logarithmus wirkt wie beim echten Geruchssinn: Er misst relative Unterschiede, damit die
// Richtung auch weit weg von der Quelle noch erkennbar ist.

const SCENT_DEFAULTS = {
  x: 0, y: 20,     // Quelle, Weltkoordinaten in cm (y = Ziellinie)
  lambda: 10,      // Reichweite in cm (Abfall auf 37 %)
  noise: 0,        // relatives Messrauschen pro Fühler, z. B. 0.05 = 5 %
};

function scentAt(scent, x, y) {
  return Math.exp(-Math.hypot(x - scent.x, y - scent.y) / scent.lambda);
}

// Normalverteilte Zufallszahl; rng liefert gleichverteilt 0..1 (für reproduzierbare Episoden austauschbar)
function gauss(rng) {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

function senseScent(ant, scent, rng = Math.random) {
  const [l, r] = antennaPoints(ant);
  const read = (p) => {
    const c = scentAt(scent, p.tip.x, p.tip.y);
    return scent.noise > 0 ? Math.max(1e-9, c * (1 + scent.noise * gauss(rng))) : c;
  };
  const left = read(l), right = read(r);
  const span = Math.hypot(l.tip.x - r.tip.x, l.tip.y - r.tip.y);
  const diff = (Math.log(left) - Math.log(right)) * scent.lambda / span;
  return { left, right, intensity: (left + right) / 2, diff: Math.max(-1.5, Math.min(1.5, diff)) };
}

// Einfache Test-Lenkung (Braitenberg): stärker riechende Seite -> dorthin drehen.
// Geglättet (Zeitkonstante tau), weil der Kopf beim Gehen hin und her pendelt.
// Nur zum Prüfen der Sensoren; später übernimmt das Netz.
function scentSteer(prevTurn, sense, gain, dt, tau = 0.3) {
  const want = Math.max(-1, Math.min(1, gain * sense.diff));
  return prevTurn + (want - prevTurn) * Math.min(1, dt / tau);
}
