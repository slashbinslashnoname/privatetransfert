import './style.css'
import type { Torrent } from 'webtorrent'
import { downloadZip } from 'client-zip'
import { unzip } from 'fflate'
import { initTheme, toggleTheme, currentTheme } from './theme'
import { setWakeLockWanted, isWakeLockActive, wakeLockSupported } from './wakelock'
import { torrentManager, webrtcSupported, type Transfer, type Direction } from './torrent-manager'
import { TransferRing } from './ring'
import { formatBytes, formatSpeed } from './format'
import { collectFiles, normalize, pathOf } from './files'
import { updateTitle } from './title'
import { generateShareKey, importShareKey, exportShareKey, encryptBlob, decryptBlob, randomFileName, type ShareKey } from './crypto'

const ICON_SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>`
const ICON_MOON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>`
const ICON_EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`
const ICON_LINK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l6-6M10 7l1-1a3.5 3.5 0 0 1 5 5l-1 1M14 17l-1 1a3.5 3.5 0 0 1-5-5l1-1"/></svg>`
const ICON_PAUSE = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`
const ICON_PLAY = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>`
const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`
const ICON_UPLOAD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0L7 9m5-5l5 5"/><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>`
const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12m0 0l-5-5m5 5l5-5"/><path d="M4 18v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>`
const ICON_LOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`

initTheme()

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <header class="app-header">
    <div class="brand">
      <div class="brand-mark"></div>
      <h1>Private Transfert</h1>
    </div>
    <div class="header-actions">
      <button class="icon-btn" id="wake-btn" type="button" title="Idle">${ICON_EYE}</button>
      <button class="icon-btn" id="theme-btn" type="button" title="Toggle theme"></button>
    </div>
  </header>

  <p class="banner" id="webrtc-banner" hidden>
    This browser doesn't support WebRTC, so peer-to-peer transfers can't connect here.
  </p>

  <section class="card drop-card" id="dropzone" tabindex="0" role="button" aria-label="Add a file or folder to share">
    <div class="drop-icon">${ICON_UPLOAD}</div>
    <p class="drop-title">Add a file or folder</p>
    <p class="drop-sub">
      Drop it here, or <button type="button" class="link-btn" id="choose-file-btn">choose a file</button>
      / <button type="button" class="link-btn" id="choose-folder-btn">a folder</button>
    </p>
    <label class="encrypt-toggle">
      <input type="checkbox" id="encrypt-toggle" />
      <span>${ICON_LOCK} Encrypt this share</span>
    </label>
  </section>
  <input type="file" id="file-input" multiple hidden />
  <input type="file" id="folder-input" webkitdirectory multiple hidden />

  <div class="transfer-list" id="transfer-list"></div>
`

// ---------- theme ----------
const themeBtn = document.querySelector<HTMLButtonElement>('#theme-btn')!
function syncTheme() {
  themeBtn.innerHTML = currentTheme() === 'dark' ? ICON_MOON : ICON_SUN
}
themeBtn.addEventListener('click', () => {
  toggleTheme()
  syncTheme()
})
syncTheme()

// ---------- webrtc support banner ----------
if (!webrtcSupported) {
  document.querySelector<HTMLElement>('#webrtc-banner')!.hidden = false
}

// ---------- toast ----------
function showToast(message: string) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = message
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3200)
}

// ---------- diagnostics ----------
torrentManager.onDiagnostic((message) => {
  if (message.startsWith('No peers found yet')) return // expected while a swarm is still forming; avoid spam
  showToast(message)
})

// ---------- share link helpers ----------
async function shareLinkFor(transfer: Transfer): Promise<string> {
  const params = new URLSearchParams({ m: transfer.torrent.magnetURI })
  if (transfer.crypto) {
    const { k, iv } = await exportShareKey(transfer.crypto)
    params.set('k', k)
    params.set('iv', iv)
  }
  return `${location.origin}${location.pathname}#${params.toString()}`
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast('Link copied')
  } catch {
    showToast('Copy failed — select and copy manually')
  }
}

// ---------- dropzone / file selection ----------
const dropzoneEl = document.querySelector<HTMLElement>('#dropzone')!
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!
const folderInput = document.querySelector<HTMLInputElement>('#folder-input')!

const encryptToggle = document.querySelector<HTMLInputElement>('#encrypt-toggle')!

dropzoneEl.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('.link-btn, .encrypt-toggle')) return
  fileInput.click()
})
dropzoneEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fileInput.click()
  }
})
document.querySelector('#choose-file-btn')!.addEventListener('click', (e) => {
  e.stopPropagation()
  fileInput.click()
})
document.querySelector('#choose-folder-btn')!.addEventListener('click', (e) => {
  e.stopPropagation()
  folderInput.click()
})
;['dragenter', 'dragover'].forEach((evt) =>
  dropzoneEl.addEventListener(evt, (e) => {
    e.preventDefault()
    dropzoneEl.classList.add('drag-over')
  }),
)
;['dragleave', 'drop'].forEach((evt) =>
  dropzoneEl.addEventListener(evt, (e) => {
    e.preventDefault()
    dropzoneEl.classList.remove('drag-over')
  }),
)
dropzoneEl.addEventListener('drop', (e) => {
  if (!e.dataTransfer) return
  void collectFiles(e.dataTransfer).then((files) => {
    if (files.length) void handleFiles(files)
  })
})
fileInput.addEventListener('change', () => {
  if (fileInput.files?.length) void handleFiles(normalize(Array.from(fileInput.files)))
  fileInput.value = ''
})
folderInput.addEventListener('change', () => {
  if (folderInput.files?.length) void handleFiles(normalize(Array.from(folderInput.files)))
  folderInput.value = ''
})

async function handleFiles(files: File[]) {
  const label = `${files[0]!.name}${files.length > 1 ? ` +${files.length - 1} more` : ''}`

  if (encryptToggle.checked) {
    showToast(`Encrypting “${label}”…`)
    try {
      const archive = await downloadZip(files.map((file) => ({ input: file, name: pathOf(file) }))).blob()
      const shareKey = await generateShareKey()
      const encrypted = await encryptBlob(archive, shareKey)
      const container = new File([encrypted], randomFileName(), { type: 'application/octet-stream' })
      await torrentManager.seed([container], shareKey, label)
      render()
    } catch (err) {
      console.error('[encrypt]', err)
      showToast('Could not encrypt this share')
    }
    return
  }

  showToast(`Preparing “${label}”…`)
  await torrentManager.seed(files)
  render()
}

// ---------- auto-join from URL hash ----------
async function joinFromHash(hash: string) {
  const params = new URLSearchParams(hash)
  const magnet = params.get('m')
  if (!magnet || !/^magnet:/i.test(magnet)) return

  let shareKey: ShareKey | undefined
  const k = params.get('k')
  const iv = params.get('iv')
  if (k && iv) {
    try {
      shareKey = await importShareKey(k, iv)
    } catch (err) {
      console.error('[crypto] failed to import share key', err)
      showToast('This share link’s key looks invalid')
      return
    }
  }

  showToast('Joining shared transfer…')
  const transfer = await torrentManager.download(magnet, shareKey)
  if (!transfer) {
    showToast('Couldn’t join that transfer — the link may be malformed')
    return
  }
  render()
}

if (location.hash.length > 1) void joinFromHash(location.hash.slice(1))

// ---------- transfer cards ----------
interface CardController {
  root: HTMLElement
  ring: TransferRing
  filesRendered: boolean
  update(transfer: Transfer): void
  destroy(): void
}

const cardId = (id: string) => `transfer-${id}`
const cards = new Map<string, CardController>()
const transferList = document.querySelector<HTMLDivElement>('#transfer-list')!

function directionBadge(direction: Direction): { label: string; className: string } {
  return direction === 'seed'
    ? { label: 'Sharing', className: 'seed' }
    : { label: 'Downloading', className: 'download' }
}

function displayTitle(transfer: Transfer): string {
  if (transfer.crypto) return transfer.displayName || 'Encrypted share'
  return transfer.torrent.name || 'Fetching metadata…'
}

function badgeHtml(transfer: Transfer, label: string): string {
  return transfer.crypto ? `${ICON_LOCK}${label}` : label
}

function statsHtml(transfer: Transfer): string {
  const torrent = transfer.torrent
  if (torrent.numPeers === 0) {
    if (transfer.direction === 'seed') return '<span>Ready to share</span>'
    if (!torrent.done) return '<span>Waiting for peers…</span>'
  }
  if (transfer.direction === 'seed' && torrent.numPeers > 0 && torrent.wires.every((w) => w.isSeeder)) {
    return '<span>✓ All peers have the full file</span>'
  }
  const speed = transfer.direction === 'seed' ? torrent.uploadSpeed : torrent.downloadSpeed
  const stats = [`<b>${torrent.numPeers}</b> peer${torrent.numPeers === 1 ? '' : 's'}`, `<b>${formatSpeed(speed)}</b>`]
  return stats.map((s) => `<span>${s}</span>`).join('')
}

function createCard(transfer: Transfer): CardController {
  const root = document.createElement('article')
  root.className = 'card transfer-card'
  root.id = cardId(transfer.id)
  const badge = directionBadge(transfer.direction)

  root.innerHTML = `
    <button class="icon-btn remove-btn" data-action="remove" type="button" title="Remove">${ICON_CLOSE}</button>
    <p class="t-name">${displayTitle(transfer)}</p>
    <p class="t-meta"><span class="badge ${badge.className}">${badgeHtml(transfer, badge.label)}</span><span class="t-size"></span></p>
    <div class="ring"></div>
    <div class="t-footer">
      <div class="t-stats"></div>
      <div class="t-actions">
        <button class="icon-btn" data-action="copy" type="button" title="Copy share link">${ICON_LINK}</button>
        <button class="icon-btn" data-action="pause-resume" type="button" title="Pause">${ICON_PAUSE}</button>
      </div>
    </div>
    <div class="save-files"></div>
  `

  const ring = new TransferRing(root.querySelector<HTMLElement>('.ring')!, transfer.torrent, transfer.direction)

  root.querySelector('[data-action="copy"]')!.addEventListener('click', () => {
    if (!transfer.torrent.magnetURI) return
    void shareLinkFor(transfer).then((link) => copyText(link))
  })
  root.querySelector('[data-action="pause-resume"]')!.addEventListener('click', () => {
    transfer.torrent.paused ? torrentManager.resume(transfer.id) : torrentManager.pause(transfer.id)
    render()
  })
  root.querySelector('[data-action="remove"]')!.addEventListener('click', () => {
    torrentManager.remove(transfer.id)
    render()
  })

  return {
    root,
    ring,
    filesRendered: false,
    update(t: Transfer) {
      updateCard(root, t, ring, this)
    },
    destroy() {
      root.remove()
    },
  }
}

function updateCard(root: HTMLElement, transfer: Transfer, ring: TransferRing, controller: CardController) {
  const torrent: Torrent = transfer.torrent
  const badge = directionBadge(transfer.direction)
  const isDownloadComplete = transfer.direction === 'download' && torrent.done

  root.querySelector('.t-name')!.textContent = displayTitle(transfer)
  const badgeEl = root.querySelector('.badge')!
  badgeEl.innerHTML = badgeHtml(transfer, isDownloadComplete ? 'Complete' : badge.label)
  badgeEl.className = `badge ${isDownloadComplete ? 'complete' : badge.className}`
  root.querySelector('.t-size')!.textContent = formatBytes(torrent.length || 0)

  ring.update()

  root.querySelector('.t-stats')!.innerHTML = statsHtml(transfer)

  const pauseBtn = root.querySelector<HTMLButtonElement>('[data-action="pause-resume"]')!
  pauseBtn.innerHTML = torrent.paused ? ICON_PLAY : ICON_PAUSE
  pauseBtn.title = torrent.paused ? 'Resume' : 'Pause'

  if (transfer.direction === 'download' && torrent.done && !controller.filesRendered) {
    controller.filesRendered = true
    const container = root.querySelector<HTMLDivElement>('.save-files')!
    if (transfer.crypto) {
      void renderEncryptedFiles(container, transfer, transfer.crypto, root)
    } else {
      renderCompletedFiles(container, transfer)
    }
  }
}

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(data, (err, entries) => (err ? reject(err) : resolve(entries)))
  })
}

async function renderEncryptedFiles(container: HTMLElement, transfer: Transfer, shareKey: ShareKey, cardRoot: HTMLElement) {
  container.innerHTML = `<p class="decrypt-status">Decrypting…</p>`
  try {
    const encryptedFile = transfer.torrent.files[0]
    if (!encryptedFile) throw new Error('no encrypted payload in this torrent')
    const encryptedBlob = await encryptedFile.blob()
    const archiveBlob = await decryptBlob(encryptedBlob, shareKey)
    const entries = await unzipAsync(new Uint8Array(await archiveBlob.arrayBuffer()))
    const names = Object.keys(entries)

    transfer.displayName = names.length === 1 ? names[0] : `${names.length} files`
    cardRoot.querySelector('.t-name')!.textContent = displayTitle(transfer)

    container.innerHTML = ''

    if (names.length <= 1) {
      const name = names[0] ?? 'file'
      const data = entries[name]
      if (!data) return
      const a = document.createElement('a')
      a.className = 'save-btn'
      a.href = URL.createObjectURL(new Blob([new Uint8Array(data)]))
      a.download = name
      a.textContent = `Save “${name}”`
      container.appendChild(a)
      return
    }

    container.innerHTML = `
      <div class="save-row">
        <button class="save-btn" type="button" data-action="download-all">Download All (${names.length} files)</button>
        <button class="link-btn" type="button" data-action="toggle-files">See files</button>
      </div>
      <ul class="file-list" hidden></ul>
    `

    const list = container.querySelector<HTMLUListElement>('.file-list')!
    list.innerHTML = names
      .map(
        (name, i) => `
          <li>
            <span class="file-name" title="${name}">${name}</span>
            <span class="file-size">${formatBytes(entries[name]?.length ?? 0)}</span>
            <button class="icon-btn small" type="button" data-file-index="${i}" title="Save this file">${ICON_DOWNLOAD}</button>
          </li>`,
      )
      .join('')

    list.querySelectorAll<HTMLButtonElement>('[data-file-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = names[Number(btn.dataset.fileIndex)]
        const data = name ? entries[name] : undefined
        if (name && data) saveBlob(new Blob([new Uint8Array(data)]), name)
      })
    })

    const toggleBtn = container.querySelector<HTMLButtonElement>('[data-action="toggle-files"]')!
    toggleBtn.addEventListener('click', () => {
      list.hidden = !list.hidden
      toggleBtn.textContent = list.hidden ? 'See files' : 'Hide files'
    })

    container.querySelector('[data-action="download-all"]')!.addEventListener('click', () => {
      saveBlob(archiveBlob, `${transfer.displayName || 'download'}.zip`)
    })
  } catch (err) {
    console.error('[decrypt]', err)
    container.innerHTML = `<p class="decrypt-status">Couldn’t decrypt this transfer — the key may be wrong.</p>`
  }
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function renderCompletedFiles(container: HTMLElement, transfer: Transfer) {
  const files = transfer.torrent.files

  if (files.length <= 1) {
    const file = files[0]
    if (!file) return
    file
      .blob()
      .then((blob) => {
        const a = document.createElement('a')
        a.className = 'save-btn'
        a.href = URL.createObjectURL(blob)
        a.download = file.name
        a.textContent = `Save “${file.name}”`
        container.appendChild(a)
      })
      .catch((err) => console.error('[file]', file.name, err))
    return
  }

  container.innerHTML = `
    <div class="save-row">
      <button class="save-btn" type="button" data-action="download-all">Download All (${files.length} files)</button>
      <button class="link-btn" type="button" data-action="toggle-files">See files</button>
    </div>
    <ul class="file-list" hidden></ul>
  `

  const list = container.querySelector<HTMLUListElement>('.file-list')!
  list.innerHTML = files
    .map(
      (file, i) => `
        <li>
          <span class="file-name" title="${file.path}">${file.path}</span>
          <span class="file-size">${formatBytes(file.length)}</span>
          <button class="icon-btn small" type="button" data-file-index="${i}" title="Save this file">${ICON_DOWNLOAD}</button>
        </li>`,
    )
    .join('')

  list.querySelectorAll<HTMLButtonElement>('[data-file-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const file = files[Number(btn.dataset.fileIndex)]
      if (!file) return
      btn.disabled = true
      file
        .blob()
        .then((blob) => saveBlob(blob, file.name))
        .catch((err) => console.error('[file]', file.name, err))
        .finally(() => {
          btn.disabled = false
        })
    })
  })

  const toggleBtn = container.querySelector<HTMLButtonElement>('[data-action="toggle-files"]')!
  toggleBtn.addEventListener('click', () => {
    list.hidden = !list.hidden
    toggleBtn.textContent = list.hidden ? 'See files' : 'Hide files'
  })

  const downloadAllBtn = container.querySelector<HTMLButtonElement>('[data-action="download-all"]')!
  downloadAllBtn.addEventListener('click', async () => {
    downloadAllBtn.disabled = true
    const originalText = downloadAllBtn.textContent
    downloadAllBtn.textContent = 'Zipping…'
    try {
      const zip = downloadZip(files.map((file) => ({ input: file.stream(), name: file.path, size: file.length })))
      const blob = await zip.blob()
      saveBlob(blob, `${transfer.torrent.name || 'download'}.zip`)
    } catch (err) {
      console.error('[zip]', err)
      showToast('Could not build the zip — try saving files individually')
    } finally {
      downloadAllBtn.disabled = false
      downloadAllBtn.textContent = originalText
    }
  })
}

function render() {
  const seen = new Set<string>()
  for (const transfer of torrentManager.transfers.values()) {
    seen.add(transfer.id)
    let card = cards.get(transfer.id)
    if (!card) {
      card = createCard(transfer)
      cards.set(transfer.id, card)
      transferList.prepend(card.root)
    }
    card.update(transfer)
  }
  for (const [id, card] of cards) {
    if (!seen.has(id)) {
      card.destroy()
      cards.delete(id)
    }
  }
  setWakeLockWanted(torrentManager.hasActiveTransfer())
  updateTitle(torrentManager.transfers.values())
}

torrentManager.onChange(render)
render()

// ---------- wake lock indicator ----------
const wakeBtn = document.querySelector<HTMLButtonElement>('#wake-btn')!
if (!wakeLockSupported) wakeBtn.title = 'Wake Lock not supported in this browser'
setInterval(() => {
  const active = isWakeLockActive()
  wakeBtn.classList.toggle('active', active)
  if (wakeLockSupported) wakeBtn.title = active ? 'Staying awake' : 'Idle'
}, 1000)
