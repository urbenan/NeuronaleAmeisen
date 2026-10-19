# Neuronale Ameisen – Plan

Virtuelle Ameisen, jede mit eigenem 3-Schicht-Netz, lernen per **Neuroevolution** eine schiefe Ebene
hinauf zu laufen und einem Duftgradienten zu folgen. Läuft im Browser (2D von oben, intern 2.5D).

## Modell
- Körper: 3 Massenpunkte (Kopf, Thorax, Abdomen), starr; Zustand x, y, Drehung, Geschwindigkeiten.
- 6 Beine, je 2 Segmente; pro Bein 3 Gelenke: α Hüfte drehen (von oben sichtbar), β Hüfte heben (Z), γ Knie (Z).
- Fuss mit z <= 0 hat Bodenkontakt: Haften über Ankerpunkt (Feder/Dämpfer, implizit gelöst), begrenzt auf μ·N.
- Hangabtrieb m·g·sin φ; bei < 3 Standbeinen trägt der Bauch einen Teil des Gewichts (Bauchreibung).
- 2 Fühler (zweiteilig); Spitzen dienen als Duftsensoren.

## Netz (gleiches Prinzip wie Ziffern-Projekt, anders gelernt)
- Eingang 28: Duft Stärke + Richtung, sin/cos Taktgeber, 6 Fusskontakte, 18 Gelenkwinkel (Schwellen b1/b2 statt Bias-Eingang).
- Versteckt 16 (tanh), Ausgang 18 Gelenk-Sollwerte (tanh -> Gelenkbereich). 770 Parameter.
- Netz rechnet mit 60 Hz, Muskeln folgen mit 50 ms Verzögerung (sonst zittern Zufallsnetze mit 50–90 Hz).
- Lernen: (1+λ)-Evolutionsstrategie, λ = 8 Varianten pro Generation, σ adaptiv (1/5-Regel), σ ≥ 0.05.
  (1+1) blieb in Versuchen meist in Sackgassen stecken. Später Population + GA.
- Fitness: Weg zur Duftquelle × (1 − Rutschanteil); am Ziel Bonus + 2 pro gesparte Sekunde.
  (Feste Rutsch-Strafe war eine Falle: Stillstehen gewann.) Beine sind elastisch (legGive 0.5 mm),
  sonst lernt die Ameise nur "Schrubben" mit 97 % rutschenden Füssen.
- Curriculum: erst flach; kommt das beste Netz bei allen Starts oben an, +2° bis zur Ziel-Neigung (20°).
  Direkt am 20°-Hang lernt die Ameise nur stillzustehen. Mit Curriculum nach 10 000 Bewertungen:
  Startnetz 3 erreicht 20°, Startnetz 1 bleibt bei 12°, Startnetz 2 bei 8° (stark vom Startnetz abhängig).
- 3 Startrichtungen (hangaufwärts, ±40°), Fitness = Mittelwert: zwingt das Netz, den Duft zu nutzen.

## Schritte
1. ✅ Physik + Ameise + Handsteuerung + Dreifuss-Gang (inverse Kinematik) – `node test/test_physics.js`
2. ✅ Duftfeld + Fühler-Sensoren + Test-Lenkung (Braitenberg) – `node test/test_scent.js`
3. ✅ Netz (`nn.js`, `brain.js`) + Netz-Visualisierung (Topologie, Gewichte/Signal, Live-Aktivierungen, W1/W2) – `node test/test_nn.js`
4. ✅ Lernschleife (1+λ)-ES mit Lerntempo bis Turbo, Lernkurve, Vorführung des besten Netzes – `node test/test_evolution.js`
5. ✅ Schiefe Ebene, Zeit-Fitness, Curriculum, 3 Startrichtungen
6. ✅ Lernstand automatisch im Browser + als .json, `build_web.py` -> `web/` (eine Datei, Manifest, Service Worker, Icons)
   – offen: Veröffentlichen auf GitHub Pages
7. Später: viele Ameisen, GA, 3D

## Nachahmungslernen (nach Schritt 7)
- Befund: Evolution von Zufallsnetzen aus findet nur "Schrubbel-Gänge" (≈50 % rutschende Kontakte);
  am Hang reicht das nicht (20°: 17 %, 25°: 0 % kommen oben an). Die Physik ist nicht die Grenze:
  der programmierte Dreifuss-Gang läuft bis 25° fast mit voller Geschwindigkeit ohne Rutschen.
- Steigungssinn (Eingänge Hang vorne/seitlich) + Neigungsmix allein brachten keinen klaren Gewinn.
- Lösung: Netz lernt den Dreifuss-Gang per Backpropagation nachzuahmen (DAgger, `src/imitate.js`).
  Wichtig: Der Lehrer muss über dieselben trägen Muskeln steuern; nur vorauszurechnen reichte nicht
  (Ausschlag auf 73 % gedämpft, Bauch schleift). Umkehrung des Muskelfilters: u = Ziel + τ·Ziel'.
- Ergebnis: 8 Individuen mit eigenem Gangstil, alle 100 % oben bei 0°–25° (3 Startrichtungen).
- Der Gang ist empfindlich: Mutation σ 0.01 senkt den Erfolg auf ~70 %. Evolution danach nur mit
  sehr feiner Mutation (σ ≈ 0.004).
