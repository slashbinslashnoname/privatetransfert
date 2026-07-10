const port = Number(process.env.PORT) || 4173
const dist = new URL('../dist/', import.meta.url)

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname
    const file = Bun.file(new URL(`.${pathname}`, dist))
    if (await file.exists()) return new Response(file)
    return new Response(Bun.file(new URL('./index.html', dist)))
  },
})

console.log(`Private Transfert running at http://localhost:${port}`)
