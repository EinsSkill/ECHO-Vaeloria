# Phase 4 – Stabile Workbook-Projektionen

Phase 4 bildet die privaten ECHO-Workbook-Daten für den Runtime-Kontext und das Overlay in einer stabilen, maschinenlesbaren Struktur ab. Die Tabelle bleibt die alleinige Quelle für Kanon, Präferenzen, Beziehungen, Gruppen und den aktuellen Spielzustand; Git enthält nur die Projektionstechnik und ihre Tests.

## Zusammenführung

Die Charakterprojektion führt Einträge über die kanonische entityId zusammen:

- ECHO_CHARACTER_PROFILES liefert Name, Rolle, Expertise, Magie, Grenzen und qualitative Profilinformationen.
- RELATIONSHIP_STATE liefert den zuletzt bekannten Beziehungszustand und die gespeicherten numerischen Achsen.
- GROUP_MEMBERS liefert aktuelle Gruppenmitgliedschaften, gruppenspezifische Rollen, Positionen und Mitgliedsmetadaten.
- ECHO_PREFERENCE_PROFILE liefert charakterbezogene Präferenzen, sofern sie in der Tabelle vorhanden sind.

Profil-Aliase werden nur zur Zuordnung verwendet. Die kanonische Entity-ID bleibt unverändert. Mehrere aktive Beziehungszeilen für dieselbe Entity werden für die Projektion deterministisch nach Zeitstempel und Tabellenzeile auf den neuesten Stand reduziert. Die zugrunde liegenden Tabellenzeilen werden dabei nicht verändert.

## Unbekannte Werte und Sicherheit

- Fehlende Werte bleiben null, UNKNOWN oder eine leere Sammlung.
- Numerische Beziehungswerte werden ausschließlich aus RELATIONSHIP_STATE übernommen. Qualitative Profiltexte werden nicht in Zahlen umgewandelt.
- Aktive Gruppenprojektionen schließen LEFT, INACTIVE und PAUSED aus.
- Einwilligungs- und Grenzdaten beschreiben den gespeicherten Zustand; sie erzeugen niemals eine Einwilligung.
- Projektionen wählen keine Spielerhandlung, schreiben keinen Kanon um und haben keine Schreibrechte auf das Workbook.

## Ausgaben

GET?action=state enthält zusätzlich:

- projections.world
- projections.characters
- projections.relationships
- projections.groups

Für bestehende Overlay-Dateien bleiben kompatible Aliase wie characters, groups, characterProjections und relationshipProjections erhalten.

GET?action=projection-contract beschreibt Quellen, Felder und Invarianten. Der Runtime-Kontext und die Gateway-Antwort liefern denselben Vertrag unter projection_contract.

## Betrieb

Phase 4 benötigt keine neue Tabellenmigration. Die vorhandene private Struktur wird nur gelesen. Nach Abschluss der weiteren Phasen wird die konsolidierte apps-script/Code.gs gesammelt in das private Apps-Script-Projekt übernommen und anschließend als neue Web-App-Version bereitgestellt. Private IDs, Live-Zeilen und aktuelle Szeneninhalte gehören weiterhin nicht in dieses Repository.
