const { CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN } = process.env

export async function purgeCacheTags(tags: string[]): Promise<void> {
  if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN) return

  await fetch(
    `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`,
    {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tags }),
    },
  ).catch(() => {/* non-fatal — CDN cache will expire via TTL */})
}
