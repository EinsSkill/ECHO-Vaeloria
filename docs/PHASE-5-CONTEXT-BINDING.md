# Phase 5 – Kontextbindung und Schutz vor veralteten Zügen

Phase 5 bindet einen eingereichten Spielzug an den Runtime-Kontext, aus dem er erzeugt wurde. Dadurch kann der Processor erkennen, ob sich der private Workbook-Zustand zwischen Lesen und Commit verändert hat.

## Ablauf

1. Der Runtime-Kontext wird gelesen und enthält context_fingerprint.
2. Der Connector übernimmt diesen Wert unverändert in den neuen Turn.
3. Der Turn wird wie bisher als PENDING in TURN_INBOX übergeben.
4. Vor dem Commit liest der Processor den vollständigen autoritativen Kontext erneut.
5. Nur bei MATCHED wird der bestehende Transaktions- und Commit-Ablauf fortgesetzt.

Ein abweichender Fingerprint führt zu STALE. In diesem Fall wird der Zug vor EVENT_LOG, SCENE_FEED, STATE_SNAPSHOT, Beziehungen, Gruppen, Präferenzen und Profilen abgelehnt. Der Spielerzug wird nicht stillschweigend an einen anderen Weltzustand angepasst.

## Kompatibilität

Direkte ältere Clients ohne context_fingerprint bleiben unter NOT_PROVIDED kompatibel. Sie verwenden weiterhin die bestehenden Validierungen, erhalten aber nicht den zusätzlichen Schutz gegen einen veralteten Kontext. Neue Connectoren sollen den Fingerprint immer mitsenden.

Der Schutz gilt auch für Korrekturzüge. Ein Korrekturzug ohne Fingerprint bleibt aus Kompatibilitätsgründen möglich; ein mitgesendeter veralteter Fingerprint wird abgelehnt.

## Technischer Vertrag

Der Vertrag ist verfügbar über:

- GET?action=context-binding-contract
- die Gateway-Operation context-binding-contract
- den Runtime-Kontext unter context_binding_contract

Der Runtime-Kontext enthält zusätzlich den aktuellen context_fingerprint. Die Statuswerte der reinen Prüffunktion sind MATCHED, NOT_PROVIDED, STALE und UNAVAILABLE.

Die Prüfung verwendet nur technische Fingerprints und private Laufzeitdaten. Sie schreibt keine Fingerprints in Git und ändert keine Workbook-Daten während der Validierung. Die bereits vorhandenen TURN_INBOX-Felder context_fingerprint und context_read_at reichen aus; eine neue Migration ist nicht erforderlich.

## Grenze

Kontextbindung ist eine Konsistenzprüfung, keine Regel- oder Inhaltsentscheidung. Die normale Kanon-, Szenen-, Auflösungs-, Beziehungs-, Einwilligungs- und Transaktionsvalidierung bleibt unverändert bestehen. Nach STALE muss der Spielleiter den Kontext erneut lesen und den Zug neu erzeugen.
