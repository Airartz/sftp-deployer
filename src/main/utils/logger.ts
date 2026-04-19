export function log(level: 'info' | 'warn' | 'error', ...args: unknown[]): void {
  const ts = new Date().toISOString().slice(11, 23)
  console[level](`[${ts}]`, ...args)
}
