import { Client } from 'ssh2'
import type { BrowserWindow } from 'electron'
import type { Server, TerminalConnectConfig, TerminalSessionInfo } from '../../../shared/types'
import { cryptoService } from './crypto.service'
import { isPPKFormat, convertPPKToOpenSSH } from '../utils/ppk-convert'

function maybeConvertKey(key: string): string {
  return isPPKFormat(key) ? convertPPKToOpenSSH(key) : key
}

interface TerminalSession {
  client: Client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stream: any
  label: string
  startedAt: number
  windowId: number
}

const sessions = new Map<string, TerminalSession>()

let _onSessionsChanged: (() => void) | null = null
export function setSessionsChangedCallback(cb: () => void): void { _onSessionsChanged = cb }

function buildConnConfig(server: Server): Record<string, unknown> {
  const config: Record<string, unknown> = {
    host: server.host,
    port: server.port,
    username: server.username,
    readyTimeout: 15000,
    keepaliveInterval: 10000
  }
  if (server.authType === 'password' && server.encryptedPassword) {
    config.password = cryptoService.decrypt(server.encryptedPassword)
  } else if (server.authType === 'key' && server.encryptedPrivateKey) {
    config.privateKey = maybeConvertKey(cryptoService.decrypt(server.encryptedPrivateKey))
    if (server.encryptedPassphrase) {
      config.passphrase = cryptoService.decrypt(server.encryptedPassphrase)
    }
  }
  return config
}

export const terminalService = {
  openWithConfig(win: BrowserWindow, config: Record<string, unknown>, sessionId: string, label = '', windowId = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = new Client()

      client.on('ready', () => {
        client.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
          if (err) {
            client.end()
            reject(err)
            return
          }

          sessions.set(sessionId, { client, stream, label, startedAt: Date.now(), windowId })

          // PTY-Shell merges stdout+stderr into the main stream —
          // do NOT also listen on stream.stderr or every byte arrives twice.
          stream.on('data', (data: Buffer) => {
            if (!win.isDestroyed()) {
              win.webContents.send('terminal:data', { sessionId, data: data.toString('binary') })
            }
          })

          stream.on('close', () => {
            sessions.delete(sessionId)
            if (!win.isDestroyed()) {
              win.webContents.send('terminal:closed', { sessionId })
            }
            client.end()
            _onSessionsChanged?.()
          })

          resolve()
        })
      })

      client.on('error', (err) => {
        sessions.delete(sessionId)
        reject(err)
      })

      client.connect(config as Parameters<Client['connect']>[0])
    })
  },

  open(win: BrowserWindow, server: Server, sessionId: string, label = ''): Promise<void> {
    return this.openWithConfig(win, buildConnConfig(server), sessionId, label, win.id)
  },

  openDirect(win: BrowserWindow, config: TerminalConnectConfig, sessionId: string, label = ''): Promise<void> {
    const connConfig: Record<string, unknown> = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 15000,
      keepaliveInterval: 10000
    }
    if (config.password) connConfig.password = config.password
    if (config.privateKey) connConfig.privateKey = maybeConvertKey(config.privateKey)
    if (config.passphrase) connConfig.passphrase = config.passphrase
    return this.openWithConfig(win, connConfig, sessionId, label, win.id)
  },

  write(sessionId: string, data: string): void {
    sessions.get(sessionId)?.stream.write(data)
  },

  resize(sessionId: string, cols: number, rows: number): void {
    sessions.get(sessionId)?.stream.setWindow(rows, cols, 0, 0)
  },

  close(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (session) {
      try { session.stream.close() } catch {}
      try { session.client.end() } catch {}
      sessions.delete(sessionId)
      _onSessionsChanged?.()
    }
  },

  closeAll(): void {
    for (const [id] of sessions) {
      this.close(id)
    }
  },

  getSessionInfos(): TerminalSessionInfo[] {
    return [...sessions.entries()].map(([sessionId, s]) => ({
      sessionId,
      label: s.label,
      startedAt: s.startedAt,
      windowId: s.windowId
    }))
  }
}
