'use client'
import { useState, useEffect, useRef } from 'react'
import { X, MapPin, Search } from 'lucide-react'

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  address: {
    house_number?: string
    road?: string
    city?: string
    town?: string
    village?: string
    postcode?: string
  }
}

interface Props {
  onSelect: (lat: number, lng: number, address: string) => void
  onClose: () => void
}

function formatStreet(r: NominatimResult): string {
  const a = r.address
  const num = a.house_number || ''
  const road = a.road || ''
  return [num, road].filter(Boolean).join(' ') || r.display_name.split(',')[0]
}

function formatCity(r: NominatimResult): string {
  const a = r.address
  const city = a.city || a.town || a.village || ''
  const postcode = a.postcode || ''
  return [city, postcode].filter(Boolean).join(' ')
}

function formatAddress(r: NominatimResult): string {
  const street = formatStreet(r)
  const city = formatCity(r)
  return [street, city].filter(Boolean).join(', ')
}

export default function AddressSearchModal({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 3) {
      setResults([])
      setSearched(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=7&countrycodes=ca&accept-language=fr-CA`,
          { headers: { 'User-Agent': 'MW-Porteaporte/1.0' } }
        )
        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
      } catch {
        setResults([])
      }
      setLoading(false)
      setSearched(true)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const handleSelect = (r: NominatimResult) => {
    onSelect(parseFloat(r.lat), parseFloat(r.lon), formatAddress(r))
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 9999 }}>
      <style>{`@keyframes mw-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{
        background: '#FFFFFF', width: '100%', borderRadius: '20px 20px 0 0',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        fontFamily: 'Inter, sans-serif',
      }}>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 2 }} />
        </div>

        {/* Search bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px 12px', borderBottom: '1px solid #F3F4F6' }}>
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={16} color="#9CA3AF" style={{ position: 'absolute', left: 12, pointerEvents: 'none' }} />
            {loading && (
              <div style={{
                position: 'absolute', right: 12, width: 16, height: 16,
                border: '2px solid #E5E7EB', borderTopColor: '#69C9CA',
                borderRadius: '50%', animation: 'mw-spin 0.7s linear infinite',
              }} />
            )}
            <input
              ref={inputRef}
              type="text"
              placeholder="Rechercher une adresse..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: '100%', padding: '11px 40px',
                border: '1.5px solid #E5E7EB', borderRadius: 10,
                fontSize: 15, color: '#111827', outline: 'none',
                fontFamily: 'Inter, sans-serif',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.target.style.borderColor = '#69C9CA' }}
              onBlur={e => { e.target.style.borderColor = '#E5E7EB' }}
            />
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#F3F4F6', border: 'none', borderRadius: '50%',
              width: 34, height: 34, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} color="#6B7280" />
          </button>
        </div>

        {/* Results list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {query.length >= 3 && searched && !loading && results.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
              Aucune adresse trouvée
            </div>
          )}
          {query.length < 3 && !searched && (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
              Entrez au moins 3 caractères
            </div>
          )}
          {results.map((r, i) => {
            const street = formatStreet(r)
            const city = formatCity(r)
            return (
              <button
                key={i}
                onClick={() => handleSelect(r)}
                style={{
                  width: '100%', background: 'none', border: 'none',
                  borderBottom: '1px solid #F9FAFB',
                  padding: '14px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  textAlign: 'left', fontFamily: 'Inter, sans-serif',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F9FAFB' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
              >
                <MapPin size={18} color="#69C9CA" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{street}</div>
                  {city && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{city}</div>}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
