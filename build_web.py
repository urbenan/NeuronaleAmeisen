"""Offline-Webseite erzeugen: alles in einer Datei, für GitHub Pages und "Zum Home-Bildschirm" am iPhone.

Aufruf:
    python3 build_web.py

Ergebnis im Ordner web/:
    index.html            eigenständige Seite (alle Skripte aus src/ eingebettet, keine externen Dateien)
    viewer.html           Vollbild-Viewer fürs iPhone (Neigung per Lagesensor), mit eingebauter
                          trainierter Kolonie aus trained/kolonie.json (falls vorhanden)
    manifest.webmanifest, manifest-viewer.webmanifest  App-Manifeste ("Zum Home-Bildschirm")
    sw.js                 Service Worker: Seite offline aus dem Cache laden (nur über https/localhost)
    icon-180.png, icon-512.png

Zum Entwickeln einfach die index.html im Projektordner öffnen (lädt src/*.js einzeln).
Nur Python-Standardbibliothek nötig.
"""
import hashlib
import json
import math
import os
import re
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "web")

def head_extra(title, manifest, status="default"):
    return f"""<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="{title}">
<meta name="apple-mobile-web-app-status-bar-style" content="{status}">
<meta name="theme-color" content="#1f4e79">
<link rel="manifest" href="{manifest}">
<link rel="apple-touch-icon" href="icon-180.png">
"""

TRAINED = os.path.join(HERE, "trained", "kolonie.json")

SW_REGISTER = """<script>
// Offline: Service Worker nur über https oder localhost (bei file:// geht es auch ohne)
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js");
}
</script>
"""


def inline_scripts(page):
    def repl(m):
        name = m.group(1)
        with open(os.path.join(HERE, "src", name), encoding="utf-8") as f:
            code = f.read()
        if "</script" in code:
            raise SystemExit(f"src/{name} enthält '</script' – kann nicht eingebettet werden")
        return f"<script>\n// ---- src/{name} ----\n{code}</script>"
    page, n = re.subn(r'<script src="src/([\w.-]+\.js)"></script>', repl, page)
    return page, n


# ---------- Icon: Ameise von oben, ohne Zusatzbibliothek gezeichnet ----------
def ant_icon(size):
    bg, ink = (0xee, 0xf1, 0xf4), (0x3b, 0x24, 0x17)
    s = size / 512
    # Körper (Ellipsen: cx, cy, rx, ry) und Beine/Fühler (Linien: x0, y0, x1, y1, Breite) in 512er-Koordinaten
    ellipses = [(256, 150, 52, 46), (256, 245, 40, 58), (256, 375, 70, 92)]
    lines = []
    for side in (-1, 1):
        for hy, kx, ky, fx, fy in ((215, 110, 150, 70, 80), (245, 115, 250, 50, 270), (275, 120, 345, 75, 440)):
            x0 = 256 + side * 30
            lines.append((x0, hy, 256 + side * (256 - kx), ky, 20))
            lines.append((256 + side * (256 - kx), ky, 256 + side * (256 - fx), fy, 14))
        lines.append((256 + side * 20, 115, 256 + side * 70, 55, 11))
        lines.append((256 + side * 70, 55, 256 + side * 135, 40, 9))

    def seg_dist(px, py, x0, y0, x1, y1):
        dx, dy = x1 - x0, y1 - y0
        t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - x0 - t * dx, py - y0 - t * dy)

    rows = []
    for yy in range(size):
        row = bytearray([0])
        for xx in range(size):
            # Kantenglättung: Abstand zum Rand in Pixeln -> Deckung
            px, py = (xx + 0.5) / s, (yy + 0.5) / s
            cover = 0.0
            for cx, cy, rx, ry in ellipses:
                d = (math.hypot((px - cx) / rx, (py - cy) / ry) - 1) * min(rx, ry) * s
                cover = max(cover, min(1.0, max(0.0, 0.5 - d)))
            if cover < 1:
                for x0, y0, x1, y1, wdt in lines:
                    d = (seg_dist(px, py, x0, y0, x1, y1) - wdt / 2) * s
                    cover = max(cover, min(1.0, max(0.0, 0.5 - d)))
            row += bytes(round(b + (i - b) * cover) for b, i in zip(bg, ink))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


def build_page(src_name, out_name, head, embed=None):
    with open(os.path.join(HERE, src_name), encoding="utf-8") as f:
        page = f.read()
    page, n = inline_scripts(page)
    page = page.replace("</title>\n", "</title>\n" + head, 1)
    page = page.replace("</body>", SW_REGISTER + "</body>", 1)
    if embed is not None:
        marker = "/*__TRAINED__*/null"
        if marker not in page:
            raise SystemExit(f"{src_name}: Platzhalter {marker} fehlt")
        page = page.replace(marker, embed, 1)
    with open(os.path.join(WEB, out_name), "w", encoding="utf-8") as f:
        f.write(page)
    return page, n


def manifest(name, short, start):
    return {
        "name": name, "short_name": short, "lang": "de",
        "start_url": start, "scope": "./", "display": "standalone", "orientation": "portrait",
        "background_color": "#eef1f4", "theme_color": "#1f4e79",
        "icons": [{"src": "icon-180.png", "sizes": "180x180", "type": "image/png"},
                  {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"}],
    }


def main():
    os.makedirs(WEB, exist_ok=True)
    page, n = build_page("index.html", "index.html", head_extra("Ameisen", "manifest.webmanifest"))
    trained = None
    if os.path.exists(TRAINED):
        with open(TRAINED, encoding="utf-8") as f:
            trained = json.dumps(json.load(f), separators=(",", ":"))
    viewer, nv = build_page("viewer.html", "viewer.html",
                            head_extra("Ameisen-Viewer", "manifest-viewer.webmanifest", "black-translucent"),
                            embed=trained or "null")
    # Version (gleich wie der Cache-Name im Service Worker) in den Viewer schreiben
    version = hashlib.sha1((page + viewer).encode()).hexdigest()[:10]
    viewer = viewer.replace('"__BUILD__"', f'"{version}"', 1)
    with open(os.path.join(WEB, "viewer.html"), "w", encoding="utf-8") as f:
        f.write(viewer)

    for size in (180, 512):
        with open(os.path.join(WEB, f"icon-{size}.png"), "wb") as f:
            f.write(ant_icon(size))
    for fname, m in (("manifest.webmanifest", manifest("Neuronale Ameisen", "Ameisen", "./")),
                     ("manifest-viewer.webmanifest", manifest("Ameisen-Viewer", "Ameisen-Viewer", "viewer.html"))):
        with open(os.path.join(WEB, fname), "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False, indent=2)
    sw = f"""// Service Worker: alle Dateien beim ersten Besuch speichern, danach offline aus dem Cache
const CACHE = "ameisen-{version}";
const FILES = ["./", "index.html", "viewer.html", "manifest.webmanifest", "manifest-viewer.webmanifest", "icon-180.png", "icon-512.png"];
self.addEventListener("install", (e) => {{ e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); }});
self.addEventListener("activate", (e) => {{
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
}});
self.addEventListener("fetch", (e) => {{
  e.respondWith(caches.match(e.request, {{ ignoreSearch: true }}).then((r) => r || fetch(e.request)));
}});
"""
    with open(os.path.join(WEB, "sw.js"), "w", encoding="utf-8") as f:
        f.write(sw)
    print(f"web/index.html erzeugt ({n} Skripte eingebettet, {len(page) // 1024} KB)")
    print(f"web/viewer.html erzeugt ({nv} Skripte, {len(viewer) // 1024} KB, "
          f"{'mit trainierter Kolonie' if trained else 'OHNE trainierte Kolonie (trained/kolonie.json fehlt)'})")
    print(f"Cache-Version {version}")


if __name__ == "__main__":
    main()
