import { app, BrowserWindow } from 'electron'
import https from 'https'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'

// ─── Configure your GitHub repo here ─────────────────────────────────────────
const GITHUB_OWNER = 'Airartz'
const GITHUB_REPO  = 'sftp-deployer'
// ─────────────────────────────────────────────────────────────────────────────

export interface UpdateInfo {
  version: string       // e.g. "1.2.0"
  tagName: string       // e.g. "v1.2.0"
  changelog: string     // GitHub release body (markdown)
  publishedAt: string
  downloadUrl: string   // direct exe download URL
}

export interface UpdateProgress {
  percent: number       // 0–100
  bytesReceived: number
  totalBytes: number
}

type ProgressCallback = (p: UpdateProgress) => void

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number)
  const [aMaj, aMin, aPat] = parse(a)
  const [bMaj, bMin, bPat] = parse(b)
  if (aMaj !== bMaj) return aMaj - bMaj
  if (aMin !== bMin) return aMin - bMin
  return aPat - bPat
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': `sftp-deployer/${app.getVersion()}` }
    }, (res) => {
      // Follow redirects (GitHub does 302 for asset downloads)
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location
        if (!location) return reject(new Error('Redirect without location'))
        return resolve(httpsGet(location))
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => resolve(data))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error('Request timeout')) })
  })
}

function httpsDownload(url: string, destPath: string, onProgress: ProgressCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    const doRequest = (targetUrl: string) => {
      const req = https.get(targetUrl, {
        headers: { 'User-Agent': `sftp-deployer/${app.getVersion()}` }
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location
          if (!loc) return reject(new Error('Redirect without location'))
          return doRequest(loc)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`))
        }

        const total = parseInt(res.headers['content-length'] ?? '0', 10)
        let received = 0
        const file = fs.createWriteStream(destPath)

        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          file.write(chunk)
          onProgress({
            percent: total > 0 ? Math.round((received / total) * 100) : 0,
            bytesReceived: received,
            totalBytes: total
          })
        })

        res.on('end', () => { file.end(); resolve() })
        res.on('error', (err) => { file.destroy(); reject(err) })
        file.on('error', reject)
      })
      req.on('error', reject)
    }

    doRequest(url)
  })
}

// ─── Service ──────────────────────────────────────────────────────────────────

class UpdaterService {
  private _downloadedPath: string | null = null

  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (GITHUB_OWNER === 'YOUR_GITHUB_USERNAME') {
      throw new Error('GitHub-Repository nicht konfiguriert. Bitte GITHUB_OWNER in updater.service.ts setzen.')
    }

    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
    const raw = await httpsGet(apiUrl)
    const release = JSON.parse(raw) as {
      tag_name: string
      body: string
      published_at: string
      assets: { name: string; browser_download_url: string }[]
      message?: string
    }

    if (release.message === 'Not Found') {
      throw new Error('GitHub-Release nicht gefunden.')
    }

    const current = app.getVersion()
    const latest  = release.tag_name.replace(/^v/, '')

    if (compareSemver(latest, current) <= 0) {
      return null // already up to date
    }

    // Find the Windows exe asset
    const exeAsset = release.assets.find((a) =>
      a.name.toLowerCase().endsWith('.exe')
    )
    if (!exeAsset) {
      throw new Error('Kein .exe-Asset im neuesten Release gefunden.')
    }

    return {
      version: latest,
      tagName: release.tag_name,
      changelog: release.body ?? '',
      publishedAt: release.published_at,
      downloadUrl: exeAsset.browser_download_url
    }
  }

  async downloadUpdate(info: UpdateInfo, onProgress: ProgressCallback): Promise<void> {
    const tmpPath = path.join(os.tmpdir(), `sftp-deployer-${info.version}.exe`)
    await httpsDownload(info.downloadUrl, tmpPath, onProgress)
    this._downloadedPath = tmpPath
  }

  async installUpdate(): Promise<void> {
    const newExe = this._downloadedPath
    if (!newExe || !fs.existsSync(newExe)) {
      throw new Error('Update-Datei nicht gefunden. Bitte erneut herunterladen.')
    }

    // For portable builds, process.execPath points to the temp-extracted copy.
    // PORTABLE_EXECUTABLE_FILE is set by electron-builder and holds the real path.
    const currentExe = process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath
    const pid = process.pid

    const batchPath = path.join(os.tmpdir(), 'sftp-deployer-update.bat')
    const batch = [
      '@echo off',
      `:wait`,
      `tasklist /FI "PID eq ${pid}" 2>NUL | find " ${pid} " >NUL`,
      `if %ERRORLEVEL% == 0 (`,
      `  timeout /t 1 /nobreak >NUL`,
      `  goto wait`,
      `)`,
      `copy /y "${newExe}" "${currentExe}"`,
      `del "${newExe}"`,
      `start "" "${currentExe}"`,
      `del "%~f0"`
    ].join('\r\n')

    fs.writeFileSync(batchPath, batch)

    // Use VBScript to launch the batch hidden — windowsHide+detached is unreliable on Windows
    const vbsPath = path.join(os.tmpdir(), 'sftp-deployer-update.vbs')
    const vbs = [
      'Set sh = CreateObject("WScript.Shell")',
      `sh.Run "cmd.exe /c ""${batchPath}""", 0, False`
    ].join('\r\n')

    fs.writeFileSync(vbsPath, vbs)

    spawn('wscript.exe', ['//B', vbsPath], {
      detached: true,
      stdio: 'ignore'
    }).unref()

    setTimeout(() => {
      BrowserWindow.getAllWindows().forEach((w) => w.destroy())
      app.exit(0)
    }, 500)
  }
}

export const updaterService = new UpdaterService()
