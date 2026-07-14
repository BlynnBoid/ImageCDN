// Country codes that route to North America (na1).
// Everything else goes to EU (eu1 primary, eu2 fallback via env).
const NA_COUNTRIES = new Set([
  'US', 'CA', 'MX',
  'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY',
  'CU', 'DO', 'PR', 'JM', 'HT', 'TT', 'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'BZ',
])

export interface Region {
  name:       string
  upload_url: string
}

export const REGIONS: Region[] = [
  {
    name:       'na1',
    upload_url: (process.env.REGION_NA1_URL ?? 'https://na1.frogcdn.com') + '/api/upload',
  },
  {
    name:       'eu1',
    upload_url: (process.env.REGION_EU1_URL ?? 'https://eu1.frogcdn.com') + '/api/upload',
  },
  {
    name:       'eu2',
    upload_url: (process.env.REGION_EU2_URL ?? 'https://eu2.frogcdn.com') + '/api/upload',
  },
]

export function nearestRegion(cfCountry: string): Region {
  if (NA_COUNTRIES.has(cfCountry.toUpperCase())) {
    return REGIONS.find(r => r.name === 'na1') ?? REGIONS[0]!
  }
  return REGIONS.find(r => r.name === 'eu1') ?? REGIONS[0]!
}

export function regionOriginForHost(hostHeader: string | undefined): string | null {
  const hostname = hostHeader?.split(',')[0]?.trim().split(':')[0]?.toLowerCase()
  if (!hostname) return null

  for (const region of REGIONS) {
    const origin = new URL(region.upload_url).origin
    if (new URL(origin).hostname.toLowerCase() === hostname) return origin
  }

  return null
}
