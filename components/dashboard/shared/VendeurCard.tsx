'use client'
import ProgressBar from '@/components/dashboard/shared/ProgressBar'

interface VendeurCardProps {
  vendeur: any
  onClick?: () => void
  objectifPortes?: number | null
  objectifVentes?: number | null
}

export default function VendeurCard({ vendeur, onClick, objectifPortes, objectifVentes }: VendeurCardProps) {
  const initials = (vendeur.full_name || '??').slice(0, 2).toUpperCase()
  const color = vendeur.color || '#69C9CA'
  const portes = vendeur.portes_aujourd_hui ?? 0
  const ventes = vendeur.ventes_aujourd_hui ?? 0
  const reponses = vendeur.reponses_aujourd_hui ?? null
  const montant = Number(vendeur.montant_aujourd_hui) || 0
  const totalPortes = vendeur.total_portes ?? 0
  const totalVentes = vendeur.total_ventes ?? 0
  const totalReponses = vendeur.total_reponses ?? 0

  // Taux de réponse (réponses / portes totaux)
  const tauxReponse = totalPortes > 0
    ? Math.round((totalReponses / totalPortes) * 1000) / 10
    : 0

  // Taux de closing RÉEL (ventes / réponses) — jamais division par zéro
  const tauxClosing = totalReponses > 0
    ? Math.round((totalVentes / totalReponses) * 1000) / 10
    : null

  const progressPortes = (objectifPortes ?? 0) > 0
    ? Math.min(Math.round((portes / objectifPortes!) * 100), 100)
    : null
  const progressVentes = (objectifVentes ?? 0) > 0
    ? Math.min(Math.round((ventes / objectifVentes!) * 100), 100)
    : null

  const hasObjectifs = progressPortes !== null || progressVentes !== null

  return (
    <div
      onClick={onClick}
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: '14px 16px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        fontFamily: 'Inter, sans-serif',
        transition: 'box-shadow 150ms ease',
      }}
      onMouseEnter={(e) => {
        if (onClick) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.10)'
      }}
      onMouseLeave={(e) => {
        if (onClick) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
      }}
    >
      {/* Row 1: Avatar + nom + stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: hasObjectifs ? 12 : 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#FFFFFF', fontWeight: 700, fontSize: 14, flexShrink: 0, letterSpacing: '0.02em',
        }}>
          {initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#111827', fontWeight: 600, fontSize: 14, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {vendeur.full_name}
          </p>
          <p style={{ color: '#374151', fontSize: 12, margin: 0 }}>
            {portes} portes
            {reponses !== null ? ` · ${reponses} rép.` : ''}
            {` · ${ventes} ventes`}
          </p>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ color: '#065F46', fontWeight: 700, fontSize: 14, margin: '0 0 2px' }}>
            {montant > 0 ? `${montant.toLocaleString('fr-CA')} $` : '—'}
          </p>
          <p style={{ color: '#374151', fontSize: 11, margin: 0 }}>
            {tauxClosing !== null ? `${tauxClosing}% clos.` : tauxReponse > 0 ? `${tauxReponse}% rép.` : '—'}
          </p>
        </div>
      </div>

      {/* Row 2: Progress bars objectifs */}
      {hasObjectifs && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {progressPortes !== null && (
            <ProgressBar
              value={progressPortes}
              color={color}
              height={5}
              animated
              label={`Portes : ${portes}/${objectifPortes}`}
            />
          )}
          {progressVentes !== null && (
            <ProgressBar
              value={progressVentes}
              color="#10B981"
              height={5}
              animated
              label={`Ventes : ${ventes}/${objectifVentes}`}
            />
          )}
        </div>
      )}
    </div>
  )
}
