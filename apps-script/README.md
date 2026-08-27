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

Phase 3B ergänzt die technische Auflösungsstruktur unter resolution_contract. ROLL, NO_ROLL und NO_CHECK werden validiert; eine neue Szene erhält eine sichtbare SYSTEM-Zeile und die Auflösung wird in EVENT_LOG und SCENE_FEED abgelegt.

Phase 3C ergänzt overlay_contract und einen Commit-Readback unter status.delivery. Der Chat darf erst dann „Übertragen.“ melden, wenn der Inbox-Eintrag COMMITTED ist und eine ui_feed_id besitzt. Der vollständige, formatierte Szeneninhalt bleibt im Overlay; status und Submit geben keine Erzählung an den Chat zurück.

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

Phase 4 ergänzt stabile, workbook-basierte Projektionen für Welt, Charaktere, Beziehungen und Gruppen:

- context_version ist phase-4.
- projection_contract beschreibt die stabilen Ausgabefelder und ihre Quellen.
- Charaktereinträge werden aus Profil, Beziehung, Gruppenmitgliedschaft und charakterbezogenen Präferenzen über eine stabile Entity-ID zusammengeführt.
- Aktive Gruppenmitgliedschaften werden deterministisch sortiert; LEFT, INACTIVE und PAUSED werden nicht als aktive Mitglieder projiziert.
- Numerische Beziehungswerte kommen ausschließlich aus RELATIONSHIP_STATE. Profilwerte bleiben qualitative Profilinformationen; Unbekanntes wird nicht zu einer Zahl.
- GET?action=projection-contract und die Gateway-Operation projection-contract liefern den technischen Vertrag.

Phase 4 benötigt keine neue Migration und schreibt keine privaten Tabellenwerte in Git. Beim späteren Sammel-Import genügt weiterhin die konsolidierte apps-script/Code.gs.

Phase 5 ergänzt die Kontextbindung für neue Spielzüge:

- Der Runtime-Kontext liefert context_binding_contract und context_fingerprint.
- Ein Connector kann den gelesenen context_fingerprint zusammen mit dem Zug in TURN_INBOX übergeben.
- Vor dem Commit liest der Processor den autoritativen Workbook-Kontext erneut.
- Bei übereinstimmender Signatur wird der Zug verarbeitet; ein abweichender Fingerprint wird als STALE abgelehnt, bevor EVENT_LOG, SCENE_FEED oder State geschrieben werden.
- Ohne Fingerprint bleiben ältere direkte Clients kompatibel; sie verlieren aber den zusätzlichen Stale-Schutz.
- Der Vertrag ist unter GET?action=context-binding-contract und als Gateway-Operation context-binding-contract verfügbar.

Auch Phase 5 verändert keine privaten Tabellenwerte und benötigt keine zusätzliche Migration.


Phase 6 ergänzt den Readback-Schutz für Szenen:

- Nach dem Schreiben wird der tatsächliche SCENE_FEED-Datensatz erneut gelesen.
- feed_id, event_id, Revision, scene_contract_version, sichtbare scene_blocks_json und die formatierte narrative_text-Repräsentation müssen zusammenpassen.
- Erst nach erfolgreichem Readback wird die Transaktion auf COMMITTED gesetzt und die Chat-Bestätigung freigegeben.
- Bei einer Abweichung entsteht SCENE_READBACK_FAILED und die Transaktion bleibt RECOVERY_REQUIRED.
- Der vollständige Szenentext bleibt ausschließlich im Overlay; der Readback liefert nur Status und technische Metadaten.
- GET?action=scene-readback-contract und die Gateway-Operation scene-readback-contract liefern den technischen Vertrag.

Auch Phase 6 verändert keine privaten Tabellenwerte und benötigt keine zusätzliche Migration. Beim späteren Sammel-Import genügt weiterhin die konsolidierte apps-script/Code.gs.


Phase 7 ergänzt den autoritativen Ereignis- und Zustandsabgleich:

- Eine event_id bleibt an genau einen Payload gebunden; veränderte Wiederholungen werden als EVENT_PAYLOAD_CONFLICT abgelehnt.
- Neue Payload-Fingerprints ignorieren nur die flüchtigen Kontextfelder; ältere Fingerprint-Daten bleiben kompatibel.
- Vor COMMITTED werden EVENT_LOG, SCENE_FEED, SCENE_REVISIONS und – bei normalen Zügen – STATE_SNAPSHOT.save.last_event_id gegengeprüft.
- Korrekturen behalten die Originalszene als Quelle und werden über eine eigene Revision nachvollziehbar.
- Ein Widerspruch führt zu COMMIT_RECONCILIATION_FAILED und RECOVERY_REQUIRED; die Erfolgsmeldung bleibt gesperrt.
- GET?action=commit-reconciliation-contract und die Gateway-Operation commit-reconciliation-contract liefern den technischen Vertrag.

Auch Phase 7 verändert keine privaten Tabellenwerte und benötigt keine zusätzliche Migration. Beim späteren Sammel-Import genügt weiterhin die konsolidierte apps-script/Code.gs.
