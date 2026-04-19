import { ipcMain, BrowserWindow } from 'electron'
import { updaterService } from '../services/updater.service'

export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:check', async () => {
    try {
      const info = await updaterService.checkForUpdates()
      return { ok: true, data: info }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      const win = BrowserWindow.getAllWindows()[0]

      const infoRes = await updaterService.checkForUpdates()
      if (!infoRes) return { ok: false, error: 'Kein Update verfügbar.' }

      await updaterService.downloadUpdate(infoRes, (progress) => {
        win?.webContents.send('updater:progress', progress)
      })

      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('updater:install', async () => {
    try {
      await updaterService.installUpdate()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
