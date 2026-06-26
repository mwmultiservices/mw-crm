export interface AddressResult {
  formatted: string
  street: string
  city: string
  postcode: string
  approximate: boolean // true when no house_number found
  provider: string     // which geocoder succeeded
  raw: Record<string, string>
}

const cache = new Map<string, AddressResult | null>()

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`  // ~0.1m precision
}

export async function reverseGeocode(lat: number, lng: number): Promise<AddressResult | null> {
  const key = cacheKey(lat, lng)
  if (cache.has(key)) return cache.get(key)!

  try {
    // Call our server-side proxy — tries geocoder.ca (Canadian data) then Nominatim
    const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`)
    if (!res.ok) throw new Error(`geocode API ${res.status}`)
    const data = await res.json()
    console.log(`[reverseGeocode] provider=${data.provider} house=${data.house_number} road=${data.road}`)

    if (data.error) throw new Error(data.error)

    const houseNumber: string = data.house_number || ''
    const road: string = data.road || ''
    const city: string = data.city || ''
    const postcode: string = data.postcode || ''
    const street = [houseNumber, road].filter(Boolean).join(' ')
    const formatted = [street, city, postcode].filter(Boolean).join(', ')
    const approximate = !houseNumber

    const result: AddressResult = {
      formatted, street, city, postcode,
      approximate,
      provider: data.provider || 'unknown',
      raw: data.raw || {},
    }
    cache.set(key, result)
    return result
  } catch (err) {
    console.warn('[reverseGeocode] failed:', err)
    cache.set(key, null)
    return null
  }
}
