# ECHO Apps Script

Dieser Ordner enthält den öffentlichen, secret-freien Apps-Script-Code der Live-Architektur.

## Standalone-Backend

- `Code.gs` – vollständiger Apps-Script-Backend mit Einstieg, Turn-Vertrag, Schema-Migration, Inbox-Processor, Overlay-Projektion, Sheets-Helfern und Fast Turn Gateway

Die Backend-Logik liegt absichtlich in einer einzigen `.gs`-Datei. Dadurch kann der Inhalt von `Code.gs` vollständig in das private ECHO-Apps-Script-Projekt übernommen werden, ohne dass einzelne Abhängigkeiten fehlen oder doppelte globale Definitionen entstehen.

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

## Verbindlicher Chat-/Overlay-Ausgabemodus

Für das laufende Spiel gilt ein fester Ausgabevertrag:

- Der Chat nimmt die Spielerhandlung entgegen und gibt keine vollständige Szene aus.
- Die vollständige, formatierte Erzählung wird nach erfolgreichem Commit in SCENE_FEED geschrieben und ausschließlich vom Overlay dargestellt.
- Erst nach Commit und Readback wird im Chat nur kurz bestätigt: „Übertragen.“
- Bei Fehlern wird nur der Fehler knapp gemeldet; es wird keine nicht gespeicherte Szene als übertragen ausgegeben.
- Die Spielleitung arbeitet mit gründlicher Persistenz-/Konsistenzprüfung; bei aufwendigeren Zügen ist ein internes Prüfungsfenster von etwa 2–3 Minuten vorgesehen.

Der Runtime-Kontext liefert diese Policy unter chat_delivery, damit spätere Connectoren sie maschinenlesbar einhalten können.

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

`setupEchoTrigger()` führt vor der Trigger-Erstellung auch `setupEchoSchema()` aus. Die Migration ergänzt ausschließlich fehlende Spalten für `respect`, `tension`, `safety`, `dominance`, `submission`, `consent_state`, `boundaries_json`, `intimacy_phase`, `intimacy_profile_json`, `teaching`, `content_rating` und `intimacy_mode`. Bestehende Werte werden nicht überschrieben.

Die Beziehungsschicht kann damit Vertrauen, Verlangen, Angst, Respekt, Spannung und Sicherheitslage sowie eine freiwillige, pausierbare oder widerrufbare Nähe-Dynamik darstellen. Diese Metadaten sind keine Eingabe und erzeugen keine Zustimmung.
