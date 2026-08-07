/**
 * Saving files to disk.
 *
 * WebTorrent hands each file to us as a `ReadableStream` of its pieces. The
 * simple way to save is `file.blob()` + an <a download> click, but `blob()`
 * concatenates *every* piece into one in-memory Blob first. That's fine for a
 * few hundred MB, but a multi-GB file (e.g. a 25 GB transfer) never fits in
 * memory — the tab OOMs the moment the transfer completes and "the download
 * doesn't work".
 *
 * When the File System Access API is available we instead stream straight to a
 * file on disk, so memory stays flat regardless of file size. Browsers without
 * it (Firefox today) fall back to the Blob path in the caller, which is still
 * correct for files that fit in memory.
 */

interface SaveFilePickerOptions {
  suggestedName?: string
}
interface WritableFileStream extends WritableStream<Uint8Array> {
  close(): Promise<void>
}
interface FileHandleLike {
  createWritable(): Promise<WritableFileStream>
}
type ShowSaveFilePicker = (opts?: SaveFilePickerOptions) => Promise<FileHandleLike>

function picker(): ShowSaveFilePicker | undefined {
  return (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker
}

/** True when we can stream to disk without buffering the whole file in memory. */
export function streamingSaveSupported(): boolean {
  return typeof picker() === 'function'
}

/** Thrown when the user dismisses the OS save dialog — not a real failure. */
export class SaveCancelled extends Error {
  constructor() {
    super('Save cancelled')
    this.name = 'SaveCancelled'
  }
}

/**
 * Streams `stream` directly to a user-chosen file on disk. Must be invoked from
 * a user gesture (the save picker opens synchronously). Assumes the caller has
 * already checked {@link streamingSaveSupported}.
 */
export async function saveStreamToDisk(stream: ReadableStream<Uint8Array>, suggestedName: string): Promise<void> {
  const show = picker()
  if (!show) throw new Error('File System Access API unavailable')

  let handle: FileHandleLike
  try {
    handle = await show({ suggestedName })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new SaveCancelled()
    throw err
  }

  const writable = await handle.createWritable()
  // pipeTo writes each piece as it arrives, then flushes + closes the file on
  // success (or aborts the writable on error). Nothing is held in memory.
  await stream.pipeTo(writable)
}
