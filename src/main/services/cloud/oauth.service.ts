import http from 'http'
import { BrowserWindow } from 'electron'

export const REDIRECT_PORT = 7842
export const REDIRECT_URI  = `http://localhost:${REDIRECT_PORT}/callback`

export async function doOAuthFlow(authUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let done = false
    let win: BrowserWindow | null = null

    const server = http.createServer((req, res) => {
      const url   = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`)
      const code  = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f1117;color:#e2e8f0">
        <h2 style="color:${code ? '#34d399' : '#f87171'}">${code ? '✓ Authentifizierung erfolgreich!' : '✗ Fehler: ' + (error ?? 'Unbekannt')}</h2>
        <p>Du kannst dieses Fenster schließen.</p>
      </body></html>`)
      server.close()
      done = true
      // Close the OAuth window after a short delay so the user sees the success message
      setTimeout(() => { try { win?.close() } catch { /* ignore */ } }, 1500)
      if (code) resolve(code)
      else reject(new Error(error ?? 'OAuth fehlgeschlagen'))
    })

    server.listen(REDIRECT_PORT, () => {
      win = new BrowserWindow({ width: 600, height: 720, webPreferences: { nodeIntegration: false } })
      win.loadURL(authUrl)
      win.on('closed', () => {
        server.close()
        if (!done) reject(new Error('Fenster geschlossen'))
      })
    })

    server.on('error', (e) => reject(e))
    setTimeout(() => { server.close(); if (!done) reject(new Error('OAuth Timeout nach 5 Minuten')) }, 300_000)
  })
}

export async function exchangeCode(
  tokenUrl: string, code: string, clientId: string, clientSecret: string
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code,
      client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT_URI
    }).toString()
  })
  if (!res.ok) throw new Error(`Token-Exchange fehlgeschlagen: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in?: number }>
}

export async function refreshToken(
  tokenUrl: string, refreshTok: string, clientId: string, clientSecret: string
): Promise<{ access_token: string; expires_in?: number }> {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: refreshTok,
      client_id: clientId, client_secret: clientSecret
    }).toString()
  })
  if (!res.ok) throw new Error(`Token-Refresh fehlgeschlagen: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; expires_in?: number }>
}
