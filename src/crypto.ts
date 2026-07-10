const ALGO = 'AES-GCM'
const IV_LENGTH = 12

export interface ShareKey {
  key: CryptoKey
  iv: Uint8Array<ArrayBuffer>
}

/** Generates a random per-share AES-256-GCM key + IV. Never sent anywhere — only exported into the URL fragment. */
export async function generateShareKey(): Promise<ShareKey> {
  const key = await crypto.subtle.generateKey({ name: ALGO, length: 256 }, true, ['encrypt', 'decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  return { key, iv }
}

export async function encryptBlob(blob: Blob, shareKey: ShareKey): Promise<Blob> {
  const plaintext = await blob.arrayBuffer()
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv: shareKey.iv }, shareKey.key, plaintext)
  return new Blob([ciphertext], { type: 'application/octet-stream' })
}

export async function decryptBlob(blob: Blob, shareKey: ShareKey): Promise<Blob> {
  const ciphertext = await blob.arrayBuffer()
  const plaintext = await crypto.subtle.decrypt({ name: ALGO, iv: shareKey.iv }, shareKey.key, ciphertext)
  return new Blob([plaintext])
}

/** Base64url-encoded key + IV, meant to live only in a URL fragment (never sent to any server/tracker). */
export async function exportShareKey(shareKey: ShareKey): Promise<{ k: string; iv: string }> {
  const raw = await crypto.subtle.exportKey('raw', shareKey.key)
  return { k: bytesToBase64Url(new Uint8Array(raw)), iv: bytesToBase64Url(shareKey.iv) }
}

export async function importShareKey(k: string, iv: string): Promise<ShareKey> {
  const rawKey = base64UrlToBytes(k)
  const key = await crypto.subtle.importKey('raw', new Uint8Array(rawKey), { name: ALGO }, true, ['decrypt'])
  return { key, iv: base64UrlToBytes(iv) }
}

export function randomFileName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return `share-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}.bin`
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (padded.length % 4)) % 4
  const binary = atob(padded + '='.repeat(pad))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
