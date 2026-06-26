'use client'
import { MapPin, AlertTriangle } from 'lucide-react'
import { useAddress } from '@/lib/hooks/useAddress'

interface Props {
  lat: number
  lng: number
}

export default function AddressDisplay({ lat, lng }: Props) {
  const { address, loading, error } = useAddress(lat, lng)

  if (loading) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#374151', fontSize: 12 }}>
        <MapPin size={13} color="#69C9CA" style={{ flexShrink: 0, animation: 'mw-pulse 1.2s ease-in-out infinite' }} />
        <style>{`@keyframes mw-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
        Chargement de l'adresse...
      </span>
    )
  }

  if (error || !address) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#374151', fontSize: 12 }}>
        <MapPin size={13} color="#69C9CA" style={{ flexShrink: 0 }} />
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </span>
    )
  }

  return (
    <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
      <MapPin size={13} color="#69C9CA" style={{ flexShrink: 0, marginTop: 2 }} />
      <span>
        {address.street && (
          <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#111827' }}>
            {address.street}
          </span>
        )}
        {(address.city || address.postcode) && (
          <span style={{ display: 'block', fontSize: 12, color: '#374151' }}>
            {[address.city, address.postcode].filter(Boolean).join(' ')}
          </span>
        )}
        {!address.street && !address.city && (
          <span style={{ fontSize: 12, color: '#374151' }}>
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>
        )}
        {address.approximate && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11, color: '#92400E', background: '#FEF3C7',
            borderRadius: 4, padding: '1px 6px', marginTop: 2,
          }}>
            <AlertTriangle size={10} />
            Adresse approximative — veuillez vérifier
          </span>
        )}
      </span>
    </span>
  )
}
