# ECHO – Die Chroniken von Vaeloria

> Ein persistentes, KI-geführtes Dark-Fantasy-RPG, in dem Entscheidungen als dauerhafte Ereignisse gespeichert werden und die Welt sich an ihre Folgen erinnert.

ECHO verbindet freies textbasiertes Rollenspiel mit einem persistenten Welt- und Spielgedächtnis. Der Spieler handelt ausschließlich über natürliche Sprache; Regeln, Kanon, Ereignisse, Beziehungen und Zustandsänderungen werden getrennt verarbeitet und anschließend in einem eigenen Lese-Overlay dargestellt.

[![Projekt](https://img.shields.io/badge/ECHO-Vaeloria-173f35?style=for-the-badge&labelColor=c9a227)](https://github.com/EinsSkill/ECHO-Vaeloria)

## Was steckt drin?

- freies textbasiertes Singleplayer-RPG ohne erzwungene Auswahlmenüs
- persistente Ereignis- und Zustandslogik statt isolierter Chat-Antworten
- klar getrennte Ebenen für Kanon, Regeln, Spielstand und offene Fragen
- Google-Sheets-basierter State Store mit Inbox-/Commit-Workflow
- Fast Turn Gateway für weniger Roundtrips im interaktiven Spiel
- öffentlicher, eigenständiger Google-Apps-Script-Quellcode
- eigenes responsives Lese-Overlay für Szenen, Beziehungen, Inventar und offene Fäden
- Browser-Sprachausgabe für automatisch vorgelesene Szenen
- dauerhafte Konsequenzen und Beziehungen statt einfacher Gut-/Böse-Punkte

## Wie funktioniert ein Spielzug?

```text
Spieler schreibt Handlung in ChatGPT
                ↓
Kanon + Regeln + aktueller Spielstand prüfen
                ↓
Fast Turn Gateway / TURN_INBOX: neuer Spielzug als PENDING
                ↓
Apps-Script-Verarbeitung / Validierung
                ↓
EVENT_LOG · STATE_SNAPSHOT · SCENE_FEED · Beziehungen
                ↓
ECHO-Overlay liest die neue Szene
                ↓
optional: automatische Sprachausgabe im Browser
```

Der Chat ist die Eingabe. Das Overlay ist die sichtbare Ausgabefläche. Der persistente Spielstand liegt außerhalb des Repositorys.

## Code öffentlich, Zustand privat

Dieses Repository ist die **öffentliche Codebasis von ECHO**. Die technische Implementierung darf eingesehen, versioniert und weiterentwickelt werden; private Laufzeitdaten werden davon strikt getrennt.

Öffentlich enthalten sind unter anderem:

- Apps-Script-Einstieg und API-Routing
- TURN_INBOX-/Commit-Processor
- State- und Overlay-Projektion
- Fast Turn Gateway
- technische Architektur und Datenverträge
- nichtkanonische Demo-Inhalte

Nicht enthalten sind:

- gespeicherte Live-Spielzüge und aktuelle Szenen
- vollständiger Kanon mit späteren Enthüllungen
- persönliche oder private Daten
- Werte privater Script Properties
- Google-Sheet-IDs und private Deployment-Informationen
- API-Schlüssel, Gateway-Tokens oder andere Zugangsdaten

Die Demo unter `demo/` enthält ausschließlich Foundation-Inhalte und ist ausdrücklich **nicht als aktueller Kanon** zu verstehen.

## Architektur

| Ebene | Aufgabe |
| --- | --- |
| ChatGPT | Spielleitung, Regelprüfung und Erzeugung eines strukturierten Spielzugs |
| Fast Turn Gateway | kompakter Runtime-Read und atomare, idempotente Inbox-Übergabe |
| TURN_INBOX | sichere Übergabe neuer Aktionen als `PENDING` |
| Apps Script | Verarbeitung, Validierung und Commit in die persistenten Tabellen |
| State Store | Kanon, Regeln, Events, State, Beziehungen, Threads und Scene Feed |
| Overlay | schreibgeschützte Darstellung des aktuellen Spielzustands |
| SpeechSynthesis | optionale lokale Sprachausgabe der Szene im Browser |

Mehr dazu: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/FAST-TURN-GATEWAY.md`](docs/FAST-TURN-GATEWAY.md) und [`apps-script/README.md`](apps-script/README.md).

## Repository-Struktur

```text
apps-script/
  Code.gs                   gesamter, eigenständiger Apps-Script-Backend-Code

demo/                       öffentliche Foundation-Demo des Overlays
docs/                       Architektur, Datenvertrag und Datenschutzgrenze
examples/                   anonymisierte Beispiel-Payloads
README.md                   Projektübersicht
```

## Private Konfiguration

Live-Werte werden ausschließlich in den Script Properties des privaten Apps-Script-Projekts gesetzt:

```text
ECHO_SPREADSHEET_ID
ECHO_API_KEY
ECHO_GATEWAY_TOKEN
```

Die Werte selbst werden niemals committed.

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

Der grundlegende Workflow aus freier Chat-Eingabe, strukturierter Übergabe, persistentem Spielstand und separatem Overlay ist bereits im Einsatz. Der Quellcode wird öffentlich versioniert, während laufende Geschichte, Secrets und privater State getrennt bleiben.

## Technologie

- HTML, CSS und JavaScript
- Browser SpeechSynthesis API
- Google Apps Script
- Google Sheets als persistente Daten- und Ereignisschicht
- strukturierte JSON-Verträge zwischen Spielleitung und State-Processor
- GitHub für öffentliche Versionierung der Codebasis

---

Ein persönliches Dark-Fantasy-RPG als persistentes Softwaresystem – mit freiem Spiel, erinnernder Welt und klarer Trennung zwischen öffentlichem Code und privatem Zustand.
