let sentinel: WakeLockSentinel | null = null
let wanted = false

export const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator

async function acquire() {
  if (!wakeLockSupported || sentinel) return
  try {
    sentinel = await navigator.wakeLock.request('screen')
    sentinel.addEventListener('release', () => {
      sentinel = null
    })
  } catch {
    sentinel = null
  }
}

async function release() {
  const s = sentinel
  sentinel = null
  try {
    await s?.release()
  } catch {
    // ignore
  }
}

/** Call with true while at least one transfer should keep the screen awake. */
export function setWakeLockWanted(value: boolean) {
  wanted = value
  if (value) void acquire()
  else void release()
}

export function isWakeLockActive() {
  return sentinel !== null
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wanted) void acquire()
  })
}
