// Fest programmierter Dreifuss-Gang (Tripod) zum Testen der Physik.
// Gruppe A = L1, R2, L3 und Gruppe B = R1, L2, R3 sind um eine halbe Periode versetzt.
// Standphase (Fuss unten): Fuss läuft gerade nach hinten und schiebt den Körper vorwärts.
// Schwungphase (Fuss oben): Fuss wird angehoben und wieder nach vorne gebracht.
// Die Gelenkwinkel kommen aus der inversen Kinematik (legIK) – das Netz muss das später selbst lernen.

const GAIT_DEFAULTS = {
  freq: 3,          // Schritte pro Sekunde
  stride: 0.2,      // halbe Schrittlänge in cm
  lift: 0.15,       // Hubhöhe des Fusses in cm
  turn: 0,          // -1 .. 1, positiv: links kürzere Schritte -> Drehung nach links (±50 % Schrittlänge)
};

const TRIPOD_GROUP = [0, 1, 0, 1, 0, 1];   // L1 L2 L3 R1 R2 R3

function tripodTargets(ant, t, p) {
  for (let l = 0; l < 6; l++) {
    const leg = ANT_GEOM.legs[l];
    const phase = 2 * Math.PI * p.freq * t + (TRIPOD_GROUP[l] ? Math.PI : 0);
    const sn = Math.sin(phase);
    const stride = p.stride * (1 - 0.5 * leg.side * p.turn);
    const fx = NEUTRAL_FEET[l].x + stride * Math.cos(phase);
    const fz = STANCE_Z + (sn < 0 ? -sn * p.lift : 0);
    ant.targets.set(legIK(leg, fx, NEUTRAL_FEET[l].y, fz), l * 3);
  }
}
