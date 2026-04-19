import SftpClient from 'ssh2-sftp-client'
import type { Server } from '../../../shared/types'
import { cryptoService } from './crypto.service'
import { isPPKFormat, convertPPKToOpenSSH } from '../utils/ppk-convert'

export interface RemoteStat {
  size: number
  mtime: number  // Unix seconds
  isDirectory: boolean
}

export interface RemoteFile {
  relativePath: string
  size: number
  mtime: number
}

class SftpConnection {
  client: SftpClient
  private connected = false

  constructor() {
    this.client = new SftpClient()
  }

  async connect(server: Server): Promise<void> {
    if (this.connected) return

    const connectOptions: Record<string, unknown> = {
      host: server.host,
      port: server.port,
      username: server.username,
      readyTimeout: 20000
    }

    if (server.authType === 'password' && server.encryptedPassword) {
      connectOptions.password = cryptoService.decrypt(server.encryptedPassword)
    } else if (server.authType === 'key' && server.encryptedPrivateKey) {
      const rawKey = cryptoService.decrypt(server.encryptedPrivateKey)
      const isPPK = isPPKFormat(rawKey)
      const finalKey = isPPK ? convertPPKToOpenSSH(rawKey) : rawKey
      console.log('[SFTP] authType=key isPPK=' + isPPK + ' keyHeader=' + finalKey.split('\n')[0])
      connectOptions.privateKey = finalKey
      if (server.encryptedPassphrase) {
        connectOptions.passphrase = cryptoService.decrypt(server.encryptedPassphrase)
      }
    } else {
      console.log('[SFTP] authType=' + server.authType + ' hasPassword=' + !!server.encryptedPassword + ' hasKey=' + !!server.encryptedPrivateKey)
    }

    await this.client.connect(connectOptions as Parameters<SftpClient['connect']>[0])
    this.connected = true

    // Mark as disconnected if the underlying SSH session closes unexpectedly
    this.client.on('error', () => { this.connected = false })
    this.client.on('end',   () => { this.connected = false })
    this.client.on('close', () => { this.connected = false })
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return
    await this.client.end()
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  async stat(remotePath: string): Promise<RemoteStat | null> {
    try {
      const stats = await this.client.stat(remotePath)
      return {
        size: stats.size,
        mtime: Math.floor((stats.modifyTime ?? 0) / 1000),
        isDirectory: stats.isDirectory
      }
    } catch {
      return null
    }
  }

  async exists(remotePath: string): Promise<boolean> {
    return (await this.client.exists(remotePath)) !== false
  }

  async mkdir(remotePath: string, recursive = true): Promise<void> {
    await this.client.mkdir(remotePath, recursive)
  }

  async put(
    localPath: string,
    remotePath: string,
    onProgress?: (transferred: number, total: number) => void
  ): Promise<void> {
    const transferOptions = onProgress
      ? {
          step: (total: number, nb: number, fsize: number) => {
            onProgress(total, fsize)
          }
        }
      : undefined
    await this.client.put(localPath, remotePath, transferOptions)
  }

  async get(remotePath: string, localPath: string): Promise<void> {
    await this.client.get(remotePath, localPath)
  }

  async delete(remotePath: string): Promise<void> {
    await this.client.delete(remotePath)
  }

  async rmdir(remotePath: string, recursive = true): Promise<void> {
    await this.client.rmdir(remotePath, recursive)
  }

  async listAll(remotePath: string): Promise<RemoteFile[]> {
    const results: RemoteFile[] = []
    await this.walkRemote(remotePath, remotePath, results)
    return results
  }

  private async walkRemote(
    basePath: string,
    currentPath: string,
    results: RemoteFile[]
  ): Promise<void> {
    const list = await this.client.list(currentPath)
    for (const item of list) {
      const fullPath = `${currentPath}/${item.name}`
      if (item.type === 'd') {
        await this.walkRemote(basePath, fullPath, results)
      } else {
        results.push({
          relativePath: fullPath.slice(basePath.length + 1).replace(/\\/g, '/'),
          size: item.size,
          mtime: Math.floor((item.modifyTime ?? 0) / 1000)
        })
      }
    }
  }

  // Ping — connect and disconnect, measure RTT
  async ping(): Promise<number> {
    const start = Date.now()
    await this.client.list('.')
    return Date.now() - start
  }
}

// Connection pool keyed by serverId
const pool = new Map<string, SftpConnection>()

export const sftpService = {
  async getConnection(server: Server): Promise<SftpConnection> {
    let conn = pool.get(server.id)
    if (!conn || !conn.isConnected()) {
      conn = new SftpConnection()
      await conn.connect(server)
      pool.set(server.id, conn)
    }
    return conn
  },

  async disconnect(serverId: string): Promise<void> {
    const conn = pool.get(serverId)
    if (conn) {
      await conn.disconnect()
      pool.delete(serverId)
    }
  },

  async disconnectAll(): Promise<void> {
    for (const [id] of pool) {
      await this.disconnect(id)
    }
  },

  // Returns the underlying ssh2 Client for exec() calls (post-deploy commands)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRawClient(serverId: string): any | null {
    const conn = pool.get(serverId)
    if (!conn || !conn.isConnected()) return null
    // ssh2-sftp-client stores the underlying ssh2 Client as .client
    return (conn.client as unknown as { client: unknown }).client ?? null
  }
}

export { SftpConnection }
