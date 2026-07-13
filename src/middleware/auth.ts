import { createHash } from 'node:crypto'
import { createMiddleware } from 'hono/factory'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { api_keys } from '../db/schema'

export type AuthVariables = {
  userId: number
}

export const apiKeyAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const header = c.req.header('Authorization') ?? c.req.header('X-API-Key')

  let key: string | undefined
  if (header?.startsWith('Bearer ')) {
    key = header.slice(7)
  } else if (header && !header.startsWith('Bearer')) {
    key = header
  }

  if (!key) return c.json({ error: 'Missing API key' }, 401)

  const dotIndex = key.indexOf('.')
  if (dotIndex === -1) return c.json({ error: 'Invalid API key format' }, 401)

  const prefix = key.slice(0, dotIndex)
  const hash   = createHash('sha256').update(key).digest('hex')

  const [row] = await db
    .select()
    .from(api_keys)
    .where(eq(api_keys.prefix, prefix))
    .limit(1)

  if (!row || row.hash !== hash) return c.json({ error: 'Invalid API key' }, 401)

  // Non-blocking last_used_at update
  db.update(api_keys)
    .set({ last_used_at: new Date() })
    .where(eq(api_keys.id, row.id))
    .execute()
    .catch(() => {})

  c.set('userId', row.user_id)
  await next()
})

export const adminAuth = createMiddleware(async (c, next) => {
  const token = process.env.ADMIN_TOKEN
  if (!token) return c.json({ error: 'Admin not configured' }, 503)

  const header = c.req.header('Authorization')
  const provided = header?.startsWith('Bearer ') ? header.slice(7) : null

  // Cookie-based session for browser use
  const cookie = getCookieValue(c.req.header('cookie') ?? '', 'admin_session')

  if (provided !== token && cookie !== token) {
    // Return login page for browser GETs, 401 for API requests
    const isHtml = c.req.header('accept')?.includes('text/html')
    if (isHtml) return c.redirect('/admin/login')
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
})

function getCookieValue(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]!) : null
}
