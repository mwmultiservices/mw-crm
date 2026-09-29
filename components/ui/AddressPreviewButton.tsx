'use client'
import { MapPin } from 'lucide-react'

// ============================================================
// Bouton « Prévisualiser l'adresse » sous le champ Adresse d'un client.
// Ouvre une RECHERCHE Google Maps (pas un itinéraire) : on voit où Google
// place l'adresse, on corrige au besoin, puis on recopie l'adresse complète
// (numéro, rue, ville, code postal) dans le CRM — c'est elle qui sert
// ensuite aux itinéraires et à l'optimisation des routes.
//
// `parts` = les morceaux saisis (adresse, ville, code postal…) ; les vides
// sont ignorés. Sans adresse, le bouton est grisé.
//
// Utilisé par : ClientModal (/clients), NewClientModal (calendrier),
// TerrainModal (/gazon), ClientModal de Run fermeture.
// ============================================================

export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export default function AddressPreviewButton({ parts }: { parts: (string | null | undefined)[] }) {
  const query = parts.map((p) => (p ?? '').trim()).filter(Boolean).join(', ')
  const enabled = !!query

  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginTop: 6, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    textDecoration: 'none',
    border: `1px solid ${enabled ? '#69C9CA' : '#E5E7EB'}`,
    background: enabled ? '#69C9CA14' : '#F9FAFB',
    color: enabled ? '#0E6B6E' : '#9CA3AF',
    cursor: enabled ? 'pointer' : 'not-allowed',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {enabled ? (
        <a href={mapsSearchUrl(query)} target="_blank" rel="noopener noreferrer" style={style}>
          <MapPin size={14} />Prévisualiser l&apos;adresse
        </a>
      ) : (
        <span style={style} aria-disabled="true"><MapPin size={14} />Prévisualiser l&apos;adresse</span>
      )}
      <span style={{ marginTop: 4, fontSize: 11, color: '#6B7280', lineHeight: 1.4 }}>
        Vérifie sur Google Maps, puis copie-colle l&apos;adresse complète ici.
      </span>
    </div>
  )
}
