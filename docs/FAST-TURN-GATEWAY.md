# Fast Turn Gateway

Der Fast Turn Gateway reduziert den normalen ECHO-Spielzug auf einen kleinen Runtime-Read und eine atomare Übergabe an `TURN_INBOX`.

Die öffentliche Implementierung enthält **keine** Live-Sheet-ID, Deployment-URL oder Zugangsdaten.

## Ziel

Bisher kann ein externer Spielleiter für einen einzelnen Zug mehrere getrennte Sheet-Zugriffe benötigen:

```text
TURN_INBOX prüfen
→ State lesen
→ freie Zeile bestimmen
→ Format übernehmen
→ Payload schreiben
→ geschriebenen Zustand verifizieren
```

Der Gateway verschiebt diese Arbeit in den privaten Apps-Script-Layer:

```text
getRuntimeContext()
→ Spielzug erzeugen
→ submitTurn(turn)
→ Overlay/Processor übernimmt
```

## Dateien

- `apps-script/Code.gs` – konsolidierter Backend-Code einschließlich Fast Turn Gateway
- `apps-script/FastTurnGatewayWebApp.example.gs` – optionaler `doPost`-Wrapper

## Kernfunktionen

### `echoGetRuntimeContext()`

Liest in einem Aufruf:

- den neuesten `TURN_INBOX`-Status
- die wichtigsten Laufzeitwerte aus `STATE_SNAPSHOT`
- `save.last_event_id`

Bei doppelten Snapshot-Schlüsseln gewinnt der spätere Eintrag. Dadurch entspricht der Runtime-Read der ECHO-Regel „neuester Schlüsselwert gewinnt“.

Die Runtime-Schlüssel können über die Script Property `ECHO_RUNTIME_KEYS_JSON` angepasst werden.

### `echoSubmitTurn(turn)`

Übergibt genau einen neuen Zug an `TURN_INBOX`.

Eigenschaften:

- `LockService` gegen parallele Schreibvorgänge
- Idempotenz über `turn_id`
- nur `PASTE_FORMAT` vom vorherigen Datensatz
- A:J werden als vollständige neue Zeile geschrieben
- neue Züge starten ausschließlich als `PENDING`
- G:J werden niemals aus der vorherigen Zeile übernommen
- direkte Verifikation nach dem Schreiben
- ein sofortiger Wechsel von `PENDING` auf `COMMITTED` oder `ERROR` wird korrekt erkannt

Der Gateway schreibt **nicht** direkt in `EVENT_LOG`, `SCENE_FEED`, `STATE_SNAPSHOT` oder Beziehungsdaten.

### `echoGetTurnStatus(turnId)`

Liest gezielt den Status eines bereits eingereichten Zuges.

## Installation im privaten Live-Projekt

### 1. Standalone-Backend übernehmen

Den vollständigen Inhalt von `apps-script/Code.gs` in die `Code.gs` des privaten ECHO-Apps-Script-Projekts übernehmen. Die Datei enthält bereits Einstieg, Turn-Vertrag, Schema-Migration, Processor, Overlay, Sheets-Helfer und Fast Turn Gateway.

Ist das Script direkt an das ECHO-Sheet gebunden, ist keine Spreadsheet-ID im Code nötig.

Bei einem Standalone-Script wird in den **Script Properties** gesetzt:

```text
ECHO_SPREADSHEET_ID = <private Live-ID>
```

Diese ID gehört niemals ins öffentliche Repository.

### 2. Optionalen HTTP-Zugang absichern

Für einen späteren direkten Connector wird zusätzlich eine lange zufällige Script Property gesetzt:

```text
ECHO_GATEWAY_TOKEN = <privates zufälliges Token>
```

Das Token gehört weder in GitHub noch in Szenen, Logs oder URLs.

### 3. `doPost` integrieren

Wenn das Live-Projekt noch keinen `doPost()` besitzt, kann der Wrapper aus `FastTurnGatewayWebApp.example.gs` verwendet werden.

Existiert bereits ein `doPost()`, **keinen zweiten Handler anlegen**. Stattdessen den vorhandenen Router so erweitern, dass Gateway-Payloads an

```js
echoHandleGatewayRequest(body)
```

weitergereicht werden.

## Request-Vertrag für einen späteren Connector

### Runtime lesen

```json
{
  "token": "<secret>",
  "op": "context"
}
```

### Zug einreichen

```json
{
  "token": "<secret>",
  "op": "submit",
  "turn": {
    "turn_id": "TURN-DEMO-002",
    "chat_id": "ECHO-PROJECT",
    "received_at": "2026-08-24T15:30:00+02:00",
    "raw_input": "Freie Spielerhandlung",
    "parsed_intent_json": {
      "event_id": "EVT-DEMO-002",
      "event_type": "PLAYER_ACTION",
      "player_action": "Freie Spielerhandlung",
      "narrative_summary": "Kurze überprüfbare Zusammenfassung",
      "scene": {
        "feed_id": "SCENE-DEMO-002",
        "scene_type": "narrative",
        "title": "Szenentitel",
        "location_id": "LOC_DEMO",
        "narrative_text": "Vollständige sichtbare Szene",
        "mood": "angespannt",
        "available_actions_json": [],
        "status": "PLAY"
      },
      "state_updates": {},
      "relationship_updates": {},
      "new_flags": []
    },
    "validation_status": "PENDING"
  }
}
```

## Sicherheitsgrenze

Ein öffentlich erreichbarer Web-App-Endpunkt darf nur mit einem privaten Token eingesetzt werden. ECHO-State, Story-Payloads, Sheet-IDs und Tokens bleiben privat.

Der öffentliche Repository-Code enthält bewusst nur die generische Infrastruktur.

## Aktueller ChatGPT-Pfad

Ein HTTP-Gateway allein beschleunigt einen ChatGPT-Spielzug nur dann vollständig, wenn ChatGPT diesen Endpoint über einen autorisierten Connector direkt aufrufen kann. Ohne einen solchen Connector bleibt der derzeit praktikable Fast-Play-Pfad:

1. ein gemeinsamer, kompakter Sheet-Read für letzten Inbox-Status + aktuellen State
2. ein Batch-Write des neuen `PENDING`-Zugs
3. ein kurzer Readback der neuen Zeile

Der Gateway ist bereits die richtige Backend-Grenze für einen späteren direkten ECHO-Connector und entfernt dann die Sheet-Orchestrierung vollständig aus dem Spielleiter-Client.

## Kontextbindung gegen veraltete Züge

Der Runtime-Read liefert neben dem Kontext auch einen context_fingerprint. Ein neuer Connector sollte diesen Wert unverändert als context_fingerprint im Turn-Objekt mitführen. Der Processor liest den vollständigen autoritativen Workbook-Kontext unmittelbar vor dem Commit erneut:

- MATCHED: der Zug darf weiterverarbeitet werden;
- STALE: der Zug wird vor dem ersten Event-/Scene-/State-Schreibvorgang abgelehnt;
- NOT_PROVIDED: ältere Clients bleiben kompatibel, verzichten aber auf diesen Schutz;
- UNAVAILABLE: ein vorhandener Fingerprint wird nicht ohne frischen Kontext akzeptiert.

Nach STALE muss der Connector den Runtime-Kontext erneut lesen und den Zug auf dieser Basis neu erzeugen. Die Prüfung ist eine zusätzliche Konsistenzgrenze und ersetzt weder die Inbox-Idempotenz noch die normale Ereignisvalidierung.
