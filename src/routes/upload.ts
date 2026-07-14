import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { images, albums } from '../db/schema'
import { createStorage } from '../lib/storage'
import { processImage } from '../lib/images'
import { formatImage } from '../lib/format'
import { imageSlug } from '../lib/nanoid'
import { apiKeyAuth } from '../middleware/auth'
import { noCache } from '../middleware/cache'
import type { AuthVariables } from '../middleware/auth'

const storage    = createStorage()
const MAX_BYTES  = parseInt(process.env.MAX_FILE_SIZE_MB ?? '25') * 1024 * 1024

const urlSchema = z.object({
  url:      z.string().url(),
  album_id: z.string().optional(),
})

export const uploadRoutes = new Hono<{ Variables: AuthVariables }>()

uploadRoutes.use('*', apiKeyAuth)

// POST /api/upload — multipart file or JSON URL
uploadRoutes.post('/', async (c) => {
  const contentType = c.req.header('content-type') ?? ''
  let inputBuffer: Buffer
  let originalFilename: string | null = null
  let albumEncodedId: string | undefined

  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return c.json({ error: 'Missing file field' }, 422)
    }
    if (file.size > MAX_BYTES) {
      return c.json({ error: `File exceeds ${process.env.MAX_FILE_SIZE_MB ?? 25}MB limit` }, 413)
    }

    inputBuffer      = Buffer.from(await file.arrayBuffer())
    originalFilename = file.name
    albumEncodedId   = form.get('album_id')?.toString()

  } else {
    // JSON URL upload
    const parsed = urlSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422)

    const { url, album_id } = parsed.data
    albumEncodedId = album_id

    inputBuffer = await downloadUrl(url, MAX_BYTES)
  }

  // Resolve album if provided
  let resolvedAlbumId: number | null = null
  if (albumEncodedId) {
    const [album] = await db
      .select()
      .from(albums)
      .where(eq(albums.slug, albumEncodedId))
      .limit(1)

    if (!album) return c.json({ error: 'Album not found' }, 404)
    if (album.user_id !== c.get('userId')) return c.json({ error: 'Forbidden' }, 403)

    resolvedAlbumId = album.id
  }

  let processed
  try {
    processed = await processImage(inputBuffer)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Image processing failed' }, 422)
  }

  const slug       = imageSlug()
  const storageKey = `images/${slug}`
  const userId     = c.get('userId')

  // Store all three variants in parallel
  await Promise.all([
    storage.put(`${storageKey}/original.${processed.ext}`, processed.original, processed.mime),
    storage.put(`${storageKey}/medium.webp`,               processed.medium,   'image/webp'),
    storage.put(`${storageKey}/thumb.webp`,                processed.thumb,    'image/webp'),
  ])

  const [image] = await db
    .insert(images)
    .values({
      slug,
      mime_type:         processed.mime,
      size_bytes:        inputBuffer.length,
      width:             processed.width,
      height:            processed.height,
      original_filename: originalFilename,
      storage_key:       storageKey,
      ext:               processed.ext,
      album_id:          resolvedAlbumId,
      user_id:           userId,
      storage_origin:    process.env.PUBLIC_URL ?? null,
    })
    .returning()

  // Set album cover if none exists yet
  if (resolvedAlbumId) {
    const [album] = await db
      .select()
      .from(albums)
      .where(eq(albums.id, resolvedAlbumId))
      .limit(1)

    if (album && !album.cover_image_id) {
      db.update(albums)
        .set({ cover_image_id: image!.id, updated_at: new Date() })
        .where(eq(albums.id, resolvedAlbumId))
        .execute()
        .catch(() => {})
    }
  }

  noCache(c)
  return c.json({ image: formatImage(image!, storage) }, 201)
})

async function downloadUrl(url: string, maxBytes: number): Promise<Buffer> {
  const res = await fetch(url, {
    signal:   AbortSignal.timeout(15_000),
    redirect: 'follow',
  })

  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`)

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) {
    throw new Error('URL does not point to an image')
  }

  const contentLength = Number(res.headers.get('content-length') ?? 0)
  if (contentLength > maxBytes) throw new Error('Remote image exceeds size limit')

  const chunks: Buffer[] = []
  let total = 0

  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength
    if (total > maxBytes) throw new Error('Remote image exceeds size limit')
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}
