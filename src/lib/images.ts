const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
])

const VARIANTS = {
  thumb:  { width: 240, height: 320 },
  medium: { width: 600, height: 800 },
} as const

export interface ProcessedImage {
  original: Buffer
  thumb:    Buffer
  medium:   Buffer
  width:    number
  height:   number
  mime:     string
  ext:      string
}

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const meta = await new Bun.Image(input).metadata()

  if (!meta.format) throw new Error('Unrecognized image format')

  const mime = meta.format === 'jpg' ? 'image/jpeg' : `image/${meta.format}`
  if (!ALLOWED_MIME.has(mime)) throw new Error(`Unsupported format: ${meta.format}`)

  // autoOrient is true by default — strips EXIF rotation tag
  const [original, thumb, medium] = await Promise.all([
    // Re-encode in source format with auto-orient applied; no other transforms
    new Bun.Image(input).buffer(),

    new Bun.Image(input)
      .resize(VARIANTS.thumb.width, VARIANTS.thumb.height, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .buffer(),

    new Bun.Image(input)
      .resize(VARIANTS.medium.width, VARIANTS.medium.height, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .buffer(),
  ])

  const ext = meta.format === 'jpeg' ? 'jpg' : meta.format

  return {
    original: Buffer.from(original),
    thumb:    Buffer.from(thumb),
    medium:   Buffer.from(medium),
    width:    meta.width  ?? 0,
    height:   meta.height ?? 0,
    mime,
    ext,
  }
}
