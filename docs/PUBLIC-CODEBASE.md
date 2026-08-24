# Öffentliche Codebasis

ECHO verwendet GitHub als öffentliche Source-of-Truth für den Programmcode. Private Laufzeitdaten bleiben außerhalb des Repositorys.

## Grundsatz

```text
GitHub          = Quellcode, Architektur, Verträge, Beispiele
Script Properties = private IDs, Schlüssel und Tokens
Google Sheets   = privater Live-Spielstand
Apps Script     = Deployment des Codes gegen private Konfiguration
```

Damit kann der komplette technische Aufbau versioniert und nachvollzogen werden, ohne den laufenden Spielstand oder Zugangsdaten zu veröffentlichen.

## Synchronisationsregel

Änderungen an der Live-Apps-Script-Logik sollen zuerst oder parallel im Repository gepflegt werden. Private Werte werden anschließend ausschließlich im Apps-Script-Projekt als Script Properties gesetzt.

Die aktuelle öffentliche Apps-Script-Struktur liegt unter `apps-script/`.
