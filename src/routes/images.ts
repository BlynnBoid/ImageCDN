import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, isNull, desc, sql, and } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { images, albums, users } from '../db/schema'
import { createStorage } from '../lib/storage'
import { formatImage, formatAlbum, formatUser } from '../lib/format'
import { apiKeyAuth } from '../middleware/auth'
import { setApiCacheHeaders, noCache } from '../middleware/cache'
import { purgeCacheTags } from '../lib/cloudflare'
import type { AuthVariables } from '../middleware/auth'

const storage = createStorage()

const listSchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  sort:     z.enum(['created_at', 'size_bytes']).default('created_at'),
})

export const imageRoutes = new Hono<{ Variables: AuthVariables }>()

// GET /api/images
imageRoutes.get('/', zValidator('query', listSchema), async (c) => {
  const { page, per_page, sort } = c.req.valid('query')
  const offset = (page - 1) * per_page

  const orderCol = sort === 'size_bytes' ? images.size_bytes : images.created_at

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        image: images,
        album: albums,
      })
      .from(images)
      .leftJoin(albums, eq(images.album_id, albums.id))
      .where(isNull(images.deleted_at))
      .orderBy(desc(orderCol))
      .limit(per_page)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(images)
      .where(isNull(images.deleted_at)),
  ])

  setApiCacheHeaders(c, 30)

  return c.json({
    images: rows.map(({ image, album }) => ({
      ...formatImage(image, storage),
      album: album
        ? {
            title:       album.title,
            description: album.description,
            visibility:  album.visibility,
            encoded_id:  album.slug,
          }
        : null,
    })),
    pagination: {
      current_page: page,
      last_page:    Math.max(1, Math.ceil(total / per_page)),
      per_page,
      total,
    },
  })
})

// GET /api/images/:encoded_id
imageRoutes.get('/:encoded_id', async (c) => {
  const slug = c.req.param('encoded_id')

  const [row] = await db
    .select({ image: images, album: albums, user: users })
    .from(images)
    .leftJoin(albums, eq(images.album_id, albums.id))
    .leftJoin(users,  eq(images.user_id,  users.id))
    .where(and(eq(images.slug, slug), isNull(images.deleted_at)))
    .limit(1)

  if (!row) return c.json({ error: 'Not found' }, 404)

  setApiCacheHeaders(c, 60)

  return c.json({
    image: {
      ...formatImage(row.image, storage),
      album: row.album
        ? {
            title:       row.album.title,
            description: row.album.description,
            visibility:  row.album.visibility,
            encoded_id:  row.album.slug,
          }
        : null,
      user: row.user ? formatUser(row.user) : null,
    },
  })
})

// DELETE /api/images/:encoded_id
imageRoutes.delete('/:encoded_id', apiKeyAuth, async (c) => {
  const slug   = c.req.param('encoded_id')
  const userId = c.get('userId')

  const [image] = await db
    .select()
    .from(images)
    .where(and(eq(images.slug, slug), isNull(images.deleted_at)))
    .limit(1)

  if (!image)             return c.json({ error: 'Not found' }, 404)
  if (image.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db
    .update(images)
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where(eq(images.id, image.id))

  // Fire-and-forget: purge CDN cache + clean up storage
  Promise.all([
    purgeCacheTags([`img-${slug}`, `user-${userId}`, `album-${image.album_id ?? 'none'}`]),
    storage.delete(`${image.storage_key}/original.${image.ext}`),
    storage.delete(`${image.storage_key}/medium.webp`),
    storage.delete(`${image.storage_key}/thumb.webp`),
  ]).catch(() => {})

  noCache(c)
  return c.json({ success: true })
})
