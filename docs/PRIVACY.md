# Öffentliche Sicherheits- und Datenschutzgrenze

ECHO besitzt eine klare Trennung zwischen öffentlicher Software-Dokumentation und privatem Spielzustand.

## Darf öffentlich sein

- UI- und Overlay-Grundstruktur
- technische Architektur
- anonymisierte Datenverträge
- nichtkanonische Demo-Inhalte
- allgemeine Regel- und Persistenzprinzipien

## Bleibt privat

- Live-Spielstand
- vollständige Ereignis- und Szenenlogs
- zukünftige oder verborgene Kanoninformationen
- private Google-Sheets und deren IDs
- Web-App-/Deployment-URLs
- Tokens, Schlüssel und Zugangsdaten
- persönliche Daten

## Veröffentlichungskontrolle

Vor jedem öffentlichen Commit sollte mindestens auf folgende Muster geprüft werden:

- `docs.google.com`
- `drive.google.com`
- `script.google.com`
- lange Google-Datei- oder Deployment-IDs
- `api_key`, `token`, `secret`, `bearer`
- echte Ereignis-, Feed- oder Turn-Daten aus dem Live-Spiel

Die öffentliche Demo darf niemals als autoritative Quelle für den aktuellen Kanon verwendet werden.
