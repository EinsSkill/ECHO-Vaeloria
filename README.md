# ECHO – Die Chroniken von Vaeloria

> Ein persistentes, KI-geführtes Dark-Fantasy-RPG, in dem Entscheidungen als dauerhafte Ereignisse gespeichert werden und die Welt sich an ihre Folgen erinnert.

ECHO verbindet freies textbasiertes Rollenspiel mit einem persistenten Welt- und Spielgedächtnis. Der Spieler handelt ausschließlich über natürliche Sprache; Regeln, Kanon, Ereignisse, Beziehungen und Zustandsänderungen werden getrennt verarbeitet und anschließend in einem eigenen Lese-Overlay dargestellt.

[![Projekt](https://img.shields.io/badge/ECHO-Vaeloria-173f35?style=for-the-badge&labelColor=c9a227)](https://github.com/EinsSkill/ECHO-Vaeloria)

## Was steckt drin?

- freies textbasiertes Singleplayer-RPG ohne erzwungene Auswahlmenüs
- persistente Ereignis- und Zustandslogik statt isolierter Chat-Antworten
- klar getrennte Ebenen für Kanon, Regeln, Spielstand und offene Fragen
- Google-Sheets-basierter State Store mit Inbox-/Commit-Workflow
- eigenes responsives Lese-Overlay für Szenen, Beziehungen, Inventar und offene Fäden
- Browser-Sprachausgabe für automatisch vorgelesene Szenen
- dauerhafte Konsequenzen und Beziehungen statt einfacher Gut-/Böse-Punkte

## Wie funktioniert ein Spielzug?

```text
Spieler schreibt Handlung in ChatGPT
                ↓
Kanon + Regeln + aktueller Spielstand prüfen
                ↓
TURN_INBOX: neuer Spielzug als PENDING
                ↓
Apps-Script-Verarbeitung / Validierung
                ↓
EVENT_LOG · STATE_SNAPSHOT · SCENE_FEED · Beziehungen
                ↓
ECHO-Overlay liest die neue Szene
                ↓
optional: automatische Sprachausgabe im Browser
```

Der Chat ist die Eingabe. Das Overlay ist die sichtbare Ausgabefläche. Der persistente Spielstand liegt außerhalb des öffentlichen Repositorys.

## Öffentliche Sicherheitsgrenze

Dieses Repository ist eine **Showcase- und Technikfassung** des Projekts. Es enthält bewusst nicht den privaten Live-Spielstand.

Nicht enthalten sind:

- gespeicherte Spielzüge und aktuelle Szenen
- vollständiger Kanon mit späteren Enthüllungen
- persönliche oder private Daten
- Google-Sheet-IDs und Deployment-URLs
- API-Schlüssel, Tokens oder Zugangsdaten
- private Apps-Script-Konfiguration

Die Demo unter `demo/` enthält ausschließlich Foundation-Inhalte und ist ausdrücklich **nicht als aktueller Kanon** zu verstehen.

## Architektur

| Ebene | Aufgabe |
| --- | --- |
| ChatGPT | Spielleitung, Regelprüfung und Erzeugung eines strukturierten Spielzugs |
| TURN_INBOX | sichere Übergabe neuer Aktionen als `PENDING` |
| Apps Script | Verarbeitung, Validierung und Commit in die persistenten Tabellen |
| State Store | Kanon, Regeln, Events, State, Beziehungen, Threads und Scene Feed |
| Overlay | schreibgeschützte Darstellung des aktuellen Spielzustands |
| SpeechSynthesis | optionale lokale Sprachausgabe der Szene im Browser |

Mehr dazu: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Repository-Struktur

```text
demo/                 öffentliche Foundation-Demo des Overlays
docs/                 Architektur, Datenvertrag und Datenschutzgrenze
examples/              anonymisierte Beispiel-Payloads
README.md               Projektübersicht
```

## Demo lokal öffnen

Es ist kein Build-Schritt nötig.

```bash
cd demo
python -m http.server 4503
```

Danach im Browser `http://localhost:4503` öffnen.

Die Demo speichert keinen echten Spielzug und verbindet sich nicht mit dem privaten ECHO-State-Store.

## Aktueller Stand

**Aktiv in Entwicklung – persistenter Foundation-Build im Live-Test**

Der grundlegende Workflow aus freier Chat-Eingabe, strukturierter Übergabe, persistentem Spielstand und separatem Overlay ist bereits im Einsatz. Die öffentliche Fassung dokumentiert Architektur und UI, während laufende Geschichte und private Zustände getrennt bleiben.

## Technologie

- HTML, CSS und JavaScript
- Browser SpeechSynthesis API
- Google Apps Script
- Google Sheets als persistente Daten- und Ereignisschicht
- strukturierte JSON-Verträge zwischen Spielleitung und State-Processor
- GitHub für öffentliche Versionierung und Projektdokumentation

---

Ein persönliches Dark-Fantasy-RPG als persistentes Softwaresystem – mit freiem Spiel, erinnernder Welt und klarer Trennung zwischen öffentlicher Technik und privater Geschichte.
