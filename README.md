# Tagwerk – persönliche Routine-App fürs iPhone

Tagesplanung, Dokumentation (inkl. Fotobeleg) und ein ruhiges Levelsystem in einer installierbaren Web-App.
Alle Daten bleiben **privat auf dem Gerät** (IndexedDB) – es gibt keinen Server, keine Konten und keine sozialen Funktionen.

## Ohne eigenen Rechner: GitHub Pages

Die fertig gebaute App liegt im Ordner `docs/` auf `main`. GitHub Pages ist so eingestellt:
**Settings → Pages → Source: „Deploy from a branch“, Branch `main`, Ordner `/docs`.**
Adresse: **https://paschamotion.github.io/dailys/** → in Safari öffnen → *Teilen → Zum Home-Bildschirm*.

Nach Code-Änderungen `npm run build:docs` ausführen und `docs/` mit committen.
Der Workflow `.github/workflows/deploy.yml` testet jeden Push auf `main` und aktualisiert `docs/` automatisch, falls es vergessen wurde.

## Lokal starten

Voraussetzung: Node.js ≥ 18.18 (für `npm test` ≥ 22.12; empfohlen: Node 22, siehe `.nvmrc`).

```bash
npm ci              # exakt die Versionen aus package-lock.json
npm run dev          # Entwicklungsserver, auch im WLAN erreichbar (--host)
npm test             # Unit-/Integrationstests (Foto-Pflicht, XP, Wiederholungen, Streaks)
npm run build        # Typprüfung + Produktions-Build nach dist/
npm run e2e          # nach dem Build: kompletter Ablauf im iPhone-Format (Playwright)
```

### Auf dem iPhone nutzen

* **Schnelle Vorschau im WLAN:** `npm run dev`, dann die angezeigte `Network`-Adresse in Safari öffnen.
  Planung, Fotos (Kamera/Mediathek) und Speicherung funktionieren. Offline-Modus und „dauerhafter Speicher“ gibt es über http nicht.
* **Dauerhaft:** `npm run build` und den Ordner `dist/` auf einen beliebigen **HTTPS**-Static-Host legen
  (z. B. GitHub Pages, Netlify, Cloudflare Pages). In Safari öffnen → *Teilen → Zum Home-Bildschirm*.
  Als Home-Bildschirm-App läuft Tagwerk im Vollbild, offline und mit eigenem, geschütztem Speicher.
  Der Code ist dann öffentlich abrufbar, die **Daten nicht** – sie liegen nur im Speicher deines iPhones.
* `?debug` an der URL zeigt im Profil einen Schalter, um einen Fehler beim Foto-Speichern zu simulieren.

## Funktionen

| Bereich | Umsetzung |
|---|---|
| **Heute** | Aktuelle Aktivität hervorgehoben (gestartet oder im Zeitfenster), sonst „Als Nächstes“; danach restlicher Tag, Fortschrittsring, Level/XP, Serie. Starten, Verschieben (Schnellwahl + eigener Termin), Überspringen (mit Rückgängig), Abschließen. Überfällige Aktivitäten bleiben oben sichtbar → *Neu einplanen*, *Erledigt*, *Überspringen*, *Alle überspringen*. |
| **Zeiten** | Geplant (`plannedStart`, `plannedDuration`) und tatsächlich (`actualStart`, `actualEnd`) getrennt. Abschluss ohne vorheriges Starten möglich; der Beginn bleibt dann leer oder wird von Hand angegeben. |
| **Planung** | Wochenleiste, Tagesliste, freie Tage. Aktivität: Titel, Beschreibung, Kategorie, Datum, Startzeit, Dauer, Wochentage, Abschluss (bestätigen / Foto Pflicht). Tab *Routinen* mit allen Serien. |
| **Wiederholungen** | Eine Routine erzeugt pro vorgesehenem Tag einen eigenen Termin (14 Tage im Voraus, beim Blättern weiter). Bearbeiten fragt: *Nur dieser Termin* oder *Dieser und alle folgenden*. Vergangene Einträge bleiben unverändert. |
| **Fotoabschluss** | Kamera oder Mediathek, Vorschau, Ersetzen. Ablauf: Foto wird verkleinert und gespeichert → erst dann wird abgeschlossen. Bei Fehler bleiben Foto, Notiz und Zeiten erhalten; *Erneut versuchen* lädt ein bereits gespeichertes Foto nicht doppelt. Keine KI-Prüfung. |
| **XP & Level** | ≤ 15 Min. 10 XP · ≤ 45 Min. 20 XP · ≤ 90 Min. 30 XP · länger 40 XP · +5 XP bei Foto-Pflicht. Von Level n zu n+1 braucht man n × 100 XP. |
| **Streaks** | Pro Routine und als „erfüllte Routinetage“. Nur vorgesehene Wochentage zählen; freie Tage, nicht vorgesehene Tage und gezielt gelöschte Einzeltermine sind neutral. Heute offen ist neutral. Überspringen/Verpassen beendet die Serie. |
| **Meilensteine** | Erster Schritt, 10 Mahlzeiten, 10 Trainings, 7 Routinetage, 7 Routinetage in Folge, 10 Fotobelege, 5 Tagesabschlüsse, 50 Aktivitäten, Level 5. |
| **Verlauf** | Tagesrückblick (erledigt/übersprungen/offen, geplant vs. tatsächlich, Foto, Notiz), Tagesabschluss (Energie 1–5 + Notiz), Wochenübersicht mit Balken pro Tag und Routinen-Raster. |
| **Daten** | Sicherung als JSON-Datei inkl. Fotos (Teilen-Menü bzw. Download) und Wiederherstellung. |

## Wie Doppel-XP verhindert werden

* XP werden nur in `completeActivity` gebucht, in **einer** IndexedDB-Transaktion über Aktivität, Foto und XP-Buch.
* Das XP-Buch hat als Schlüssel die `activityId` → höchstens eine Buchung pro Aktivität.
* Ist eine Aktivität schon erledigt, liefert ein weiterer Aufruf `alreadyDone` und 0 XP. Gleichzeitige Aufrufe werden von IndexedDB serialisiert (getestet).
* Beim Laden wird nichts gebucht; die XP-Summe wird aus dem XP-Buch berechnet. Verpasste Aufgaben ziehen nichts ab.
* Foto-Pflicht wird in derselben Transaktion geprüft: Das Foto muss gespeichert sein **und** zu genau dieser Aktivität gehören.

## Aufbau

```
src/domain/   reine Logik: Typen, Datum, XP/Level, Wiederholungen, Streaks, Meilensteine, Heute-Ansicht
src/data/     IndexedDB-Schema (db.ts), alle Schreib-/Leseoperationen (repo.ts), React-Store (store.tsx)
src/ui/       Bildschirme (Heute, Planung, Verlauf, Profil), Bottom-Sheets, Bausteine
tests/        Vitest + fake-indexeddb
e2e/flow.mjs  Playwright: planen → starten → Foto (mit simuliertem Uploadfehler) → abschließen → XP → Verlauf
```

Wiederkehrende Termine haben die deterministische ID `s_<serie>_<seriendatum>`. Dadurch entstehen sie nie doppelt,
verschobene Termine tauchen am alten Datum nicht wieder auf, und gelöschte Einzeltermine bleiben als „Grabstein“ gelöscht.
„Ab jetzt ändern“ teilt die Routine in Abschnitte (gleiche `seriesId`), sodass vergangene Tage nach der alten Regel bewertet werden.

## Grenzen dieser Version (lokale Vorschau)

* **Kein Sync, kein Backup in der Cloud.** Daten existieren nur in diesem Browser auf diesem Gerät. Wird Safari-Websitedaten gelöscht,
  die App vom Home-Bildschirm entfernt oder das Gerät gewechselt, sind sie weg – außer du hast eine Sicherung exportiert.
* **Safari im Browser-Tab** kann Speicher nach längerer Nichtnutzung räumen. Als Home-Bildschirm-App ist das nicht der Fall. Im privaten Modus wird nichts gespeichert.
* **Speicherplatz:** Fotos werden auf max. 1600 px (JPEG) verkleinert; bei vollem Speicher erscheint eine Fehlermeldung.
* **Keine Erinnerungen/Push-Mitteilungen.**
* Routinetermine werden **nicht rückwirkend** erzeugt. Tage, an denen die App nicht geöffnet wurde, zählen für Streaks trotzdem als verpasst.
* Erledigte Aktivitäten lassen sich nicht zurücksetzen (nur die Notiz ist änderbar) – bewusst, damit XP eindeutig bleiben.
* Ändert man eine Serie ab einem Datum, das vor einer späteren Änderung liegt, ersetzt die neue Regel alle späteren Abschnitte.

## Was für Sync über mehrere Geräte fehlt

Im Repository waren keine Dienste oder Zugangsdaten vorhanden. Für Anmeldung und Cloud-Speicherung wären nötig:

1. Ein Backend mit Auth, Datenbank und **privatem** Dateispeicher, z. B. ein Supabase-Projekt
   (Projekt-URL + anon key, Tabellen mit Row-Level-Security pro Nutzer, privater Storage-Bucket für Fotos mit signierten URLs).
2. Eine zweite Implementierung der Funktionen aus `src/data/repo.ts` gegen dieses Backend. XP-Vergabe und Foto-Prüfung müssen dann
   serverseitig in einer Transaktion bzw. RPC laufen (gleiche Regeln wie lokal: eine XP-Buchung pro Aktivität, Foto muss existieren).
3. HTTPS-Hosting für die App.
