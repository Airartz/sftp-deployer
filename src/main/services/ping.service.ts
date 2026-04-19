import net from 'net'

export function pingHost(host: string, port: number, timeoutMs = 3000): Promise<{ ok: boolean; ms: number }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const socket = new net.Socket()
    let done = false

    const finish = (ok: boolean) => {
      if (done) return
      done = true
      socket.destroy()
      resolve({ ok, ms: Date.now() - start })
    }

    socket.setTimeout(timeoutMs)
    socket.connect(port, host, () => finish(true))
    socket.on('error', () => finish(false))
    socket.on('timeout', () => finish(false))
  })
}
