import { ipcMain } from 'electron'
import { Client } from 'ssh2'
import { serverRepo } from '../db/repositories/server.repo'
import { cryptoService } from '../services/crypto.service'
import { isPPKFormat, convertPPKToOpenSSH } from '../utils/ppk-convert'
import type { IpcResponse, ServerInfo } from '../../../shared/types'

const INFO_CMD = [
  'echo "OS:$(cat /etc/os-release 2>/dev/null | grep ^PRETTY_NAME | cut -d= -f2 | tr -d \'"\' || uname -s)"',
  'echo "HOSTNAME:$(hostname)"',
  'echo "KERNEL:$(uname -r)"',
  'echo "ARCH:$(uname -m)"',
  'echo "UPTIME:$(uptime | sed \'s/.*up //;s/,  .*//;s/, [0-9]* user.*//' + '\')"',
  'echo "CPU:$(grep \'model name\' /proc/cpuinfo 2>/dev/null | head -1 | sed \'s/.*: //\' || sysctl -n machdep.cpu.brand_string 2>/dev/null || echo \'Unknown\')"',
  'echo "CORES:$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo \'?\')"',
  'echo "MEM_TOTAL:$(free -b 2>/dev/null | grep \'^Mem\' | awk \'{print $2}\' || sysctl -n hw.memsize 2>/dev/null || echo \'?\')"',
  'echo "MEM_USED:$(free -b 2>/dev/null | grep \'^Mem\' | awk \'{print $3}\' || echo \'?\')"',
  'echo "MEM_AVAIL:$(free -b 2>/dev/null | grep \'^Mem\' | awk \'{print $7}\' || echo \'?\')"',
  'echo "DISK_TOTAL:$(df -k / 2>/dev/null | tail -1 | awk \'{print $2}\' || echo \'?\')"',
  'echo "DISK_USED:$(df -k / 2>/dev/null | tail -1 | awk \'{print $3}\' || echo \'?\')"',
  'echo "DISK_PCT:$(df -h / 2>/dev/null | tail -1 | awk \'{print $5}\' || echo \'?\')"',
  'echo "USER:$(whoami)"',
  'echo "SHELL:$(basename $SHELL 2>/dev/null || echo \'?\')"',
  'echo "LOAD:$(cat /proc/loadavg 2>/dev/null | awk \'{print $1, $2, $3}\' || sysctl -n vm.loadavg 2>/dev/null | tr -d \'{}\' || echo \'?\')"',
].join(' && ')

function fmtBytes(n: number): string {
  if (!n || isNaN(n)) return '?'
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB'
  if (n >= 1048576)    return (n / 1048576).toFixed(1) + ' MB'
  return (n / 1024).toFixed(0) + ' KB'
}

function parseInfo(raw: string): ServerInfo {
  const map: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    map[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  const memTotal = parseInt(map['MEM_TOTAL'] ?? '0')
  const memUsed  = parseInt(map['MEM_USED']  ?? '0')
  const memAvail = parseInt(map['MEM_AVAIL'] ?? '0')
  const diskTotalKb = parseInt(map['DISK_TOTAL'] ?? '0')
  const diskUsedKb  = parseInt(map['DISK_USED']  ?? '0')
  return {
    os:         map['OS']       ?? 'Unknown',
    hostname:   map['HOSTNAME'] ?? '?',
    kernel:     map['KERNEL']   ?? '?',
    arch:       map['ARCH']     ?? '?',
    uptime:     map['UPTIME']   ?? '?',
    cpu:        map['CPU']      ?? 'Unknown',
    cpuCores:   parseInt(map['CORES'] ?? '0') || null,
    memTotal:   fmtBytes(memTotal),
    memUsed:    fmtBytes(memUsed),
    memFree:    fmtBytes(memAvail),
    memPercent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : null,
    diskTotal:  fmtBytes(diskTotalKb * 1024),
    diskUsed:   fmtBytes(diskUsedKb * 1024),
    diskPercent: map['DISK_PCT'] ?? '?',
    user:       map['USER']  ?? '?',
    shell:      map['SHELL'] ?? '?',
    load:       map['LOAD']  ?? '?',
  }
}

function sshExec(serverId: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = serverRepo.findById(serverId)
    if (!server) { reject(new Error('Server nicht gefunden')); return }

    const opts: Record<string, unknown> = {
      host: server.host,
      port: server.port,
      username: server.username,
      readyTimeout: 10000,
    }
    if (server.authType === 'password' && server.encryptedPassword) {
      opts.password = cryptoService.decrypt(server.encryptedPassword)
    } else if (server.authType === 'key' && server.encryptedPrivateKey) {
      const raw = cryptoService.decrypt(server.encryptedPrivateKey)
      opts.privateKey = isPPKFormat(raw) ? convertPPKToOpenSSH(raw) : raw
      if (server.encryptedPassphrase) opts.passphrase = cryptoService.decrypt(server.encryptedPassphrase)
    }

    const client = new Client()
    let stdout = ''
    let stderr = ''
    client
      .on('ready', () => {
        client.exec(command, (err, stream) => {
          if (err) { client.end(); reject(err); return }
          stream.on('data', (d: Buffer) => { stdout += d.toString() })
          stream.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
          stream.on('close', (code: number) => {
            client.end()
            if (code !== 0 && !stdout.trim()) {
              reject(new Error(`Befehl fehlgeschlagen (exit ${code})${stderr ? ': ' + stderr.trim() : ''}`))
            } else {
              resolve(stdout)
            }
          })
        })
      })
      .on('error', reject)
      .connect(opts as Parameters<Client['connect']>[0])
  })
}

export function registerServerInfoHandlers(): void {
  ipcMain.handle('servers:info', async (_, serverId: string): Promise<IpcResponse<ServerInfo>> => {
    try {
      const raw = await sshExec(serverId, INFO_CMD)
      return { ok: true, data: parseInfo(raw) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
