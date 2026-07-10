import type { Transfer } from './torrent-manager'

const BASE_TITLE = document.title

/** Reflects download progress/completion in the tab title so it's visible from another tab. */
export function updateTitle(transfers: Iterable<Transfer>) {
  const downloads = [...transfers].filter((t) => t.direction === 'download')
  const active = downloads.filter((t) => !t.torrent.done)
  const completed = downloads.filter((t) => t.torrent.done)

  if (active.length === 1) {
    const pct = Math.round((active[0]!.torrent.progress || 0) * 100)
    document.title = `${pct}% · ${BASE_TITLE}`
  } else if (active.length > 1) {
    document.title = `Downloading ${active.length} files · ${BASE_TITLE}`
  } else if (completed.length > 0) {
    document.title = `✓ Download complete · ${BASE_TITLE}`
  } else {
    document.title = BASE_TITLE
  }
}
