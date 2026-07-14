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
