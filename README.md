# 🎄 Wichteln mit dem Christkind

Eine warme, familienfreundliche Wichtel-App (Secret Santa auf Österreichisch) – gemacht fürs Handy, ohne Passwörter, ohne Werbung, ohne Tracking. Das Christkind lost aus, niemand – auch nicht die Organisatorin – sieht vorab, wer wen beschenkt.

## Was die App kann

**Für die Organisatorin / den Organisator**
- Runde anlegen: Name, Budget, Datum der Bescherung, persönliche Nachricht
- Familie eintragen – oder einfach **einen Einladungslink** in die WhatsApp-/Signal-Gruppe schicken; alle tippen auf ihren Namen und bekommen ihren **persönlichen Link** (kein Login)
- **Paare** festlegen (die beschenken sich nie gegenseitig), **eigene Regeln** („Opa soll nicht Oma …“) und **„Wie im Vorjahr? Lieber nicht!“**
- Faire Auslosung: jede gültige Zuteilung ist gleich wahrscheinlich; ist eine Auslosung unmöglich, sagt die App warum
- Sehen, wer sich gemeldet und wer schon nachgeschaut hat – ohne die Paarungen zu sehen
- Links neu erstellen, Namen freigeben, Auslosung zurücksetzen, **Auflösung** nach der Bescherung zeigen
- **„Nächstes Jahr wieder wichteln“**: Personen, Paare und Regeln werden übernommen, die Vorjahres-Paarungen automatisch ausgeschlossen

**Für alle in der Familie**
- Feierliches Aufdecken des eigenen Wichtelkinds (mit Sternenregen ✨)
- **Wunschzettel** (optional) mit Links zu Shops, dazu ein paar Zeilen „Über mich“ (Größen, Vorlieben, No-Gos)
- **Anonyme Nachrichten**: dem Wichtelkind Fragen stellen, ohne sich zu verraten – und dem eigenen Christkind antworten
- **Packerl-Fortschritt** (Idee → Besorgt → Eingepackt) und ein **Adventkalender** mit 24 Türchen
- Als App am Startbildschirm installierbar (PWA, Android & iPhone)

**Datenschutz**
- Keine Cookies, kein Tracking, keine Drittanbieter (auch Schriften werden selbst ausgeliefert)
- Wunschzettel, Nachrichten und „Über mich“ werden 60 Tage nach der Bescherung gelöscht, die ganze Runde nach gut einem Jahr
- Persönliche Seiten werden nicht indexiert; Link-Vorschauen verraten nur bei Einladungen den Rundennamen

## Schnellstart

Voraussetzung: **Node.js ≥ 22.13** (wegen des eingebauten `node:sqlite`).

```bash
npm ci
npm run build
npm start            # → http://localhost:8787
```

Damit die Familie im selben WLAN mitmachen kann, die Adresse des Rechners verwenden (z. B. `http://192.168.0.10:8787`). Für den echten Einsatz übers Internet siehe [Hosting](#hosting).

## Entwicklung

```bash
npm run dev          # API (tsx watch, :8787) + Vite (:5173) mit Hot Reload
npm test             # Vitest: Auslosung + API
npm run typecheck    # TypeScript für Client und Server
npm run assets       # Bilder aus design/source in client/public/img neu erzeugen
```

Tipp: Mit `FAKE_TODAY=2026-12-10 npm run dev:server` lässt sich der Adventkalender oder die Bescherung ausprobieren.

### Aufbau

| Ordner | Inhalt |
| --- | --- |
| `client/` | React 19 + React Router + Tailwind CSS 4 (Vite), mobile-first PWA |
| `server/` | Hono-API, SQLite über `node:sqlite`, Auslosung (`draw.ts`), Aufräumen (`maintenance.ts`) |
| `shared/` | Gemeinsame Typen & Limits für Client und Server |
| `design/source/` | Original-Illustrationen (Christkind, Strohstern, Packerl, Adventkranz …) |
| `scripts/` | Bildverarbeitung (sharp) für responsive WebP-Varianten, Icons und OG-Bild |

`npm run build` erzeugt `dist/client` (statische Dateien) und `dist/server/index.js` (ein einziges Bundle ohne `node_modules`).

## Hosting

### Docker

```bash
docker build -t wichteln .
docker run -d --name wichteln -p 8787:8787 -v wichteln-data:/data \
  -e PUBLIC_URL=https://wichteln.example.at wichteln
```

Hinter einem internen npm-Mirror: `docker build --build-arg NPM_REGISTRY=https://mein-mirror/npm/ -t wichteln .`

Die Datenbank liegt im Volume `/data`. Für ein Backup den Container kurz stoppen und `wichteln.db` aus dem Volume kopieren.

### Hinter einem Reverse Proxy

Die App sollte übers Internet **nur per HTTPS** erreichbar sein (z. B. Caddy, Traefik, nginx, Azure Container Apps, Fly.io). Dann `TRUST_PROXY=true` setzen, damit Rate-Limits und Link-Vorschauen die echte Adresse verwenden, oder gleich `PUBLIC_URL` angeben.

### Umgebungsvariablen

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `PORT` | `8787` | HTTP-Port |
| `HOST` | `0.0.0.0` | Adresse, auf der gelauscht wird |
| `DATA_DIR` | `./data` | Ordner für die Datenbank |
| `DB_FILE` | `$DATA_DIR/wichteln.db` | Pfad zur SQLite-Datei (überschreibt `DATA_DIR`) |
| `CLIENT_DIR` | `dist/client` | Ordner mit dem gebauten Frontend |
| `PUBLIC_URL` | – | Öffentliche Adresse für absolute Links in Vorschauen, z. B. `https://wichteln.example.at` |
| `TRUST_PROXY` | `false` | `X-Forwarded-*`-Header eines Reverse Proxys vertrauen |
| `PURGE_CONTENT_DAYS` | `60` | Tage nach der Bescherung, bis Wunschzettel, Nachrichten und „Über mich“ gelöscht werden |
| `DELETE_GROUP_DAYS` | `400` | Tage nach der Bescherung (bzw. Erstellung), bis die ganze Runde gelöscht wird |
| `FAKE_TODAY` | – | Nur für Tests/Demos: heutiges Datum (`YYYY-MM-DD`) vorgeben |

## Sicherheit in Kürze

- Zufällige, lange Geheimlinks statt Passwörtern (Organisator 192 Bit, persönliche Links 144 Bit)
- Strenge Content-Security-Policy, `no-referrer`, kein Einbetten in fremde Seiten
- Rate-Limits für Erstellen, Einlösen von Einladungen und Nachrichten
- Eingaben werden serverseitig mit zod geprüft und begrenzt
