import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { eq, isNull, desc, sql, and } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { albums, images, users } from '../db/schema'
import { createStorage } from '../lib/storage'
import { formatImage, formatAlbum } from '../lib/format'
import { apiKeyAuth } from '../middleware/auth'
import { setApiCacheHeaders, noCache } from '../middleware/cache'
import { albumSlug } from '../lib/nanoid'
import type { AuthVariables } from '../middleware/auth'

const storage = createStorage()

const createSchema = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  visibility:  z.enum(['public', 'private']).default('public'),
})

const updateSchema = createSchema.partial()

const listSchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  sort:     z.enum(['created_at', 'images_count']).default('created_at'),
})

export const albumRoutes = new Hono<{ Variables: AuthVariables }>()

// POST /api/albums
albumRoutes.post('/', apiKeyAuth, zValidator('json', createSchema), async (c) => {
  const body   = c.req.valid('json')
  const userId = c.get('userId')

  const slug = albumSlug()

  const [album] = await db
    .insert(albums)
    .values({
      slug,
      title:       body.title,
      description: body.description ?? null,
      visibility:  body.visibility,
      user_id:     userId,
    })
    .returning()

  noCache(c)
  return c.json({
    album: {
      title:       album!.title,
      description: album!.description,
      is_public:   album!.visibility === 'public',
      updated_at:  album!.updated_at.toISOString(),
      created_at:  album!.created_at.toISOString(),
      encoded_id:  album!.slug,
    },
  }, 201)
})

// GET /api/albums/:encoded_id
albumRoutes.get('/:encoded_id', zValidator('query', listSchema), async (c) => {
  const slug            = c.req.param('encoded_id')
  const { page, per_page, sort } = c.req.valid('query')
  const offset          = (page - 1) * per_page

  const [albumRow] = await db
    .select({ album: albums, user: users })
    .from(albums)
    .leftJoin(users, eq(albums.user_id, users.id))
    .where(eq(albums.slug, slug))
    .limit(1)

  if (!albumRow) return c.json({ error: 'Not found' }, 404)
  const { album, user } = albumRow

  const [imageRows, [{ total }], coverRow] = await Promise.all([
    db
      .select()
      .from(images)
      .where(and(eq(images.album_id, album.id), isNull(images.deleted_at)))
      .orderBy(sort === 'images_count' ? desc(images.id) : desc(images.created_at))
      .limit(per_page)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(images)
      .where(and(eq(images.album_id, album.id), isNull(images.deleted_at))),
    album.cover_image_id
      ? db.select().from(images).where(eq(images.id, album.cover_image_id)).limit(1)
      : Promise.resolve([]),
  ])

  setApiCacheHeaders(c, 60)

  return c.json({
    album: {
      ...formatAlbum(album, total, coverRow[0] ?? null, storage),
      user: user
        ? { username: user.username, display_name: user.display_name, credit_balance: user.credit_balance }
        : null,
    },
    images: imageRows.map(img => formatImage(img, storage)),
    is_owner: false,
    pagination: {
      current_page: page,
      last_page:    Math.max(1, Math.ceil(total / per_page)),
      per_page,
      total,
    },
  })
})

// PATCH /api/albums/:encoded_id
albumRoutes.patch('/:encoded_id', apiKeyAuth, zValidator('json', updateSchema), async (c) => {
  const slug   = c.req.param('encoded_id')
  const body   = c.req.valid('json')
  const userId = c.get('userId')

  const [album] = await db
    .select()
    .from(albums)
    .where(eq(albums.slug, slug))
    .limit(1)

  if (!album)                 return c.json({ error: 'Not found' }, 404)
  if (album.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [updated] = await db
    .update(albums)
    .set({
      ...(body.title       !== undefined && { title:       body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.visibility  !== undefined && { visibility:  body.visibility }),
      updated_at: new Date(),
    })
    .where(eq(albums.id, album.id))
    .returning()

  noCache(c)
  return c.json({ album: { encoded_id: updated!.slug, title: updated!.title, visibility: updated!.visibility } })
})
