type PathedFile = File & { fullPath?: string }

/** Recursively resolves a drop's dataTransfer into a flat file list, preserving folder structure. */
export async function collectFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const items = dataTransfer.items
  if (items?.length && typeof items[0]?.webkitGetAsEntry === 'function') {
    const entries = Array.from(items)
      .map((item) => item.webkitGetAsEntry())
      .filter((entry): entry is FileSystemEntry => entry !== null)
    if (entries.length) {
      const files: File[] = []
      await Promise.all(entries.map((entry) => walkEntry(entry, '', files)))
      return normalize(files)
    }
  }
  return normalize(Array.from(dataTransfer.files))
}

/** Normalizes a plain FileList (e.g. from a `webkitdirectory` input) to the same shape as collectFiles. */
export function normalize(files: File[]): File[] {
  for (const file of files) {
    const pathed = file as PathedFile
    if (!pathed.fullPath) pathed.fullPath = file.webkitRelativePath || file.name
  }
  return files
}

/** The path to use as this file's entry name inside an archive (preserves folder structure). */
export function pathOf(file: File): string {
  return (file as PathedFile).fullPath || file.webkitRelativePath || file.name
}

function walkEntry(entry: FileSystemEntry, prefix: string, out: File[]): Promise<void> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      ;(entry as FileSystemFileEntry).file((file) => {
        ;(file as PathedFile).fullPath = `${prefix}${file.name}`
        out.push(file)
        resolve()
      }, () => resolve())
      return
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      const readBatch = () => {
        reader.readEntries((batch) => {
          if (!batch.length) {
            resolve()
            return
          }
          Promise.all(batch.map((child) => walkEntry(child, `${prefix}${entry.name}/`, out))).then(readBatch)
        }, () => resolve())
      }
      readBatch()
      return
    }
    resolve()
  })
}
