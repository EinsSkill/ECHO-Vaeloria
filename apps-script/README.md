# ECHO Apps Script

Dieser Ordner enthält den öffentlichen, secret-freien Apps-Script-Code der Live-Architektur.

## Module

- `Code.gs` – Web-App-Einstieg, `doGet`, `doPost`, Trigger und gemeinsame Konfiguration
- `TurnProcessor.gs` – Verarbeitung von `TURN_INBOX`, Commit in Event-/State-/Scene-Strukturen
- `OverlayState.gs` – read-only Projektion des aktuellen Zustands für das Overlay
- `SheetStore.gs` – Google-Sheets-Zugriff, Tabellen-/JSON-Helfer und API-Key-Prüfung
- `FastTurnGateway.gs` – kompakter Runtime-Read und atomare `PENDING`-Übergabe
- `FastTurnGatewayWebApp.example.gs` – nur Referenz für Projekte ohne eigenen `doPost()`

Apps Script behandelt alle `.gs`-Dateien eines Projekts als gemeinsamen globalen Codebereich. Die Aufteilung dient deshalb nur Wartbarkeit und Versionskontrolle.

## Private Script Properties

Der öffentliche Code enthält bewusst keine Live-IDs oder Zugangsdaten. Im privaten Apps-Script-Projekt müssen diese Werte unter **Projekteinstellungen → Skripteigenschaften** gesetzt werden:

```text
ECHO_SPREADSHEET_ID = <ID des privaten Live-State-Stores>
ECHO_API_KEY        = <privater Key für die bestehende direkte API>
ECHO_GATEWAY_TOKEN  = <privates Token für den Fast Turn Gateway>
```

Optional:

```text
ECHO_RUNTIME_KEYS_JSON = ["save.last_event_id", "world_location_id", ...]
```

`ECHO_RUNTIME_KEYS_JSON` überschreibt die Standardauswahl des kompakten Runtime-Reads.

## Live-Integration

Das bestehende `doPost()` in `Code.gs` routet Gateway-Anfragen mit

```text
op = context | submit | status
```

an `echoHandleGatewayRequest(...)`. Andere bestehende API-Aufrufe bleiben über `ECHO_API_KEY` kompatibel.

Neue Spielzüge gelangen weiterhin ausschließlich als `PENDING` in `TURN_INBOX`. Der Gateway schreibt nicht direkt in `EVENT_LOG`, `SCENE_FEED`, `STATE_SNAPSHOT` oder Beziehungen.

## Was nicht ins Repository gehört

- Werte der Script Properties
- private Google-Sheet-/Deployment-IDs
- Live-Spielstand
- aktuelle oder verborgene Story-/Kanoninhalte
- echte Turn-, Event- oder Scene-Payloads aus dem laufenden Spiel

Die Trennung lautet damit: **Code öffentlich, Konfiguration und Spielzustand privat.**
