# Datenvertrag für Spielzüge

Die öffentliche Dokumentation bildet nur den strukturellen Vertrag ab. Reale Spielzüge und Live-Daten sind nicht Teil des Repositorys.

## TURN_INBOX

Mindestens benötigte Felder:

| Feld | Bedeutung |
| --- | --- |
| `turn_id` | eindeutige ID des Spielzugs |
| `chat_id` | logischer Ursprung des Spielzugs |
| `received_at` | Empfangszeitpunkt |
| `raw_input` | originale freie Spielerhandlung |
| `parsed_intent_json` | strukturierte Konsequenz- und Szenenpayload |
| `validation_status` | bei Übergabe zunächst `PENDING` |

Nach der Verarbeitung können zusätzlich Commit-/Feed-IDs, Fehlerstatus und Verarbeitungszeitpunkt geführt werden.

## parsed_intent_json

Der Kernvertrag enthält mindestens:

```json
{
  "event_id": "EVT-DEMO-001",
  "event_type": "PLAYER_ACTION",
  "player_action": "Originale Handlung des Spielers",
  "narrative_summary": "Kurze überprüfbare Zusammenfassung",
  "scene": {
    "feed_id": "SCENE-DEMO-001",
    "scene_type": "narrative",
    "title": "Szenentitel",
    "location_id": "LOC_DEMO",
    "narrative_text": "Vollständige sichtbare Szene",
    "mood": "Stimmung",
    "available_actions_json": [],
    "status": "PLAY"
  },
  "state_updates": {},
  "relationship_updates": {},
  "new_flags": []
}
```

Nur tatsächlich eingetretene Änderungen werden gespeichert. Möglichkeiten, Vermutungen und zukünftige Folgen werden nicht als bereits geschehene Fakten committed.
