'use client'
import { useEffect, useState } from 'react'
import { getMyJobEarnings, type MyJobEarnings } from '@/lib/queries/payes'
import { money2, PAY_MODE_BY_ID, type PayRates } from '@/lib/payes'
import { Briefcase } from 'lucide-react'

// ============================================================
// « Mes jobs de la semaine » — vue employé, en temps réel.
// Dès qu'une job lui est assignée (ou qu'il en est le vendeur), elle apparaît
// ici classée dans SA catégorie de paye : commission de vitres, commission de
// vente, ou heures (payées au pointage). Les mêmes règles que le calcul admin
// (computeCommissions), mais sans attendre que la direction le lance.
// ============================================================

interface Props {
  profileId: string
  weekOf: string
  rates: PayRates
  /** compact : version resserrée pour le profil */
  compact?: boolean
}

export default function MyJobsEarnings({ profileId, weekOf, rates, compact = false }: Props) {
  const [data, setData] = useState<MyJobEarnings | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    getMyJobEarnings(profileId, weekOf, rates).then((d) => { if (!cancelled) setData(d) })
    return () => { cancelled = true }
    // rates : objet recréé à chaque rendu du parent → on suit ses valeurs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // (les taux horaires comptent aussi depuis que le temps de la job est payé)
  }, [profileId, weekOf, rates.pct_vente, rates.pct_vitres_solo, rates.pct_vitres_ext_equipe,
    rates.pct_vitres_int_ext_equipe, rates.rate_paysagement, rates.rate_commercial])

  if (!data) return <p style={hint}>Chargement des jobs…</p>
  if (data.lines.length === 0) {
    return <p style={hint}>Aucune job assignée cette semaine.</p>
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <Tile label="Jobs faites" value={money2(data.doneTotal)} color="#0D6E6F" />
        <Tile label="À venir" value={money2(data.upcomingTotal)} color="#697035" />
        {data.hourlyTotal > 0 && <Tile label="À l'heure" value={money2(data.hourlyTotal)} color="#8D5D36" />}
      </div>

      <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '2px 12px' }}>
        {data.lines.map((l) => {
          const isUpsell = l.key.startsWith('upsell:')
          const meta = PAY_MODE_BY_ID[l.mode]
          const cat = l.category === 'heures'
            ? l.hours > 0
              ? `${meta?.short ?? 'Horaire'} · ${l.hours} h × ${money2(l.rate)}/h`
              : `${meta?.short ?? 'Horaire'} · payé au pointage`
            : l.as === 'vendeur'
              ? `${isUpsell ? 'Upsell vendu' : 'Vente (closer)'} · ${l.rate} % de ${money2(l.base)}`
              : `${meta?.short ?? 'Commission'} · ${l.rate} % de ${money2(l.base)}`
          return (
            <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid #F3F4F6', fontSize: 13 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.title || 'Job'}
                  {!l.done && <span style={badge}>à venir</span>}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: '#9CA3AF' }}>
                  {l.start_at ? new Date(l.start_at).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'} · {cat}
                </span>
              </div>
              <strong style={{ whiteSpace: 'nowrap', color: l.category === 'heures' ? '#697035' : l.done ? '#0D6E6F' : '#9CA3AF' }}>
                {l.category === 'heures' && l.hours === 0 ? '⏱' : money2(l.amount)}
              </strong>
            </div>
          )
        })}
      </div>

      {!compact && (
        <p style={{ ...hint, marginTop: 8 }}>
          <Briefcase size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
          Montants calculés avec ta grille de paye. Ils passent en commission officielle
          quand la direction fait le calcul de la semaine.
          {data.hourlyJobs > 0 && (data.hourlyTotal > 0
            ? ` Les jobs à l'heure utilisent le temps inscrit sur la job par la direction.`
            : ` ${data.hourlyJobs} job(s) à l'heure : voir tes heures pointées.`)}
        </p>
      )}
    </div>
  )
}

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ flex: 1, background: '#F9FAFB', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

const hint: React.CSSProperties = { fontSize: 11, color: '#9CA3AF', margin: 0, lineHeight: 1.5 }
const badge: React.CSSProperties = {
  marginLeft: 6, padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700,
  background: '#F3F4F6', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em',
}
