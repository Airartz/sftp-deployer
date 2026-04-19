import crypto from 'crypto'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const SALT_FILE = 'enc.salt'

class CryptoService {
  private key: Buffer | null = null

  private getSaltPath(): string {
    return path.join(app.getPath('userData'), SALT_FILE)
  }

  private getOrCreateSalt(): Buffer {
    const saltPath = this.getSaltPath()
    if (fs.existsSync(saltPath)) {
      return fs.readFileSync(saltPath)
    }
    const salt = crypto.randomBytes(32)
    fs.writeFileSync(saltPath, salt)
    return salt
  }

  init(): void {
    const salt = this.getOrCreateSalt()
    // Derive key from machine-specific secret + salt
    // Using app path as machine-unique material
    const secret = app.getPath('userData')
    this.key = crypto.scryptSync(secret, salt, KEY_LENGTH)
  }

  encrypt(plaintext: string): string {
    if (!this.key) throw new Error('CryptoService not initialized')
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv)
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ])
    const authTag = cipher.getAuthTag()
    // Format: iv(12) + authTag(16) + ciphertext — all base64
    return Buffer.concat([iv, authTag, encrypted]).toString('base64')
  }

  decrypt(ciphertext: string): string {
    if (!this.key) throw new Error('CryptoService not initialized')
    const buf = Buffer.from(ciphertext, 'base64')
    const iv = buf.subarray(0, 12)
    const authTag = buf.subarray(12, 28)
    const encrypted = buf.subarray(28)
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv)
    decipher.setAuthTag(authTag)
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
  }
}

export const cryptoService = new CryptoService()
