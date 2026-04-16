/**
 * Japanese postal code lookup via zipcloud API (free, no key, CORS OK).
 * Returns address components; coordinates resolved via jp-areas database.
 */

const ZIPCLOUD_URL = 'https://zipcloud.ibsnet.co.jp/api/search'

export interface PostalResult {
  zipcode: string
  prefecture: string
  city: string
  area: string
  fullAddress: string
}

export async function lookupPostalCode(code: string): Promise<PostalResult | null> {
  const clean = code.replace(/[^0-9]/g, '')
  if (clean.length !== 7) return null

  const res = await fetch(`${ZIPCLOUD_URL}?zipcode=${clean}`)
  const data = await res.json()

  if (data.status !== 200 || !data.results?.length) return null

  const r = data.results[0] as {
    zipcode: string
    address1: string
    address2: string
    address3: string
  }

  return {
    zipcode: r.zipcode,
    prefecture: r.address1,
    city: r.address2,
    area: r.address3,
    fullAddress: `${r.address1}${r.address2}${r.address3}`,
  }
}
