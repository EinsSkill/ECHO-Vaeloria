# ECHO Apps Script

Dieser Ordner enthält den öffentlichen, secret-freien Apps-Script-Code der Live-Architektur.

## Module

- `Code.gs` – Web-App-Einstieg, `doGet`, `doPost`, Trigger und gemeinsame Konfiguration
- `TurnProcessor.gs` – Verarbeitung von `TURN_INBOX`, Commit in Event-/State-/Scene-Strukturen
- `OverlayState.gs` – read-only Projektion des aktuellen Zustands für das Overlay
- `SheetStore.gs` – Google-Sheets-Zugriff, Tabellen-/JSON-Helfer und API-Key-Prüfung
- `FastTurnGateway.gs` – kompakter Runtime-Read und atomare `PENDING`-Übergabe

Der alternative standalone-`doPost()` für Projekte ohne eigenen Handler liegt bewusst unter `examples/FastTurnGatewayWebApp.example.gs` und **nicht** in diesem deploybaren Ordner.

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


## Schema-Erweiterung für Beziehungen und Szenen

`setupEchoTrigger()` führt vor der Trigger-Erstellung auch `setupEchoSchema()` aus. Die Migration ergänzt ausschließlich fehlende Spalten für `respect`, `tension`, `safety`, `dominance`, `submission`, `consent_state`, `boundaries_json`, `intimacy_phase`, `intimacy_profile_json`, `content_rating` und `intimacy_mode`. Bestehende Werte werden nicht überschrieben.

Die Beziehungsschicht kann damit Vertrauen, Verlangen, Angst, Respekt, Spannung und Sicherheitslage sowie eine freiwillige, pausierbare oder widerrufbare Nähe-Dynamik darstellen. Diese Metadaten sind keine Eingabe und erzeugen keine Zustimmung.
