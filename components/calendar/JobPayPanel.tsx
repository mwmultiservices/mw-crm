'use client'
import { useEffect, useState } from 'react'
import { getProfilesWithRates } from '@/lib/queries/calendar'
import {
  payRatesOf, jobPayFor, PAY_MODE_BY_ID, money2, EMPTY_RATES,
  UPSELL_COUNTS_IN_JOB_BASE, type PayRates,
} from '@/lib/payes'
import { Wallet } from 'lucide-react'

// ============================================================
// « Ce que cette job paye » — applique la grille salariale 2026 de chaque
// assigné (lib/payes.ts) au prix de la job + ses upsells.
//   - mode % (vitres)   → montant versé PAR technicien sur le prix complet
//   - mode horaire      → temps de la job (jobs.pay_hours) × son taux horaire ;
//                         sans temps saisi, la paye vient des heures pointées
// L'employé (canEdit=false) ne voit QUE sa propre ligne ; l'admin voit tout.
// ============================================================

interface Props {
  job: {
    type: string | null
    service: string | null
    price: number | null
    pay_mode?: string | null
    assigned_ids?: string[] | null
    /** temps de la job en heures (modes horaires) */
    pay_hours?: number | null
  }
  /** vendeur (« closer ») crédité de la commission de vente */
  soldBy?: string | null
  /** somme des upsells enregistrés sur la job */
  upsellTotal?: number
  userId: string | null
  isAdmin: boolean
}

interface Line {
  id: string
  name: string
  rates: PayRates
}

export default function JobPayPanel({ job, soldBy = null, upsellTotal = 0, userId, isAdmin }: Props) {
  const [lines, setLines] = useState<Line[] | null>(null)
  const ids = job.assigned_ids ?? []
  // le vendeur n'est pas forcément assigné à la job : on charge sa grille aussi
  const key = [...new Set([...ids, ...(soldBy ? [soldBy] : [])])].join(',')

  useEffect(() => {
    const list = key ? key.split(',') : []
    if (list.length === 0) { setLines([]); return }
    let cancelled = false
    getProfilesWithRates(list).then((profs) => {
      if (cancelled) return
      setLines(profs.map((p) => ({
        id: p.id as string,
        name: (p.full_name as string) ?? '—',
        rates: payRatesOf(p),
      })))
    })
    return () => { cancelled = true }
  }, [key])

  if (!lines || lines.length === 0) return null

  const techLines = lines.filter((l) => ids.includes(l.id))
  const visible = isAdmin ? techLines : techLines.filter((l) => l.id === userId)
  const seller = soldBy ? lines.find((l) => l.id === soldBy) ?? null : null
  const sellerVisible = seller && (isAdmin || seller.id === userId)
  if (visible.length === 0 && !sellerVisible) return null

  const base = (Number(job.price) || 0) + (UPSELL_COUNTS_IN_JOB_BASE ? upsellTotal : 0)
  const jobForPay = { ...job, price: base }
  // mode de la job (le même pour tous les assignés) — pilote les messages du pied
  const jobMode = jobPayFor(jobForPay, EMPTY_RATES).mode
  // la commission de vente porte sur le prix de la job (les upsells ont leur
  // propre vendeur, crédité séparément par computeCommissions)
  const sellerAmount = seller ? Math.round((Number(job.price) || 0) * seller.rates.pct_vente) / 100 : 0

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
      <div style={sectionLabel}>
        <Wallet size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
        Ce que cette job paye
      </div>

      {visible.map((l) => {
        const { mode, amount, rate, hours } = jobPayFor(jobForPay, l.rates)
        const meta = PAY_MODE_BY_ID[mode]
        const hourly = meta.kind === 'hourly'
        const hourRate = l.rates[meta.rate]
        return (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid #F3F4F6', fontSize: 13 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: '#111827' }}>{l.name}{l.id === userId ? ' (moi)' : ''}</span>
              <span style={{ display: 'block', fontSize: 11, color: '#9CA3AF' }}>
                {hourly
                  ? hours > 0
                    ? `${meta.short} · ${hours} h × ${money2(hourRate)}/h`
                    : `${meta.short} — payé aux heures pointées${hourRate > 0 ? ` · ${money2(hourRate)}/h` : ''}`
                  : rate > 0
                    ? `${meta.short} · ${rate} % du prix complet`
                    : `${meta.short} — aucun % défini sur son profil`}
              </span>
            </div>
            <strong style={{ color: hourly ? '#697035' : '#0D6E6F', whiteSpace: 'nowrap' }}>
              {hourly && hours === 0 ? '⏱' : money2(amount)}
            </strong>
          </div>
        )
      })}

      {sellerVisible && seller && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid #F3F4F6', fontSize: 13 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600, color: '#111827' }}>{seller.name}{seller.id === userId ? ' (moi)' : ''}</span>
            <span style={{ display: 'block', fontSize: 11, color: '#9CA3AF' }}>
              {seller.rates.pct_vente > 0
                ? `Vendeur (closer) · ${seller.rates.pct_vente} % du prix de la job`
                : 'Vendeur (closer) — aucun % de vente défini sur son profil'}
            </span>
          </div>
          <strong style={{ color: '#8D5D36', whiteSpace: 'nowrap' }}>{money2(sellerAmount)}</strong>
        </div>
      )}

      {base > 0 && PAY_MODE_BY_ID[jobMode].kind === 'percent' && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9CA3AF', lineHeight: 1.45 }}>
          Base de calcul : {money2(base)}
          {upsellTotal > 0 && UPSELL_COUNTS_IN_JOB_BASE ? ` (prix ${money2(Number(job.price) || 0)} + upsells ${money2(upsellTotal)})` : ''}.
          {' '}Le montant est versé à CHAQUE technicien, sur le prix complet.
        </p>
      )}
      {base === 0 && PAY_MODE_BY_ID[jobMode].kind === 'percent' && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9CA3AF' }}>
          Prix de la job non renseigné — la commission s&apos;affichera une fois le prix entré.
        </p>
      )}
      {PAY_MODE_BY_ID[jobMode].kind === 'hourly' && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9CA3AF', lineHeight: 1.45 }}>
          {Number(job.pay_hours) > 0
            ? `Temps de la job : ${Number(job.pay_hours)} h, payées à CHAQUE employé assigné.`
            : 'Job payée à l\u2019heure — entre le temps de la job pour voir ce que chacun touche.'}
        </p>
      )}
    </div>
  )
}

const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }
