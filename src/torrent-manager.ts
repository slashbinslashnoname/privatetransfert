import WebTorrent from 'webtorrent'
import type { Instance, Torrent } from 'webtorrent'
import type { ShareKey } from './crypto'

export type Direction = 'seed' | 'download'

export interface Transfer {
  id: string
  direction: Direction
  torrent: Torrent
  /** Present when this transfer is an encrypted share; the key/IV never leave the browser except via the URL fragment. */
  crypto?: ShareKey
  /** Real filename(s), known only where they were picked (seeder) or recovered after decrypt (downloader). */
  displayName?: string
}

type Listener = () => void
type DiagnosticListener = (message: string) => void

/**
 * Public WebSocket trackers used for peer discovery. Browsers can only speak
 * to trackers over WebSocket (no UDP/raw TCP), so this list *is* the "websocket"
 * signaling layer WebRTC peers use to find each other and exchange offers/answers.
 */
export const WS_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.webtorrent.dev',
]

export const webrtcSupported = WebTorrent.WEBRTC_SUPPORT

class TorrentManager {
  readonly client: Instance = new WebTorrent()
  readonly transfers = new Map<string, Transfer>()

  private listeners = new Set<Listener>()
  private diagnosticListeners = new Set<DiagnosticListener>()
  private emitScheduled = false

  constructor() {
    this.client.on('error', (err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[webtorrent]', err)
      this.emitDiagnostic(`Client error: ${message}`)
      this.scheduleEmit()
    })
    this.client.on('warning', (err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[webtorrent]', message)
      this.emitDiagnostic(message)
    })
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Surfaces tracker/WebRTC warnings and errors that would otherwise only land in devtools. */
  onDiagnostic(fn: DiagnosticListener): () => void {
    this.diagnosticListeners.add(fn)
    return () => this.diagnosticListeners.delete(fn)
  }

  private emitDiagnostic(message: string) {
    for (const fn of this.diagnosticListeners) fn(message)
  }

  private scheduleEmit() {
    if (this.emitScheduled) return
    this.emitScheduled = true
    // Coalesce bursts of per-chunk download/upload events into one UI update.
    setTimeout(() => {
      this.emitScheduled = false
      for (const fn of this.listeners) fn()
    }, 150)
  }

  seed(files: File[], crypto?: ShareKey, displayName?: string): Promise<Transfer> {
    return new Promise((resolve) => {
      this.client.seed(files, { announce: WS_TRACKERS }, (torrent) => {
        const transfer: Transfer = { id: torrent.infoHash, direction: 'seed', torrent, crypto, displayName }
        this.transfers.set(transfer.id, transfer)
        this.wire(torrent)
        resolve(transfer)
      })
    })
  }

  async download(torrentId: string, crypto?: ShareKey): Promise<Transfer | undefined> {
    const existing = await this.client.get(torrentId)
    if (existing) return this.transfers.get(existing.infoHash)

    let torrent: Torrent
    try {
      torrent = this.client.add(torrentId, { announce: WS_TRACKERS }, () => this.scheduleEmit())
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[webtorrent] invalid torrent id', err)
      this.emitDiagnostic(`Couldn't join transfer: ${message}`)
      return undefined
    }
    const transfer: Transfer = { id: torrent.infoHash, direction: 'download', torrent, crypto }
    this.transfers.set(transfer.id, transfer)
    this.wire(torrent)
    return transfer
  }

  private wire(torrent: Torrent) {
    const events = ['download', 'upload', 'done', 'ready'] as const
    for (const evt of events) torrent.on(evt, () => this.scheduleEmit())
    torrent.on('wire', (wire) => {
      const kind = wire && typeof wire === 'object' && 'type' in wire ? String((wire as { type?: unknown }).type) : 'unknown'
      const message = `Peer connected (${kind} wire) — ${torrent.numPeers} peer(s) on "${torrent.name || torrent.infoHash}"`
      console.info('[torrent]', message)
      this.emitDiagnostic(message)
      this.scheduleEmit()
    })
    torrent.on('noPeers', (source) => {
      const message = `No peers found yet via ${source} for "${torrent.name || torrent.infoHash}"`
      console.info('[torrent]', message)
      this.emitDiagnostic(message)
      this.scheduleEmit()
    })
    torrent.on('error', (err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[torrent]', torrent.infoHash, err)
      this.emitDiagnostic(`Torrent error: ${message}`)
      this.scheduleEmit()
    })
    torrent.on('warning', (err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[torrent]', torrent.infoHash, message)
      this.emitDiagnostic(message)
    })
    this.scheduleEmit()
  }

  pause(id: string) {
    this.transfers.get(id)?.torrent.pause()
    this.scheduleEmit()
  }

  resume(id: string) {
    this.transfers.get(id)?.torrent.resume()
    this.scheduleEmit()
  }

  remove(id: string) {
    const transfer = this.transfers.get(id)
    if (!transfer) return
    this.transfers.delete(id)
    transfer.torrent.destroy({ destroyStore: false }, () => this.scheduleEmit())
    this.scheduleEmit()
  }

  hasActiveTransfer(): boolean {
    for (const { torrent } of this.transfers.values()) {
      if (!torrent.paused) return true
    }
    return false
  }
}

export const torrentManager = new TorrentManager()
