import type { FastifyInstance } from 'fastify'
import { existsSync, readFileSync } from 'fs'
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

export function serveStatic(app: FastifyInstance, publicDir: string) {
  app.get('/*', async (request, reply) => {
    const url = request.url.split('?')[0]
    if (isBackendRoute(url)) return reply.callNotFound()

    const hideDashboard = process.env.HIDE_DASHBOARD === 'true' || process.env.HIDE_PORTAL === 'true'
    if (hideDashboard && (url.startsWith('/dashboard') || url.startsWith('/portal'))) {
      return reply.redirect('/')
    }

    const filePath = resolve(publicDir, url === '/' ? 'index.html' : url.slice(1))
    if (!filePath.startsWith(publicDir)) return reply.callNotFound()

    if (existsSync(filePath)) {
      const ext = extname(filePath)
      const contentType = MIME_TYPES[ext] || 'application/octet-stream'
      return reply.type(contentType).send(readFileSync(filePath))
    }

    const indexPath = resolve(publicDir, 'index.html')
    if (existsSync(indexPath)) {
      return reply.type('text/html').send(readFileSync(indexPath))
    }

    return reply.callNotFound()
  })
}
