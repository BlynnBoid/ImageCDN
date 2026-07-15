import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { join } from 'node:path'
import { sql } from './db/client'
import { nearestRegion, REGIONS } from './lib/geo'
import { imageRoutes } from './routes/images'
import { albumRoutes } from './routes/albums'
import { userRoutes } from './routes/users'
import { uploadRoutes } from './routes/upload'
import { deliverRoutes } from './routes/deliver'
import { adminRoutes } from './routes/admin'

const app = new Hono()

/* ── Global middleware ────────────────────────────────────────────── */
app.use('*', logger())
app.use('*', secureHeaders({
  // File responses set this explicitly after validating the requested file.
  crossOriginResourcePolicy: false,
}))

app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'HEAD', 'OPTIONS'],
}))

/* ── Local file serving ───────────────────────────────────────────── */
app.get('/files/*', async (c) => {
  const key = c.req.path.replace(/^\/files\//, '')
  const filePath = join(process.env.UPLOAD_DIR ?? './uploads', key)
  const file = Bun.file(filePath)

  if (!await file.exists()) {
    return c.notFound()
  }

  c.header('Cache-Control', 'public, max-age=31536000, immutable')
  c.header('CDN-Cache-Control', 'max-age=31536000')
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Cross-Origin-Resource-Policy', 'cross-origin')
  c.header('Timing-Allow-Origin', '*')

  return new Response(file)
})

/* ── Routes ───────────────────────────────────────────────────────── */
app.route('/i', deliverRoutes)
app.route('/api/images', imageRoutes)
app.route('/api/albums', albumRoutes)
app.route('/api/users', userRoutes)
app.route('/api/upload', uploadRoutes)
app.route('/admin', adminRoutes)

/* ── Health checks ────────────────────────────────────────────────── */
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    ts: Date.now(),
  })
})

app.get('/ready', async (c) => {
  try {
    await sql`select 1`

    return c.json({
      status: 'ready',
      ts: Date.now(),
    })
  } catch {
    return c.json({
      status: 'unavailable',
      ts: Date.now(),
    }, 503)
  }
})

/* ── Geo region routing ───────────────────────────────────────────── */
app.get('/api/region', (c) => {
  const country =
    c.req.header('CF-IPCountry') ??
    c.req.header('cf-ipcountry') ??
    ''

  const region = nearestRegion(country)

  return c.json({
    region: region.name,
    upload_url: region.upload_url,
    country: country || null,
    regions: REGIONS,
  })
})

/* ── Global error handler ─────────────────────────────────────────── */
app.onError((err, c) => {
  console.error(err)

  return c.json({
    error: 'Internal server error',
  }, 500)
})

app.notFound((c) => {
  return c.json({
    error: 'Not found',
  }, 404)
})

/* ── Start ────────────────────────────────────────────────────────── */
const port = Number(process.env.PORT ?? '3000')
const hostname = process.env.HOST ?? '0.0.0.0'

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535')
}

export default {
  port,
  hostname,
  fetch: app.fetch,
}

console.log(`ImageCDN listening on http://${hostname}:${port}`)
