# Architektur

ECHO trennt Erzählung, Regelentscheidung, Persistenz und Darstellung bewusst voneinander. Dadurch bleibt ein Spielzug nachvollziehbar und der Chat ist nicht selbst die einzige Speicherquelle.

## Komponenten

### 1. Chat-Eingabe

Der Spieler kontrolliert ausschließlich seine eigene Figur und beschreibt Handlungen frei in natürlicher Sprache. Vorschläge im Overlay sind nur Hinweise und führen niemals selbstständig einen Zug aus.

### 2. Spielleitung und Validierung

Vor einem Commit wird die Handlung gegen die maßgeblichen Quellen geprüft:

1. aktueller Spielstand
2. bestätigter Kanon und bestätigte Regeln
3. bestätigte Ereignisse
4. offene Fragen, Gerüchte und Hypothesen

Ein gültiger Spielzug erhält eindeutige IDs und eine strukturierte Payload.

### 3. TURN_INBOX

Neue Spielzüge werden zunächst als `PENDING` übergeben. Die Inbox bildet die Schreibgrenze zwischen Spielleitung und persistentem Store.

Die Spielleitung schreibt nicht direkt in Event Log, Scene Feed oder State Snapshot.

### 4. Processing Layer

Google Apps Script verarbeitet den Inbox-Eintrag, validiert die Übergabe und aktualisiert die zuständigen persistenten Tabellen.

Typische Zielbereiche sind:

- `EVENT_LOG`
- `STATE_SNAPSHOT`
- `SCENE_FEED`
- `RELATIONSHIP_STATE`
- `THREADS`
- `FLAGS`

### 5. Fast Turn Gateway

Für interaktives Spielen kann ein schmaler Apps-Script-Gateway vor `TURN_INBOX` liegen. Er ändert die Persistenzregeln nicht, sondern bündelt die technischen Roundtrips:

```text
Runtime Context lesen
        ↓
Spielzug erzeugen
        ↓
Fast Turn Gateway
        ↓
TURN_INBOX · PENDING
        ↓
normaler Processing Layer
```

Der Gateway liefert einen kompakten Runtime-Kontext, schreibt neue Inbox-Zeilen atomar, verhindert doppelte `turn_id`-Einträge und verifiziert die Übergabe. Die nachgelagerten Tabellen bleiben weiterhin ausschließlich Aufgabe des Processors.

Referenz: [`FAST-TURN-GATEWAY.md`](FAST-TURN-GATEWAY.md)

### 6. Overlay

Das Overlay ist schreibgeschützt. Es stellt nur den bereits verarbeiteten Zustand dar, unter anderem:

- aktuelle Szene
- Ort und Stimmung
- Inventar
- Beziehungen
- offene Fäden
- sichtbare Statusänderungen

### 7. Vorlesen

Die öffentliche Foundation-Demo nutzt die Browser-API `SpeechSynthesis`. Dadurch wird für die Grundfunktion kein externer TTS-Dienst und kein API-Key benötigt.

## Designprinzipien

- **Single Source of Truth:** Ein fortlaufender Spielstand statt paralleler Chat-Zeitlinien.
- **Append-orientierte Ereignisse:** Konsequenzen bleiben nachvollziehbar.
- **Private State, Public Code:** Laufender Spielstand und Geheimnisse bleiben außerhalb von GitHub.
- **Freie Spielerhandlung:** Keine Auswahl erzwingen.
- **Kanon vor Improvisation:** Unbekanntes bleibt unbekannt, bis es im Spiel bestätigt wird.
- **Darstellung getrennt von Persistenz:** Das Overlay erfindet keinen Zustand.
- **Fast Path ohne zweite Wahrheit:** Performance-Optimierungen dürfen die bestehende Inbox-/Commit-Grenze nicht umgehen.
