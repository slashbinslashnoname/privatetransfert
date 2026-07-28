import type { Torrent } from 'webtorrent'
import type { Direction } from './torrent-manager'

const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * A circular progress indicator for one transfer: percentage ring (CSS handles
 * the smooth animation between updates via stroke-dashoffset transitions) plus
 * a small dot that orbits the ring — continuously while there's live traffic —
 * as a lightweight stand-in for "data moving" that costs nothing per frame.
 */
export class TransferRing {
  private container: HTMLElement
  private progress: SVGCircleElement
  private label: HTMLElement
  private orbit: HTMLElement

  constructor(
    container: HTMLElement,
    private torrent: Torrent,
    direction: Direction,
  ) {
    container.classList.add('ring', direction === 'seed' ? 'ring-seed' : 'ring-download')
    container.innerHTML = `
      <svg viewBox="0 0 96 96" class="ring-svg">
        <circle cx="48" cy="48" r="${RADIUS}" class="ring-track" />
        <circle cx="48" cy="48" r="${RADIUS}" class="ring-progress"
          stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="${CIRCUMFERENCE}" />
      </svg>
      <div class="ring-orbit"><span class="ring-dot"></span></div>
      <div class="ring-label"></div>
    `
    this.container = container
    this.progress = container.querySelector('.ring-progress')!
    this.label = container.querySelector('.ring-label')!
    this.orbit = container.querySelector('.ring-orbit')!
    this.update()
  }

  update() {
    const t = this.torrent
    const isSeed = this.container.classList.contains('ring-seed')
    const fraction = isSeed ? 1 : t.progress || 0
    this.progress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - fraction))
    const fullyDistributed = isSeed && t.numPeers > 0 && t.wires.every((w) => w.isSeeder)
    const complete = (!isSeed && t.done) || fullyDistributed
    this.container.classList.toggle('ring-complete', complete)
    if (isSeed) {
      this.label.textContent = fullyDistributed ? '✓' : '∞'
    } else {
      this.label.textContent = t.done ? '✓' : `${Math.round(fraction * 100)}%`
    }

    const speed = isSeed ? t.uploadSpeed : t.downloadSpeed
    const active = t.numPeers > 0 && speed > 0
    this.orbit.classList.toggle('spinning', active)
    if (active) {
      const kbps = speed / 1024
      const duration = Math.max(0.5, 3 - Math.log2(1 + kbps) * 0.4)
      this.orbit.style.setProperty('--orbit-duration', `${duration}s`)
    }
  }
}
