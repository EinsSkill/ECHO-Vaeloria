# Phase 6 – SCENE_FEED-Readback

Phase 6 closes the write path at the point where the overlay reads its scene.

## Ziel

Ein Zug darf erst als `COMMITTED` gelten und die Bestätigung `Übertragen.` auslösen, wenn der tatsächlich geschriebene `SCENE_FEED`-Datensatz erneut gelesen und geprüft wurde. Dadurch werden leere, gekürzte oder falsch formatierte Szenen nicht stillschweigend als erfolgreich behandelt.

## Geprüfte Werte

Die Readback-Prüfung kontrolliert:

- `feed_id` und die erwartete Revision
- die zugehörige `event_id`
- `scene_contract_version`
- gültiges `scene_blocks_json` mit mindestens einem sichtbaren Block
- `narrative_text` gegen die kanonische Formatierung aus den Blöcken

Die Readback-Antwort enthält nur Prüfstatus und Metadaten, nicht den Erzähltext.

## Fehlerverhalten

Bei einer Abweichung wirft die Commit-Schicht `SCENE_READBACK_FAILED`. Die Transaktion wird auf `RECOVERY_REQUIRED` gesetzt; der Inbox-Prozessor gibt keine Erfolgsmeldung aus. Die Szene bleibt im Workbook sichtbar, bis die Ursache korrigiert und der Zug sicher wiederaufgenommen wurde.

## Öffentliche Schnittstellen

- `GET?action=scene-readback-contract`
- Gateway-Operation `scene-readback-contract`

Die Schnittstelle beschreibt nur den technischen Vertrag. Kanon, Spielgedächtnis, Vorlieben, Beziehungswerte und aktuelle Szeneninhalte bleiben ausschließlich im privaten ECHO-Workbook.

## Reihenfolge

1. Szene in `SCENE_FEED` schreiben.
2. Den Datensatz über seine `feed_id` erneut lesen.
3. Format und Identität validieren.
4. Erst bei Erfolg die Transaktion auf `COMMITTED` setzen.
5. Die Overlay-Lieferung liefert den vollständigen Text ausschließlich aus dem Workbook.

