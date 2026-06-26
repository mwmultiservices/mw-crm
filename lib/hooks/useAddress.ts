import { useEffect, useState } from 'react'
import { reverseGeocode, AddressResult } from '@/lib/geocoding'

export function useAddress(lat: number | null, lng: number | null) {
  const [address, setAddress] = useState<AddressResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (lat === null || lng === null) return
    let cancelled = false
    setLoading(true)
    setError(false)
    reverseGeocode(lat, lng).then(result => {
      if (cancelled) return
      if (result) {
        setAddress(result)
      } else {
        setError(true)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [lat, lng])

  return { address, loading, error }
}
