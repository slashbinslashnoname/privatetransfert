const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / 1024 ** exp
  return `${value >= 100 || exp === 0 ? Math.round(value) : value.toFixed(1)} ${UNITS[exp]}`
}

export function formatSpeed(bytesPerSec: number): string {
  return bytesPerSec > 0 ? `${formatBytes(bytesPerSec)}/s` : '0 KB/s'
}

export function formatEta(bytesLeft: number, bytesPerSec: number): string {
  if (bytesPerSec <= 0 || bytesLeft <= 0) return '—'
  const seconds = bytesLeft / bytesPerSec
  if (seconds < 60) return `${Math.ceil(seconds)}s left`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m left`
  return `${Math.ceil(seconds / 3600)}h left`
}

export function shortId(id: string, len = 8): string {
  return id.slice(0, len)
}
