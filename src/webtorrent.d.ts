declare module 'webtorrent' {
  export interface TorrentFile {
    name: string
    path: string
    length: number
    blob(): Promise<Blob>
    stream(): ReadableStream<Uint8Array>
  }

  export interface Wire {
    peerId: string
    type?: string
    /** True once this peer's reported bitfield shows they have every piece (they've finished downloading). */
    isSeeder?: boolean
    uploadSpeed(): number
    downloadSpeed(): number
  }

  export interface Torrent {
    infoHash: string
    magnetURI: string
    name: string
    length: number
    progress: number
    downloadSpeed: number
    uploadSpeed: number
    numPeers: number
    wires: Wire[]
    files: TorrentFile[]
    done: boolean
    paused: boolean
    ready: boolean
    pause(): void
    resume(): void
    destroy(opts?: { destroyStore?: boolean }, cb?: (err: Error | null) => void): void
    on(event: 'download' | 'upload' | 'wire' | 'done' | 'noPeers' | 'ready', cb: (...args: any[]) => void): void
    on(event: 'error' | 'warning', cb: (err: Error | string) => void): void
  }

  export interface Instance {
    torrents: Torrent[]
    seed(
      input: File | File[] | FileList,
      opts?: Record<string, unknown>,
      cb?: (torrent: Torrent) => void,
    ): Torrent
    add(
      torrentId: string,
      opts?: Record<string, unknown>,
      cb?: (torrent: Torrent) => void,
    ): Torrent
    get(torrentId: string): Promise<Torrent | null>
    remove(torrentId: string, opts?: { destroyStore?: boolean }, cb?: (err: Error | null) => void): void
    destroy(cb?: (err: Error | null) => void): void
    on(event: 'error' | 'warning', cb: (err: Error | string) => void): void
  }

  interface WebTorrentConstructor {
    new (opts?: Record<string, unknown>): Instance
    WEBRTC_SUPPORT: boolean
  }

  const WebTorrent: WebTorrentConstructor
  export default WebTorrent
}
