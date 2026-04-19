# SFTP Deployer

Eine moderne Desktop-Anwendung zum Deployen von Dateien auf entfernte Server via SFTP — gebaut mit Electron, React und TypeScript.

---

## Funktionen

### Kern
- **Intelligenter Sync** — lädt nur geänderte Dateien hoch (Hash-basierter Vergleich, keine unnötigen Transfers)
- **Dry Run** — Vorschau aller Änderungen vor dem eigentlichen Upload
- **Auto-Watch** — überwacht lokale Ordner und synchronisiert automatisch bei Dateiänderungen
- **Verwaiste Dateien löschen** — entfernt optional Remote-Dateien, die lokal nicht mehr existieren
- **Parallele Uploads** — konfigurierbares Limit für gleichzeitige Übertragungen

### SSH & Terminal
- **Integriertes SSH-Terminal** — vollwertiges xterm.js-Terminal direkt mit dem Server verbunden
- **Mehrere Sessions** — mehrere Terminal-Sitzungen gleichzeitig offen
- **Separates Terminal-Fenster** — Terminal in ein eigenes Fenster ausklappen

### Dateiverwaltung
- **SFTP-Datei-Browser** — Zwei-Spalten-Browser (lokal + remote) mit intuitiver Navigation
- **Datei-Editor** — Remote-Dateien direkt in der App bearbeiten
- **Berechtigungen (chmod)** — Dateiberechtigungen direkt im Browser ändern
- **Umbenennen, Löschen, Ordner erstellen** — vollständige Remote-Dateisystemverwaltung

### Backup & Wiederherstellung
- **Automatische Backups** — speichert eine Kopie jeder Datei vor dem Überschreiben
- **Sitzungsbasierte Wiederherstellung** — beliebige frühere Upload-Sitzung mit einem Klick wiederherstellen
- **Konfigurierbare Aufbewahrung** — Anzahl der Tage für Logs und Backups einstellbar

### Cloud-Speicher
- **WebDAV** (Nextcloud, ownCloud, u.a.)
- **Google Drive** (OAuth)
- **Dropbox** (OAuth)
- **OneDrive** (OAuth)

### Auto-Updater
- Prüft GitHub Releases automatisch beim Start
- Zeigt Update-Banner mit aufklappbarem Changelog
- Ein-Klick-Download und Installation mit Fortschrittsbalken
- Nahtloser Neustart — ersetzt die laufende .exe und startet neu

### Komfort
- **Dunkel / Hell / System-Theme**
- **System Tray** — minimiert in die Taskleiste, läuft im Hintergrund weiter
- **Windows-Kontextmenü** — Rechtsklick auf eine Datei im Explorer → direkt hochladen
- **Verschlüsselung** — Passwörter und private Schlüssel werden verschlüsselt gespeichert
- **SSH-Key-Authentifizierung** — unterstützt PEM- und PPK-Schlüssel (mit optionaler Passphrase)
- **Ignoriermuster** — `.gitignore`-Syntax zum Ausschließen von Dateien

---

## Screenshots

> Demnächst verfügbar

---

## Download

Unter [Releases](https://github.com/Airartz/sftp-deployer/releases) die neueste `SFTPDeployer-Setup.exe` herunterladen.

Kein Installer nötig — einfach die Datei ausführen.

---

## Schnellstart

1. **Herunterladen** — `SFTPDeployer-Setup.exe` aus dem neuesten Release
2. **Starten** — kein Installationsschritt nötig
3. **Server hinzufügen** — über den Button `+ Server hinzufügen`
4. Host, Port, Benutzername und Passwort oder SSH-Schlüssel eintragen
5. Lokalen Ordner und Remote-Zielpfad auswählen
6. **Sync** klicken — fertig

---

## Server-Konfiguration

| Feld | Beschreibung |
|---|---|
| Name | Anzeigename des Servers |
| Host | IP-Adresse oder Hostname |
| Port | SSH-Port (Standard: 22) |
| Benutzername | SSH-Benutzername |
| Authentifizierung | Passwort oder privater Schlüssel (PEM / PPK) |
| Lokaler Pfad | Lokaler Ordner, der synchronisiert wird |
| Remote-Pfad | Zielordner auf dem Server |
| Ignoriermuster | Dateien/Ordner ausschließen (`.gitignore`-Syntax) |
| Auto-Watch | Bei Dateiänderungen automatisch synchronisieren |
| Verwaiste Dateien löschen | Lokal gelöschte Dateien auch remote entfernen |
| Backup | Vor dem Überschreiben Sicherungskopien anlegen |

---

## Aus dem Quellcode bauen

**Voraussetzungen:** Node.js 20+, npm

```bash
# Repository klonen
git clone https://github.com/Airartz/sftp-deployer.git
cd sftp-deployer

# Abhängigkeiten installieren
npm install

# Entwicklungsmodus starten
npm run dev

# Produktions-Binary erstellen (Windows)
npm run package:win
```

> **Hinweis:** `npm run dev` muss aus dem eigenen Terminal gestartet werden — nicht über Claude Code — da Electron ein echtes interaktives Terminal benötigt.

---

## Neues Release veröffentlichen

1. `"version"` in `package.json` erhöhen (z.B. `"1.1.0"`)
2. Bauen: `npm run package:win`
3. GitHub Release erstellen:

```bash
gh release create v1.1.0 dist/SFTPDeployer-Setup.exe \
  --title "SFTP Deployer v1.1.0" \
  --notes "## Was ist neu
- Hier das Changelog eintragen"
```

Alle laufenden Instanzen erkennen das neue Release beim nächsten Start und zeigen automatisch den Update-Banner an.

---

## Technologie-Stack

| Bereich | Technologie |
|---|---|
| Framework | [Electron](https://www.electronjs.org/) 28 |
| Oberfläche | [React](https://react.dev/) 18 + [Tailwind CSS](https://tailwindcss.com/) |
| Sprache | TypeScript |
| Bundler | [electron-vite](https://electron-vite.github.io/) |
| Datenbank | [sql.js](https://sql.js.org/) (SQLite, im Speicher + persistiert) |
| SFTP | [ssh2-sftp-client](https://github.com/theophilusx/ssh2-sftp-client) |
| Terminal | [xterm.js](https://xtermjs.org/) |
| State | [Zustand](https://zustand-demo.pmnd.rs/) |

---

## Lizenz

MIT
