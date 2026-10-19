# Neuronale Ameisen

Eine virtuelle Ameise mit eigenem neuronalem Netz lernt per **Neuroevolution**, einen Hang hinaufzulaufen
und dabei dem Duft zu folgen – direkt im Browser, ohne Server.

- Körper aus 3 Massenpunkten, 6 zweiteilige Beine mit je 3 Gelenken (α drehen, β heben, γ Knie), 2 Fühler
- Physik: Reibung an den Füssen mit Bodenkontakt (Haften/Gleiten, elastische Beine), Hangabtrieb
- Netz 28 → 16 → 18 (tanh), wie beim Ziffern-Projekt sichtbar: Topologie, Gewichte, Live-Aktivierungen
- Lernen wahlweise als **Kolonie** (24 Ameisen, je eigenes Netz, genetischer Algorithmus mit Kreuzung ganzer
  Neuronen) oder als **eine Ameise** ((1+λ)-Evolutionsstrategie); Curriculum von flach bis 20°, 3 Startrichtungen

## Seiten

- **[Ameisen lernen](https://urbenan.github.io/NeuronaleAmeisen/web/)** – Physik, Netz-Visualisierung und Lernen im Browser
- **[Ameisen-Viewer](https://urbenan.github.io/NeuronaleAmeisen/web/viewer.html)** – trainierte Ameisen im Vollbild,
  die Neigung kommt vom Lagesensor (iPhone schräg halten)

### Viewer auf dem iPhone

1. Link oben in **Safari** öffnen (einmal mit Internet)
2. Teilen-Symbol → **Zum Home-Bildschirm** – startet dann als Vollbild-App, auch ohne Internet
3. **Lagesensor einschalten** antippen und «Bewegung & Ausrichtung» erlauben
4. **Nullpunkt**: die aktuelle Haltung gilt als flach · **Antippen** versetzt die Duftquelle

## Benutzen

- **Entwickeln:** `index.html` im Browser öffnen (lädt die Skripte aus `src/` einzeln)
- **Eine Datei / offline:** `python3 build_web.py` erzeugt `web/` (alles eingebettet, Manifest, Service Worker, Icons)
- **Kolonie trainieren (Kommandozeile):** `node tools/train.js <Startwert> <Bewertungen> trained/kolonie-sN.json`,
  dann `node tools/pick_viewer.js 16 trained/kolonie.json trained/kolonie-s*.json` – wählt die besten Ameisen für
  den Viewer; `build_web.py` baut `trained/kolonie.json` in `web/viewer.html` ein
- **Nachahmungslernen:** `node tools/imitate.js --seed 11 --stride 0.2 --lift 0.15 --steer 0.8 --size 1 --out trained/individuen/ind11.json`
  – Netz lernt den Dreifuss-Gang per Backpropagation (DAgger); `pick_viewer.js` stellt daraus die Viewer-Kolonie zusammen
- **Tests:** `for t in test/test_*.js; do node $t; done` (Physik, Duft, Netz, Lernen, Kolonie; ca. 1–2 Minuten)

Der Lernstand wird automatisch im Browser gesichert; mit «Speichern (.json)» / «Laden (.json)» lässt er
sich als Datei sichern und auf einem anderen Gerät weiterführen.

## Dateien

| Datei | Inhalt |
|---|---|
| `src/ant.js` | Geometrie, Gelenke, Vorwärts- und inverse Kinematik, Fühler |
| `src/physics.js` | Körper, Bodenkontakt, Reibung (implizit gelöst), Hang |
| `src/gait.js` | fest programmierter Dreifuss-Gang zum Testen |
| `src/scent.js` | Duftfeld, Fühler-Sensoren, Test-Lenkung |
| `src/nn.js` | 3-Schicht-Netz, Mutation, Speichern |
| `src/brain.js` | Sensoren → Netz → Gelenke (60 Hz, träge Muskeln) |
| `src/evolution.js` | Episoden, Fitness, (1+λ)-ES, Curriculum, Lernstand |
| `src/imitate.js` | Nachahmungslernen: Lehrer (Dreifuss-Gang), DAgger, Backpropagation mit Adam |
| `src/ga.js` | Kolonie: Elite, Turnier, Kreuzung ganzer Neuronen, Mutation, Speichern |
| `src/render.js`, `netview.js`, `learnview.js`, `main.js` | Zeichnen und Bedienung |
| `PLAN.md` | Plan und Erkenntnisse |
