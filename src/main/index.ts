import { app, BrowserWindow, shell, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { initDb, closeDb } from './db/index'
import { cryptoService } from './services/crypto.service'
import { registerAllHandlers } from './ipc/index'
import { sftpService } from './services/sftp.service'
import { watcherService } from './services/watcher.service'
import { terminalService } from './services/terminal.service'
import { logRepo } from './db/repositories/log.repo'
import { getSettings } from './ipc/settings.handlers'

const isDev = process.env.NODE_ENV === 'development'

// ─── Single-instance lock ────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// ─── Window ──────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function getIconPath(): string {
  return isDev
    ? path.join(process.cwd(), 'resources/icons/icon.ico')
    : path.join(process.resourcesPath, 'icons/icon.ico')
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1117',
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 16, y: 16 } }
      : { titleBarOverlay: { color: '#0f1117', symbolColor: '#ffffff', height: 32 } }
    ),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Intercept close — hide to tray instead of quitting
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  if (isDev) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] || 'http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

function createTray(): void {
  const iconPath = getIconPath()
  let icon: Electron.NativeImage

  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty()
    }
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('SFTP Deployer')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Anzeigen',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Beenden',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow?.show()
    }
  })

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function handleUploadPath(filePath: string): void {
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()
  // Delay slightly to ensure renderer is ready
  setTimeout(() => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.webContents.send('upload:request', { path: filePath })
    }
  }, 500)
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.on('second-instance', (_event, commandLine) => {
  // A second instance was opened (e.g. via context menu)
  const uploadArg = commandLine.find((a) => a.startsWith('--upload-path='))
  if (uploadArg) {
    handleUploadPath(uploadArg.slice('--upload-path='.length))
  } else {
    mainWindow?.show()
    mainWindow?.focus()
  }
})

app.whenReady().then(async () => {
  await initDb()
  cryptoService.init()
  registerAllHandlers()

  // Prune old log entries based on retention setting
  const { logRetentionDays } = getSettings()
  logRepo.pruneOlderThan(logRetentionDays)

  mainWindow = createWindow()
  createTray()

  // Start file watchers for all autoWatch servers
  mainWindow.webContents.once('did-finish-load', () => {
    watcherService.initAll()

    // Handle --upload-path from first launch
    const uploadArg = process.argv.find((a) => a.startsWith('--upload-path='))
    if (uploadArg) {
      handleUploadPath(uploadArg.slice('--upload-path='.length))
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Don't quit when all windows are closed — app lives in tray
  // Only quit on explicit quit action
})

app.on('before-quit', async () => {
  isQuitting = true
  terminalService.closeAll()
  watcherService.stopAll()
  await sftpService.disconnectAll()
  closeDb()
})
