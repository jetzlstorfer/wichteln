# 🎄 Wichteln mit dem Christkind

Eine warme, familienfreundliche Wichtel-App (Secret Santa auf Österreichisch) – gemacht fürs Handy, ohne Passwörter, ohne Werbung, ohne Tracking. Das Christkind lost aus. Jede Person sieht nur die eigene Zuteilung; der Organisator-Link gewährt keinen Zugriff auf fremde persönliche Seiten.

Online: **https://wichteln.jetzlstorfer.org**

![Startseite von Wichteln mit dem Christkind](docs/screenshot.png)

## Was die App kann

**Für die Organisatorin / den Organisator**
- Runde anlegen: Name, Budget, Datum der Bescherung, persönliche Nachricht
- Familie eintragen – oder **einen Einladungslink** in die WhatsApp-/Signal-Gruppe schicken; jede Person wählt ihren eigenen Namen
- Sofort zur eigenen Seite mit einem **zufälligen persönlichen Link** – kein Code, kein Passwort, keine E-Mail und keine Freigabe nötig. Der Link wird auf diesem Gerät gespeichert und sollte zusätzlich privat gesichert werden
- **Paare** festlegen (die beschenken sich nie gegenseitig), **eigene Regeln** („Opa soll nicht Oma …“) und **„Wie im Vorjahr? Lieber nicht!“**
- Faire Auslosung: jede gültige Zuteilung ist gleich wahrscheinlich; ist eine Auslosung unmöglich, sagt die App warum
- Sehen, wer sich gemeldet und wer schon nachgeschaut hat – ohne die Paarungen zu sehen
- **Auslosen, auch bevor alle ihren Namen ausgewählt haben**: Alle eingetragenen Personen werden einbezogen; bei noch offenen Namen erscheint eine Warnung. Die Namensauswahl bleibt danach möglich und öffnet die bestehende Zuteilung, ohne neu auszulosen. Personen und Regeln bleiben nach der Auslosung gesperrt. Bitte vorher sicherstellen, dass alle mitmachen
- Vergebene Namen bleiben gesperrt; persönliche Links kann die organisierende Person nie anzeigen. Geht ein Link verloren, kann sie ihn aber **neu ausstellen**: Der alte Link funktioniert dann sofort nicht mehr, und die Person sieht auf ihrer Seite einen Hinweis darauf
- Auslosung bei Bedarf zurücksetzen

**Für alle in der Familie**
- Feierliches Aufdecken des eigenen Wichtelkinds (mit Sternenregen ✨)
- **Wunschzettel** (optional) mit Links zu Shops, dazu ein paar Zeilen „Über mich“ (Größen, Vorlieben, No-Gos)
- **Anonyme Nachrichten**: dem Wichtelkind Fragen stellen, ohne sich zu verraten – und dem eigenen Christkind antworten
- **Adventkalender** mit 24 Türchen
- Als App am Startbildschirm installierbar (PWA, Android & iPhone)

**Datenschutz**
- Keine Cookies, kein Tracking, keine Drittanbieter (auch Schriften werden selbst ausgeliefert)
- Wunschzettel, Nachrichten und „Über mich“ werden 60 Tage nach der Bescherung gelöscht, die ganze Runde nach gut einem Jahr
- Persönliche Seiten werden nicht indexiert; Link-Vorschauen verraten nur bei Einladungen den Rundennamen

## Zurückgestellte Ideen

Diese Funktionen sind bewusst aus der aktuellen Oberfläche entfernt:

- **Packerl-Fortschritt**: freiwillig „Idee → Besorgt → Eingepackt“ abhaken, mit einer gemeinsamen Übersicht, wie viele Packerln fertig sind.
- **„Nach der Bescherung“**: eine gemeinsame Auflösung, wer wen beschenkt hat. Falls die Funktion zurückkommt, muss weiterhin jede Person auf ihrer eigenen Seite zustimmen, bevor die Organisator:in die Paarungen veröffentlicht. Von einem neu ausgestellten Link aus ist keine Zustimmung möglich, weil die Organisator:in diesen Link gesehen hat. Bis dahin bleibt die Auslosung geheim; eine Veröffentlichung lässt sich nicht zurücknehmen.
- **„Nächstes Jahr wieder wichteln“**: Personen, Paare und Regeln übernehmen und die Vorjahres-Paarungen ausschließen. Diese Übernahme darf erst nach einer gemeinsam freigegebenen Auflösung möglich sein, damit sichtbare Ausschlussregeln keine noch geheimen Zuteilungen verraten.

Vorhandene Daten und die abgesicherten API-Endpunkte bleiben kompatibel. Bereits veröffentlichte Auflösungen aus Altrunden bleiben lesbar; nur für solche Runden bleibt auch die Übernahme ins nächste Jahr verfügbar.

## Schnellstart

Voraussetzung: **Node.js ≥ 22.13**. Die App verwendet Azure Table Storage; lokal ersetzt **Azurite** den Azure-Dienst. SQLite wird nur noch für den Import alter Daten benötigt.

```bash
npm ci
npm run dev:storage # in einem eigenen Terminal laufen lassen
```

In einem zweiten Terminal:

```bash
npm run build
npm start            # → http://localhost:8787
```

Damit die Familie im selben WLAN mitmachen kann, die Adresse des Rechners verwenden (z. B. `http://192.168.0.10:8787`). Für den echten Einsatz übers Internet siehe [Hosting](#hosting).

## Entwicklung

```bash
npm run dev          # API (tsx watch, :8787) + Vite (:5173) mit Hot Reload
npm run lint         # Biome: TypeScript, React und JavaScript-Skripte (keine Warnungen)
npm test             # Vitest: Auslosung + API
npm run test:tables  # gesamte Suite mit eigenem Azurite, Zufallsport und temporären Testdaten
npm run verify       # Lint, Typen, beide Test-Backends, Build und HTTP-/Aufräum-Test des Bundles
npm run typecheck    # TypeScript für Client und Server
npm run assets       # Bilder aus design/source in client/public/img neu erzeugen
```

Tipp: Mit `FAKE_TODAY=2026-12-10 npm run dev:server` lässt sich der Adventkalender oder die Bescherung ausprobieren.

CI führt `npm run verify` inklusive Linting aus. Generierte Dateien in `dist/`, `coverage/` und lokale Daten in `data/` sind vom Linting ausgeschlossen.
`biome.json` aktiviert gezielte Korrektheitsregeln, unter anderem für unbenutzte Variablen und Imports, unerreichbaren Code, doppelte Schlüssel und die Aufrufreihenfolge von React Hooks. Formatierung und Import-Sortierung bleiben unverändert.

### Aufbau

| Ordner | Inhalt |
| --- | --- |
| `client/` | React 19 + React Router + Tailwind CSS 4 (Vite), mobile-first PWA |
| `server/` | Hono-API, Table Storage (`storage.ts`), Auslosung (`draw.ts`), Aufräumen (`maintenance.ts`) |
| `shared/` | Gemeinsame Typen & Limits für Client und Server |
| `design/source/` | Original-Illustrationen (Christkind, Strohstern, Packerl, Adventkranz …) |
| `scripts/` | Bildverarbeitung (sharp) für responsive WebP-Varianten, Icons und OG-Bild |
| `infra/` | Bicep für Container Apps Consumption, Table Storage, Registry, Managed Identity und Aufräum-Job |

`npm run build` erzeugt `dist/client` (statische Dateien) und `dist/server/index.js` (ein einziges Bundle ohne `node_modules`).

## Hosting

### Azure Container Apps Consumption

Die vollständige Anleitung und die Bicep-Parameter stehen in [infra/README.md](infra/README.md). Die Bereitstellung ist absichtlich zweistufig: zuerst Infrastruktur und Registry, danach das echte, gebaute Image und die App. **Es gibt kein automatisches Deployment.** Bicep-Kompilierung und lokale Tests erstellen keine Azure-Ressourcen.

Die App liefert Frontend und API gemeinsam aus, kann bei Inaktivität auf null Replikate skalieren und nutzt eine Managed Identity statt gespeicherter Storage-Schlüssel. Der erste Aufruf nach einer Pause kann deshalb langsamer sein. ACR Basic, gespeicherte Daten, Transaktionen und Aufräum-Jobs sind auch bei wenig Nutzung nicht zwangsläufig kostenlos.

Ein geplanter Container-Apps-Job führt alle sechs Stunden `node dist/server/index.js --maintenance` aus. Für lokale Entwicklung bei Bedarf `npm run maintenance` aufrufen. Es gibt keinen Aufräum-Timer im Webserver, der beim Skalieren auf null ausfallen würde. Fehlgeschlagene Job-Ausführungen müssen überwacht werden.

### Speicherung und Nebenläufigkeit

Jede Runde ist eine Table-Partition. Personen, Regeln, Wünsche und Nachrichten werden als einzelne Entities gespeichert; alle Paarungen passen in eine gemeinsame Auslosungs-Entity. Jede Änderung aktualisiert die Runden-Entity mit einem ETag in derselben atomaren Transaktion. Konflikte werden auf einem neu gelesenen Stand erneut geprüft: doppelte Namensauswahl, verlorene Änderungen und eine Auflösung ohne aktuelle Zustimmung aller bleiben ausgeschlossen.

Nachrichten haben eine fortlaufende Sequenz; Lesestände liegen an der Person statt an jeder einzelnen Nachricht. Zurücksetzen und Bereinigung wechseln eine Generation, wodurch auch mehr als 100 Nachrichten bzw. 1.200 Wünsche atomar unsichtbar werden. Der Job entfernt die alten Entities anschließend physisch. Das Entfernen einer Person macht ihre Wünsche und Regeln sofort unzugänglich; die physische Entfernung erfolgt spätestens beim nächsten erfolgreichen Job.

Link-Lookups enthalten nur SHA-256-Schlüssel und eine Runden-ID. Da verschiedene Partitionen nicht gemeinsam transaktional sind, werden neue Lookups vor dem Runden-Commit angelegt. Sie gewähren allein keinen Zugang: jeder Aufruf prüft den Token erneut an der aktuellen Runde. Verwaiste Lookups werden nach einer Sicherheitsfrist von 24 Stunden entfernt. Neue Runden werden erst nach vollständig geschriebenen Entities veröffentlicht; ein abgebrochener Import bleibt unsichtbar und wird nach 24 Stunden bereinigt.

Auch Rate-Limits werden mit ETags in einer eigenen Tabelle gespeichert und gelten über Neustarts und Replikate hinweg. Die Implementierung ist für kleine Familienrunden gedacht: sie liest die aktive Runden-Partition, nicht nur einzelne Nachrichten. Für große Chat-Verläufe wären paginierte Endpunkte sinnvoll.

### Import vorhandener SQLite-Daten

Vor dem Wechsel den alten Server stoppen, ein vollständiges SQLite-Backup erstellen und die Originaldatei aufbewahren. Der Import liest einen konsistenten, schreibgeschützten Snapshot und ändert weder das Schema noch die Daten der Quelldatei. Gültige persönliche Links, Organisator-Links, Einladungen, Regeln und Paarungen bleiben erhalten; die Sicherheitsregeln älterer Schema-Versionen bleiben wirksam.

```powershell
# Lokal: Azurite muss laufen. Zuerst nur prüfen:
npm run import:sqlite -- .\data\wichteln.db
# Erst nach erfolgreicher Prüfung und bewusstem Zielwechsel schreiben:
npm run import:sqlite -- .\data\wichteln.db --apply
```

Für Azure vorher `STORAGE_BACKEND=azure` und `TABLE_ENDPOINT` setzen und dem ausführenden Konto Storage Table Data Contributor auf dem Zielkonto geben. Lokal verwendet der SDK-Client die Azure-CLI-Anmeldung; im Container die Managed Identity. Bestehende Runden werden nie überschrieben. Der Import ist pro Runde atomar sichtbar, aber nicht über die ganze Quelldatei: bei Teilfehlern den Zielstand prüfen, statt den Import blind zu wiederholen. Ein unterbrochener Staging-Import derselben Runde wird bis zur Bereinigung abgewiesen.

Table Storage LRS ist **kein Backup**. Vor echtem Einsatz private, regelmäßig geplante Table-Exporte und eine geprüfte Wiederherstellung einrichten. Diese Exporte enthalten Geheimlinks und persönliche Inhalte und gehören nicht in Git oder Logs. Die Bicep-Dateien richten noch keinen Backup-Job ein.

### HTTPS und Reverse Proxy

Die App sollte im Internet **nur per HTTPS** erreichbar sein. `TRUST_PROXY=true` ist auf das Container-Apps-Ingress-Verhalten ausgelegt: nur die von Azure angehängte **rechte** IP-Adresse wird vertraut. Bei anderen Proxys müssen deren Header-Regeln dazu passen. `PUBLIC_URL` legt die kanonische Adresse für Vorschauen fest; auf Azure wird andernfalls `CONTAINER_APP_HOSTNAME` verwendet. Persönliche URLs nicht in Zugriffslogs oder Request-Telemetrie erfassen.

### Umgebungsvariablen

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `PORT` | `8787` | HTTP-Port |
| `HOST` | `0.0.0.0` | Adresse, auf der gelauscht wird |
| `STORAGE_BACKEND` | `azurite` lokal, `azure` im Docker-Image | Datenquelle; Produktion lehnt Azurite ab |
| `AZURITE_CONNECTION_STRING` | `UseDevelopmentStorage=true` | Nur lokal: Emulator-Verbindung; keine produktiven Schlüssel verwenden |
| `TABLE_ENDPOINT` | – | Azure-Table-Endpunkt, bei `azure` zwingend |
| `TABLE_ROUNDS` | `WichtelnRounds` | Tabelle mit Runden und Inhalt |
| `TABLE_LINKS` | `WichtelnLinks` | Tabelle mit gehashten Link-Lookups |
| `TABLE_RATES` | `WichtelnRates` | Tabelle mit verteilten Rate-Limits |
| `AZURE_CLIENT_ID` | – | Client-ID der User-Assigned Managed Identity, von Bicep gesetzt |
| `CLIENT_DIR` | `dist/client` | Ordner mit dem gebauten Frontend |
| `PUBLIC_URL` | HTTPS-Hostname aus `CONTAINER_APP_HOSTNAME` auf Azure | Öffentliche Adresse für absolute Links in Vorschauen |
| `TRUST_PROXY` | `false` | `X-Forwarded-*`-Header eines Reverse Proxys vertrauen |
| `PURGE_CONTENT_DAYS` | `60` | Tage nach der Bescherung, bis Wunschzettel, Nachrichten und „Über mich“ gelöscht werden |
| `DELETE_GROUP_DAYS` | `400` | Tage nach der Bescherung (bzw. Erstellung), bis die ganze Runde gelöscht wird |
| `FAKE_TODAY` | – | Nur für Tests/Demos: heutiges Datum (`YYYY-MM-DD`) vorgeben |

## Sicherheit in Kürze

- Zufällige, lange Geheimlinks statt Passwörtern (Organisator 192 Bit, persönliche Links 144 Bit)
- Die erste Namensauswahl vergibt den Zugang atomar: Auch bei gleichzeitigen Anfragen bekommt nur eine Person einen Link. Persönliche Tokens bestehen aus 18 kryptografisch zufälligen Bytes (144 Bit), nicht aus Namen oder fortlaufenden IDs
- Persönliche Links werden nur beim Erstellen bzw. Auswählen ausgegeben, nicht in der Einladung oder der Organisator-Ansicht. Der einzige administrative Link-Endpunkt stellt für eine bereits angemeldete Person einen **neuen** Link aus (`POST /api/admin/:token/participants/:id/reissue-link`); bestehende Links lassen sich nicht abrufen
- Persönliche Links selbst sichern. Bei Verlust stellt die Organisator:in einen neuen Link aus: Der alte wird sofort ungültig, Wünsche und Zuteilung bleiben erhalten. Das ist bewusst sichtbar statt heimlich – die Person sieht auf ihrer Seite, wann ihr Link neu ausgestellt wurde, und die Organisator-Ansicht zeigt es ebenfalls. Bei kompromittierten Links ebenfalls einen neuen Link ausstellen
- Die erhaltenen Auflösungs-Endpunkte brauchen weiterhin die Zustimmung **aller** persönlichen Zugänge; ein Zurücksetzen der Auslosung oder ein neu ausgestellter Link löscht die jeweilige Zustimmung, und von neu ausgestellten Links aus ist keine Zustimmung möglich. Die Übernahme ins nächste Jahr ist vorher gesperrt, weil Vorjahres-Ausschlüsse sonst die geheime Auslosung verraten würden
- Strenge Content-Security-Policy, `no-referrer`, kein Einbetten in fremde Seiten
- Rate-Limits für Erstellen, Einlösen von Einladungen und Nachrichten
- Eingaben werden serverseitig mit zod geprüft und begrenzt

**Vertrauensgrenze:** Die Einladung nur in der vertrauten Familie teilen. Wer sie kennt, kann einen noch freien Namen auswählen – die App prüft die Identität bewusst nicht. Lange persönliche Links schützen vor Erraten, nicht davor, dass jemand zuerst einen fremden Namen beansprucht. Bei einer falschen Auswahl vor der Auslosung die betroffene Person nach Rücksprache entfernen und neu eintragen (ihr bisheriger Wunschzettel wird dabei gelöscht). Nach der Auslosung bleibt ein Zurücksetzen nötig; bereits bekannte Zuteilungen werden dadurch nicht wieder geheim. Wer einen Link neu ausstellt, könnte ihn selbst öffnen und die Zuteilung dieser Person sehen – die App verhindert das nicht, macht es aber sichtbar: Der alte Link der Person hört auf zu funktionieren, und ihre Seite zeigt einen Hinweis. Die Datenbank enthält die Zuteilungen; dies ist keine Ende-zu-Ende-Verschlüsselung und schützt nicht vor dem Serverbetreiber. Persönliche URLs auch aus Proxy-/Zugriffslogs fernhalten.

Die Namensauswahl bleibt nach der Auslosung offen. Wer dann einen fremden freien Namen auswählt, kann dessen Zuteilung sofort aufdecken. Deshalb den Einladungslink weiterhin nur im vertrauten Kreis teilen.

### Update von der Version mit Bestätigungscodes

Alle bereits gültigen persönlichen Links, Organisator-Links und Rundendaten bleiben erhalten. Die Migration entfernt nur die ausstehenden Code-Anfragen und das alte Prüfmerkmal. Wer bisher auf eine Bestätigung gewartet hat, öffnet die ursprüngliche Einladung erneut und wählt den Namen; alte Code-Anfragen werden nicht automatisch zu persönlichen Zugängen.

Bei sehr alten Daten aus der ersten Version ohne Code-Prüfung greift weiterhin die damalige Sicherheitsmigration: Diese alten Teilnehmer-Links (außer dem eigenen Organisator-Zugang) sind gesperrt. Freie Namen können auch in bereits ausgelosten Altrunden neu gewählt werden; die bestehende Zuteilung bleibt erhalten. Bereits bekannte Zuteilungen werden dadurch nicht wieder geheim. Vor einem Update ein Datenbankbackup erstellen.
