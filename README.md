# SFTP Deployer

A modern, feature-rich desktop application for deploying files to remote servers via SFTP — built with Electron, React, and TypeScript.

---

## Features

### Core
- **Smart Sync** — only uploads changed files (hash-based diffing, no unnecessary transfers)
- **Dry Run** — preview what would be uploaded before committing
- **Auto-Watch** — monitors local folders and syncs automatically on file changes
- **Delete Orphans** — optionally removes remote files that no longer exist locally
- **Concurrent Uploads** — configurable parallel upload limit for maximum speed

### SSH & Terminal
- **Integrated SSH Terminal** — full xterm.js terminal directly connected to your server
- **Multiple Sessions** — open several terminal sessions side by side
- **Separate Terminal Window** — detach terminal into its own window

### File Management
- **SFTP File Browser** — dual-pane browser (local + remote) with drag-and-drop style navigation
- **In-app File Editor** — edit remote files directly in the app
- **Permissions (chmod)** — change file permissions from the browser
- **Rename, Delete, mkdir** — full remote file system management

### Backup & Recovery
- **Automatic Backups** — saves a copy of every file before overwriting
- **Session-based Restore** — restore any previous upload session with one click
- **Configurable Retention** — set how many days logs and backups are kept

### Cloud Storage
- **WebDAV** support (Nextcloud, ownCloud, etc.)
- **Google Drive** integration (OAuth)
- **Dropbox** integration (OAuth)
- **OneDrive** integration (OAuth)

### Auto-Updater
- Checks GitHub Releases automatically on startup
- Shows update banner with expandable changelog
- One-click download + install with live progress bar
- Seamless restart — replaces the running exe and relaunches

### Quality of Life
- **Dark / Light / System theme**
- **System Tray** — minimizes to tray, keeps running in background
- **Windows Context Menu** — right-click any file in Explorer to upload directly
- **Encryption** — passwords and private keys are stored encrypted (bcrypt + AES)
- **SSH Key Auth** — supports PEM and PPK private keys (with optional passphrase)
- **Ignore Patterns** — `.gitignore`-style rules to exclude files from sync

---

## Screenshots

> Coming soon

---

## Download

Head to [Releases](https://github.com/Airartz/sftp-deployer/releases) and download the latest `SFTPDeployer-Setup.exe`.

No installer needed — it's a portable executable, just run it.

---

## Getting Started

1. **Download** `SFTPDeployer-Setup.exe` from the latest release
2. **Run** the exe — no installation required
3. **Add a server** via the `+ Server hinzufügen` button
4. Fill in your host, port, username, and either password or SSH key
5. Pick your local folder and the remote target path
6. Hit **Sync** — done

---

## Server Configuration

| Field | Description |
|---|---|
| Name | Display name for the server |
| Host | IP address or hostname |
| Port | SSH port (default: 22) |
| Username | SSH username |
| Auth | Password or private key (PEM / PPK) |
| Local Path | Local folder to sync from |
| Remote Path | Remote destination folder |
| Ignore Patterns | Files/folders to exclude (`.gitignore` syntax) |
| Auto-Watch | Automatically sync on file changes |
| Delete Orphans | Remove remote files deleted locally |
| Backup | Keep backups before overwriting |

---

## Building from Source

**Prerequisites:** Node.js 20+, npm

```bash
# Clone the repo
git clone https://github.com/Airartz/sftp-deployer.git
cd sftp-deployer

# Install dependencies
npm install

# Start in development mode
npm run dev

# Build production binary (Windows)
npm run package:win
```

> **Note:** `npm run dev` must be run from your own terminal — not through Claude Code — because Electron needs a real interactive shell to open the window.

---

## Releasing a New Version

1. Update `"version"` in `package.json` (e.g. `"1.1.0"`)
2. Build: `npm run package:win`
3. Create the GitHub release:

```bash
gh release create v1.1.0 dist/SFTPDeployer-Setup.exe \
  --title "SFTP Deployer v1.1.0" \
  --notes "## What's new
- Your changelog here"
```

All running instances will detect the new release on next startup and show the update banner automatically.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Electron](https://www.electronjs.org/) 28 |
| UI | [React](https://react.dev/) 18 + [Tailwind CSS](https://tailwindcss.com/) |
| Language | TypeScript |
| Bundler | [electron-vite](https://electron-vite.github.io/) |
| Database | [sql.js](https://sql.js.org/) (SQLite in-memory, persisted to file) |
| SFTP | [ssh2-sftp-client](https://github.com/theophilusx/ssh2-sftp-client) |
| Terminal | [xterm.js](https://xtermjs.org/) |
| State | [Zustand](https://zustand-demo.pmnd.rs/) |

---

## License

MIT
