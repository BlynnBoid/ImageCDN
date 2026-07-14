import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { images } from '../db/schema'
import { createStorage } from '../lib/storage'
import { setImageCacheHeaders } from '../middleware/cache'

const storage = createStorage()

export const deliverRoutes = new Hono()

const VARIANTS = new Set(['original', 'medium', 'thumb'])

deliverRoutes.get('/:slug/:variant', async (c) => {
  const { slug, variant } = c.req.param()

  if (!VARIANTS.has(variant)) {
    return c.json({ error: 'Invalid variant. Use: original, medium, thumb' }, 400)
  }

  const [image] = await db
    .select()
    .from(images)
    .where(eq(images.slug, slug))
    .limit(1)

  if (!image) return c.json({ error: 'Not found' }, 404)
  if (image.deleted_at) return c.json({ error: 'Gone' }, 410)

  setImageCacheHeaders(c, slug, variant, image.user_id, image.album_id)

  const key = variant === 'original'
    ? `${image.storage_key}/original.${image.ext}`
    : `${image.storage_key}/${variant}.webp`

  // For local storage: redirect to the instance that holds this file.
  // For S3: storage.publicUrl() is already an absolute S3 URL — origin doesn't apply.
  const url = (image.storage_origin && storage.urlFromOrigin)
    ? storage.urlFromOrigin(key, image.storage_origin)
    : storage.publicUrl(key)

  return c.redirect(url, 302)
})
