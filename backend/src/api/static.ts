import type { FastifyInstance } from 'fastify'
import { existsSync, readFileSync, statSync, type Stats } from 'fs'
import { resolve, extname } from 'path'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

function isBackendRoute(url: string): boolean {
  if (url === '/auth/login' || url === '/auth/register') return false
  return url.startsWith('/api') || url.startsWith('/v1') || url.startsWith('/health') || url.startsWith('/version') || url.startsWith('/auth') || url.startsWith('/mcp')
}

// Vite emits long-lived content-hashed bundles under /assets/.
const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const HTML_CACHE_CONTROL = 'no-cache' // revalidate; the HTML references hashed assets

interface CachedFile {
  body: Buffer
  etag: string
  size: number
  mtimeMs: number
}

/** File cache keyed by path, invalidated by stat (size/mtime), so readFileSync runs once per file change. */
const fileCache = new Map<string, CachedFile>()

function weakEtag(stats: Stats): string {
  return `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`
}

function cachedFile(filePath: string): CachedFile {
  const stats = statSync(filePath)
  const cached = fileCache.get(filePath)
  if (cached && cached.size === stats.size && cached.mtimeMs === stats.mtimeMs) return cached
  const entry: CachedFile = {
    body: readFileSync(filePath),
    etag: weakEtag(stats),
    size: stats.size,
    mtimeMs: stats.mtimeMs,
  }
  fileCache.set(filePath, entry)
  return entry
}

export function serveStatic(app: FastifyInstance, publicDir: string) {
  app.get('/*', async (request, reply) => {
    const url = request.url.split('?')[0]
    if (isBackendRoute(url)) return reply.callNotFound()

    const hideDashboard = process.env.HIDE_DASHBOARD === 'true'
    if (hideDashboard && url.startsWith('/dashboard')) {
      return reply.redirect('/')
    }

    const filePath = resolve(publicDir, url === '/' ? 'index.html' : url.slice(1))
    if (!filePath.startsWith(publicDir)) return reply.callNotFound()

    if (existsSync(filePath)) {
      const cacheControl = filePath.startsWith(resolve(publicDir, 'assets') + '/')
        ? ASSET_CACHE_CONTROL
        : HTML_CACHE_CONTROL
      const entry = cachedFile(filePath)
      if (request.headers['if-none-match'] === entry.etag) {
        return reply.code(304).header('ETag', entry.etag).send()
      }
      const ext = extname(filePath)
      const contentType = MIME_TYPES[ext] || 'application/octet-stream'
      return reply
        .type(contentType)
        .header('Cache-Control', cacheControl)
        .header('ETag', entry.etag)
        .send(entry.body)
    }

    const indexPath = resolve(publicDir, 'index.html')
    if (existsSync(indexPath)) {
      const entry = cachedFile(indexPath)
      if (request.headers['if-none-match'] === entry.etag) {
        return reply.code(304).header('ETag', entry.etag).send()
      }
      return reply
        .type('text/html')
        .header('Cache-Control', HTML_CACHE_CONTROL)
        .header('ETag', entry.etag)
        .send(entry.body)
    }

    return reply.callNotFound()
  })
}
