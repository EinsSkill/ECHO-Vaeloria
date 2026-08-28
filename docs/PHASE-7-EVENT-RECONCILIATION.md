# Phase 7 – Ereignis- und Zustandsabgleich

Phase 7 prüft nach dem Szenen-Readback, ob die persistenten ECHO-Artefakte weiterhin denselben Commit beschreiben.

## Ziel

Ein `event_id` bindet genau einen inhaltlichen Spielzug. Wiederholungen desselben Zuges bleiben idempotent; eine Wiederverwendung derselben ID mit verändertem Inhalt wird als `EVENT_PAYLOAD_CONFLICT` abgelehnt.

Für neue Züge wird der Fingerprint ohne die flüchtigen Kontextfelder `context_fingerprint` und `context_read_at` gebildet. Bereits vorhandene Transaktionen mit dem älteren Fingerprint-Format bleiben kompatibel.

## Commit-Reconciliation

Vor `COMMITTED` werden die tatsächlich persistierten Datensätze abgeglichen:

- normaler Zug: `EVENT_LOG`, `SCENE_FEED`, `SCENE_REVISIONS` und `STATE_SNAPSHOT.save.last_event_id`
- Szenen-Korrektur: `SCENE_FEED` und `SCENE_REVISIONS` mit Originalszene, Korrektur-Event, Feed und Transaktion

Geprüft werden insbesondere Transaktions-ID, Feed-ID, Revision-ID, Event-Verknüpfung und Payload-Fingerprint. Die Prüfung liefert ausschließlich technischen Status und IDs, keinen Erzähltext.

## Fehlerverhalten

Bei einem Widerspruch entsteht `COMMIT_RECONCILIATION_FAILED`; die Transaktion bleibt `RECOVERY_REQUIRED`. Dadurch wird keine Erfolgsmeldung ausgegeben, solange die Datenquellen nicht wieder konsistent sind.

## Öffentliche Schnittstelle

- `GET?action=commit-reconciliation-contract`
- Gateway-Operation `commit-reconciliation-contract`

Die Verträge enthalten keine privaten Kanon-, Präferenz-, Beziehungs- oder Szeneninhalte. Diese bleiben ausschließlich im privaten ECHO-Workbook.

