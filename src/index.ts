import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { join } from 'node:path'
import { imageRoutes }  from './routes/images'
import { albumRoutes }  from './routes/albums'
import { userRoutes }   from './routes/users'
import { uploadRoutes } from './routes/upload'
import { deliverRoutes } from './routes/deliver'
import { adminRoutes }  from './routes/admin'

const app = new Hono()

/* ── Global middleware ────────────────────────────────────────────── */
app.use('*', logger())
app.use('*', secureHeaders())
app.use('/api/*', cors({
  origin:  '*',
  allowMethods: ['GET', 'HEAD', 'OPTIONS'],
}))

/* ── Local file serving (only active when using LocalStorage) ──────── */
app.get('/files/*', async (c) => {
  const key      = c.req.path.replace(/^\/files\//, '')
  const filePath = join('./uploads', key)
  const file     = Bun.file(filePath)

  if (!await file.exists()) return c.notFound()

  c.header('Cache-Control', 'public, max-age=31536000, immutable')
  c.header('CDN-Cache-Control', 'max-age=31536000')
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Timing-Allow-Origin', '*')

  return new Response(file)
})

/* ── Routes ─────────────────────────────────────────────────────────── */
app.route('/i',          deliverRoutes)
app.route('/api/images', imageRoutes)
app.route('/api/albums', albumRoutes)
app.route('/api/users',  userRoutes)
app.route('/api/upload', uploadRoutes)
app.route('/admin',      adminRoutes)

/* ── Health check ───────────────────────────────────────────────────── */
app.get('/health', (c) => c.json({ status: 'ok', ts: Date.now() }))

/* ── Global error handler ───────────────────────────────────────────── */
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

/* ── Start ──────────────────────────────────────────────────────────── */
const port = parseInt(process.env.PORT ?? '3000')

export default {
  port,
  fetch: app.fetch,
}

console.log(`🚀  ImageCDN running on http://localhost:${port}`)
