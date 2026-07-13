import type { Context } from 'hono'

export function setImageCacheHeaders(
  c: Context,
  slug: string,
  variant: string,
  userId?: number | null,
  albumId?: number | null,
): void {
  const tags = [`img-${slug}`]
  if (userId)  tags.push(`user-${userId}`)
  if (albumId) tags.push(`album-${albumId}`)

  c.header('Cache-Control', 'public, max-age=31536000, immutable')
  c.header('CDN-Cache-Control', 'max-age=31536000')
  c.header('ETag', `"${slug}-${variant}"`)
  c.header('Cache-Tag', tags.join(', '))
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Timing-Allow-Origin', '*')
}

export function setApiCacheHeaders(c: Context, maxAge = 60): void {
  c.header('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 5}`)
}

export function noCache(c: Context): void {
  c.header('Cache-Control', 'no-store')
}
