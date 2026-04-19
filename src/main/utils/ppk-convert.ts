/**
 * Converts PuTTY PPK v2 private keys (unencrypted) to OpenSSH/PEM format.
 * - RSA  → PKCS#1 PEM (BEGIN RSA PRIVATE KEY) via Node.js crypto JWK import
 * - Ed25519 → OpenSSH private key format (BEGIN OPENSSH PRIVATE KEY)
 * - ECDSA (P-256/P-384/P-521) → PKCS#8 PEM via Node.js crypto JWK import
 */
import crypto from 'crypto'

export function isPPKFormat(content: string): boolean {
  return content.trimStart().startsWith('PuTTY-User-Key-File-')
}

export function convertPPKToOpenSSH(content: string): string {
  const lines = content.split(/\r?\n/)

  // ── Parse header fields and multi-line data sections ────────────────────
  const fields: Record<string, string> = {}
  const dataSections: Record<string, string> = {}
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const colon = line.indexOf(': ')
    if (colon === -1) { i++; continue }

    const key = line.substring(0, colon)
    const val = line.substring(colon + 2).trim()

    const linesKey = key.match(/^(.+)-Lines$/)
    if (linesKey) {
      const count = parseInt(val, 10)
      dataSections[linesKey[1]] = lines.slice(i + 1, i + 1 + count).join('')
      i += 1 + count
    } else {
      fields[key] = val
      i++
    }
  }

  // ── Detect version and key type ──────────────────────────────────────────
  const keyType = fields['PuTTY-User-Key-File-3'] ?? fields['PuTTY-User-Key-File-2'] ?? ''
  const encryption = fields['Encryption'] ?? 'none'

  if (encryption !== 'none') {
    throw new Error(
      'Verschlüsselte PPK-Schlüssel werden nicht unterstützt. ' +
      'In PuTTYgen Passphrase entfernen oder als OpenSSH-Schlüssel exportieren.'
    )
  }

  const publicData  = Buffer.from(dataSections['Public']  ?? '', 'base64')
  const privateData = Buffer.from(dataSections['Private'] ?? '', 'base64')

  if (keyType === 'ssh-rsa') {
    return convertRSA(publicData, privateData)
  }
  if (keyType === 'ssh-ed25519') {
    return convertEd25519(publicData, privateData)
  }
  if (keyType.startsWith('ecdsa-sha2-')) {
    return convertECDSA(keyType, publicData, privateData)
  }

  throw new Error(
    `PPK-Schlüsseltyp "${keyType}" wird nicht unterstützt. ` +
    'Als OpenSSH-Schlüssel exportieren: PuTTYgen → Conversions → Export OpenSSH key.'
  )
}

// ── SSH wire-format readers ───────────────────────────────────────────────

function readUint32(buf: Buffer, offset: number): { value: number; next: number } {
  return { value: buf.readUInt32BE(offset), next: offset + 4 }
}

function readBytes(buf: Buffer, offset: number): { value: Buffer; next: number } {
  const { value: len, next } = readUint32(buf, offset)
  return { value: buf.subarray(next, next + len), next: next + len }
}

function readMpint(buf: Buffer, offset: number): { value: bigint; next: number } {
  const { value: bytes, next } = readBytes(buf, offset)
  const hex = bytes.toString('hex')
  return { value: hex ? BigInt('0x' + hex) : 0n, next }
}

// ── bigint → base64url (for JWK, no leading zeros) ──────────────────────

function toB64u(n: bigint, minBytes = 0): string {
  let hex = n.toString(16)
  if (hex.length % 2) hex = '0' + hex
  // Pad to minBytes if needed (JWK requires fixed-size key fields)
  while (hex.length < minBytes * 2) hex = '00' + hex
  return Buffer.from(hex, 'hex').toString('base64url')
}

// ── RSA → PKCS#1 PEM via JWK ─────────────────────────────────────────────

function convertRSA(publicData: Buffer, privateData: Buffer): string {
  // Public blob: string(key-type) mpint(e) mpint(n)
  const { next: a1 } = readBytes(publicData, 0)           // skip key type
  const { value: e, next: a2 } = readMpint(publicData, a1)
  const { value: n } = readMpint(publicData, a2)

  // Private blob: mpint(d) mpint(p) mpint(q) mpint(iqmp)
  const { value: d,    next: b1 } = readMpint(privateData, 0)
  const { value: p,    next: b2 } = readMpint(privateData, b1)
  const { value: q,    next: b3 } = readMpint(privateData, b2)
  const { value: iqmp }           = readMpint(privateData, b3)

  const dp = d % (p - 1n)
  const dq = d % (q - 1n)

  // Import via JWK — Node.js handles all DER encoding and validates consistency
  const jwk: crypto.JsonWebKey = {
    kty: 'RSA',
    n:  toB64u(n),
    e:  toB64u(e),
    d:  toB64u(d),
    p:  toB64u(p),
    q:  toB64u(q),
    dp: toB64u(dp),
    dq: toB64u(dq),
    qi: toB64u(iqmp)
  }

  const keyObj = crypto.createPrivateKey({ key: jwk, format: 'jwk' })
  return keyObj.export({ type: 'pkcs1', format: 'pem' }) as string
}

// ── Ed25519 → OpenSSH private key format (guaranteed ssh2-compatible) ─────

function convertEd25519(publicData: Buffer, privateData: Buffer): string {
  // Public blob: string(key-type) string(pubkey 32 bytes)
  const { next: a1 } = readBytes(publicData, 0)  // skip key type
  const { value: pubKey } = readBytes(publicData, a1)

  // Private blob: 32-byte private seed
  const privKey = privateData.subarray(0, 32)

  const wstr = (b: string | Buffer): Buffer => {
    const data = typeof b === 'string' ? Buffer.from(b) : b
    const len  = Buffer.allocUnsafe(4)
    len.writeUInt32BE(data.length)
    return Buffer.concat([len, data])
  }

  const pubBlob = Buffer.concat([wstr('ssh-ed25519'), wstr(pubKey)])

  const ci = Buffer.allocUnsafe(4)
  ci.writeUInt32BE(Math.floor(Math.random() * 0xffffffff))

  // Private section: checkint×2, key-type, pubkey, seed+pubkey (64 B), comment
  let privSection = Buffer.concat([
    ci, ci,
    wstr('ssh-ed25519'),
    wstr(pubKey),
    wstr(Buffer.concat([privKey, pubKey])),
    wstr('')
  ])
  // Pad to 8-byte boundary
  const pad: number[] = []
  for (let n = 1; privSection.length % 8 !== 0; n++) pad.push(n & 0xff)
  privSection = Buffer.concat([privSection, Buffer.from(pad)])

  const payload = Buffer.concat([
    Buffer.from('openssh-key-v1\x00'),
    wstr('none'), wstr('none'), wstr(''),  // cipher, kdf, kdf-options
    Buffer.from([0, 0, 0, 1]),             // num-keys = 1
    wstr(pubBlob),
    wstr(privSection)
  ])

  const b64 = payload.toString('base64').match(/.{1,70}/g)!.join('\n')
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${b64}\n-----END OPENSSH PRIVATE KEY-----`
}

// ── ECDSA (P-256 / P-384 / P-521) → PKCS#8 PEM via JWK ──────────────────

function convertECDSA(keyType: string, publicData: Buffer, privateData: Buffer): string {
  // Map PuTTY key type to JWK curve name
  const curveMap: Record<string, { crv: string; keyLen: number }> = {
    'ecdsa-sha2-nistp256': { crv: 'P-256', keyLen: 32 },
    'ecdsa-sha2-nistp384': { crv: 'P-384', keyLen: 48 },
    'ecdsa-sha2-nistp521': { crv: 'P-521', keyLen: 66 }
  }
  const curve = curveMap[keyType]
  if (!curve) throw new Error(`Unbekannte ECDSA-Kurve: ${keyType}`)

  // Public blob: string(key-type) string(curve-name) string(uncompressed-point 04||x||y)
  const { next: a1 } = readBytes(publicData, 0)  // skip key type
  const { next: a2 } = readBytes(publicData, a1)  // skip curve name
  const { value: point } = readBytes(publicData, a2)

  const x = point.subarray(1, 1 + curve.keyLen)
  const y = point.subarray(1 + curve.keyLen)

  // Private blob: mpint(d)
  const { value: d } = readMpint(privateData, 0)

  const jwk: crypto.JsonWebKey = {
    kty: 'EC',
    crv: curve.crv,
    x: x.toString('base64url'),
    y: y.toString('base64url'),
    d: toB64u(d, curve.keyLen)
  }

  const keyObj = crypto.createPrivateKey({ key: jwk, format: 'jwk' })
  return keyObj.export({ type: 'pkcs8', format: 'pem' }) as string
}
