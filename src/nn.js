// 3-Schicht-Netz wie beim Ziffern-Projekt: h = tanh(x·W1 + b1), y = tanh(h·W2 + b2).
// Gewichte zeilenweise: W1[i * H + j] verbindet Eingang i mit verborgenem Neuron j,
//                       W2[j * O + k] verbindet verborgenes Neuron j mit Ausgang k.
// Gelernt wird später nicht mit Backpropagation, sondern per Neuroevolution (mutieren + auswählen).

// Reproduzierbarer Zufall (mulberry32): gleicher Startwert -> gleiche Gewichte, gleiche Mutationen
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randn(rng) {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

// Startgewichte ~ N(0, 1/Eingänge), damit tanh nicht gleich in die Sättigung geht; Schwellen 0
function createNet(nIn, nHid, nOut, rng) {
  const net = {
    nIn, nHid, nOut,
    W1: new Float64Array(nIn * nHid), b1: new Float64Array(nHid),
    W2: new Float64Array(nHid * nOut), b2: new Float64Array(nOut),
    // letzte Aktivierungen, für die Anzeige
    x: new Float64Array(nIn), h: new Float64Array(nHid), y: new Float64Array(nOut),
  };
  const s1 = 1 / Math.sqrt(nIn), s2 = 1 / Math.sqrt(nHid);
  for (let i = 0; i < net.W1.length; i++) net.W1[i] = randn(rng) * s1;
  for (let i = 0; i < net.W2.length; i++) net.W2[i] = randn(rng) * s2;
  return net;
}

function netForward(net, x) {
  const { nIn, nHid, nOut, W1, b1, W2, b2, h, y } = net;
  net.x.set(x);
  for (let j = 0; j < nHid; j++) h[j] = b1[j];
  for (let i = 0; i < nIn; i++) {
    const xi = x[i];
    if (xi === 0) continue;
    const row = i * nHid;
    for (let j = 0; j < nHid; j++) h[j] += xi * W1[row + j];
  }
  for (let j = 0; j < nHid; j++) h[j] = Math.tanh(h[j]);
  for (let k = 0; k < nOut; k++) y[k] = b2[k];
  for (let j = 0; j < nHid; j++) {
    const hj = h[j], row = j * nOut;
    for (let k = 0; k < nOut; k++) y[k] += hj * W2[row + k];
  }
  for (let k = 0; k < nOut; k++) y[k] = Math.tanh(y[k]);
  return y;
}

function netClone(net) {
  const c = createNet(net.nIn, net.nHid, net.nOut, () => 0.5);
  for (const k of ["W1", "b1", "W2", "b2"]) c[k].set(net[k]);
  return c;
}

// Mutation: auf jedes Gewicht und jede Schwelle Gauss-Rauschen mit Stärke sigma
function netMutate(net, sigma, rng) {
  for (const k of ["W1", "b1", "W2", "b2"]) {
    const a = net[k];
    for (let i = 0; i < a.length; i++) a[i] += sigma * randn(rng);
  }
  return net;
}

function netParamCount(net) {
  return net.W1.length + net.b1.length + net.W2.length + net.b2.length;
}

function netToJSON(net) {
  const r = (a) => Array.from(a, (v) => +v.toFixed(6));
  return { nIn: net.nIn, nHid: net.nHid, nOut: net.nOut, W1: r(net.W1), b1: r(net.b1), W2: r(net.W2), b2: r(net.b2) };
}

// nIn > o.nIn: zusätzliche Eingänge (am Ende) mit Gewicht 0 – das Netz rechnet genau wie vorher
function netFromJSON(o, nIn = o.nIn) {
  if (nIn > o.nIn) o = { ...o, nIn, W1: o.W1.concat(new Array((nIn - o.nIn) * o.nHid).fill(0)) };
  const net = createNet(o.nIn, o.nHid, o.nOut, () => 0.5);
  for (const k of ["W1", "b1", "W2", "b2"]) {
    if (o[k].length !== net[k].length) throw new Error(`Netz-Datei passt nicht: ${k} hat ${o[k].length} statt ${net[k].length} Werte`);
    net[k].set(o[k]);
  }
  return net;
}
