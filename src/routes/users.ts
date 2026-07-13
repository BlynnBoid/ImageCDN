import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, isNull, desc, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { albums, images, users } from '../db/schema'
import { createStorage } from '../lib/storage'
import { formatAlbum } from '../lib/format'
import { setApiCacheHeaders } from '../middleware/cache'

const storage = createStorage()

const listSchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
})

export const userRoutes = new Hono()

// GET /api/users/:username/albums
userRoutes.get('/:username/albums', zValidator('query', listSchema), async (c) => {
  const username       = c.req.param('username')
  const { page, per_page } = c.req.valid('query')
  const offset         = (page - 1) * per_page

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1)

  if (!user) return c.json({ error: 'User not found' }, 404)

  const [albumRows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(albums)
      .where(eq(albums.user_id, user.id))
      .orderBy(desc(albums.created_at))
      .limit(per_page)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(albums)
      .where(eq(albums.user_id, user.id)),
  ])

  // Fetch image counts and cover images for all albums in one round-trip each
  const albumIds = albumRows.map(a => a.id)

  const [countRows, coverRows] = await Promise.all([
    albumIds.length
      ? db
          .select({
            album_id: images.album_id,
            count:    sql<number>`count(*)::int`,
          })
          .from(images)
          .where(
            isNull(images.deleted_at),
          )
          .groupBy(images.album_id)
      : Promise.resolve([]),
    albumRows
      .filter(a => a.cover_image_id !== null)
      .length
      ? db
          .select()
          .from(images)
          .where(
            sql`${images.id} = ANY(ARRAY[${sql.join(
              albumRows
                .filter(a => a.cover_image_id !== null)
                .map(a => sql`${a.cover_image_id}`),
              sql`, `,
            )}]::int[])`,
          )
      : Promise.resolve([]),
  ])

  const countMap  = new Map(countRows.map(r => [r.album_id, r.count]))
  const coverMap  = new Map(coverRows.map(img => [img.id, img]))

  setApiCacheHeaders(c, 60)

  return c.json({
    albums: albumRows.map(album => ({
      ...formatAlbum(
        album,
        countMap.get(album.id) ?? 0,
        album.cover_image_id ? (coverMap.get(album.cover_image_id) ?? null) : null,
        storage,
      ),
    })),
    pagination: {
      current_page: page,
      last_page:    Math.max(1, Math.ceil(total / per_page)),
      per_page,
      total,
    },
  })
})
