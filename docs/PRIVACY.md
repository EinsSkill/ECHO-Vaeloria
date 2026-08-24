# Öffentliche Sicherheits- und Datenschutzgrenze

ECHO trennt **öffentlichen Quellcode** von **privatem Laufzeitzustand**.

## Darf öffentlich sein

- vollständige technische Apps-Script-Implementierung, sofern secret-frei
- UI- und Overlay-Grundstruktur
- technische Architektur
- anonymisierte Datenverträge
- Fast-Turn-/Inbox-/Commit-Logik
- nichtkanonische Demo-Inhalte
- allgemeine Regel- und Persistenzprinzipien

## Bleibt privat

- Live-Spielstand
- vollständige Ereignis- und Szenenlogs
- zukünftige oder verborgene Kanoninformationen
- persönliche Daten
- Werte der Script Properties
- private Google-Sheet-IDs
- private Web-App-/Deployment-Informationen
- Tokens, Schlüssel und Zugangsdaten

## Konfiguration

Der öffentliche Apps-Script-Code referenziert nur die **Namen** privater Script Properties:

```text
ECHO_SPREADSHEET_ID
ECHO_API_KEY
ECHO_GATEWAY_TOKEN
ECHO_RUNTIME_KEYS_JSON   # optional
```

Die tatsächlichen Werte werden ausschließlich im privaten Apps-Script-Projekt gespeichert und niemals committed.

## Veröffentlichungskontrolle

Vor jedem öffentlichen Commit sollte mindestens auf folgende Muster geprüft werden:

- `docs.google.com`
- `drive.google.com`
- `script.google.com`
- lange Google-Datei- oder Deployment-IDs
- echte Werte hinter `api_key`, `token`, `secret`, `bearer`
- echte Ereignis-, Feed- oder Turn-Daten aus dem Live-Spiel

Die öffentliche Demo darf niemals als autoritative Quelle für den aktuellen Kanon verwendet werden.

Die Sicherheitsregel lautet damit: **Code öffentlich; Secrets, Konfiguration, Story-State und persönliche Daten privat.**
