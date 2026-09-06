'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getMyCommission, getMyTimesheets, timesheetPay, timesheetIsHourly,
  type CommissionRow, type TimesheetRow,
} from '@/lib/queries/payes'
import {
  payRatesOf, PAY_RATE_FIELDS, hasRates, mondayOf, addWeeks, formatWeekLabel,
  money2, WORK_TYPES, hourlyRateFor,
} from '@/lib/payes'
import SettingsSection from './SettingsSection'
import { ChevronLeft, ChevronRight, Wallet } from 'lucide-react'

// ============================================================
// « Mon salaire » — visible par TOUT employé dans son profil.
//   1. ce qu'il a gagné sur la semaine (commissions + heures)
//   2. sa grille de paye (taux et %) telle que réglée par la direction
// Lecture seule : les taux se modifient dans Profil → Équipe (admin).
// ============================================================

interface Props {
  profile: Record<string, unknown> & { id: string }
}

export default function MySalarySection({ profile }: Props) {
  const rates = payRatesOf(profile)
  const [weekOf, setWeekOf] = useState(mondayOf())
  const [comm, setComm] = useState<CommissionRow[]>([])
  const [ts, setTs] = useState<TimesheetRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      getMyCommission(profile.id, weekOf),
      getMyTimesheets(profile.id, weekOf),
    ]).then(([c, t]) => {
      if (cancelled) return
      setComm(c)
      setTs(t)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [profile.id, weekOf])

  const commTotal = comm.reduce((s, c) => s + (Number(c.commission_amount) || 0) + (Number(c.bonus) || 0), 0)
  const hourPay = ts.reduce((s, r) => s + timesheetPay(r, rates), 0)
  const hours = ts.reduce((s, r) => s + (Number(r.hours) || 0), 0)
  const total = commTotal + hourPay
  const activeFields = PAY_RATE_FIELDS.filter((f) => rates[f.key] > 0)

  return (
    <SettingsSection title="Mon salaire" description="Ce que j'ai gagné et mes taux">
      {/* ── semaine ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setWeekOf(addWeeks(weekOf, -1))} style={navBtn} aria-label="Semaine précédente"><ChevronLeft size={15} /></button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#374151' }}>{formatWeekLabel(weekOf)}</span>
        <button onClick={() => setWeekOf(addWeeks(weekOf, 1))} style={navBtn} aria-label="Semaine suivante"><ChevronRight size={15} /></button>
      </div>

      <div style={{
        background: 'linear-gradient(160deg, #06363B, #0D6E6F)', borderRadius: 12,
        padding: '16px 18px', color: '#FFF', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#A7F3D0' }}>
          <Wallet size={13} />Total de la semaine
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' }}>
          {loading ? '…' : money2(total)}
        </div>
        {!loading && (
          <div style={{ fontSize: 12, color: '#A7F3D0', marginTop: 2 }}>
            {money2(hourPay)} en heures ({hours.toFixed(1)} h) · {money2(commTotal)} en commissions
          </div>
        )}
      </div>

      {!loading && (comm.length > 0 || ts.length > 0) && (
        <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '4px 12px', marginBottom: 12 }}>
          {comm.map((c) => (
            <Line
              key={c.id}
              label={
                c.type === 'vitres' || c.type === 'tech' ? `${c.jobs_count} job(s) de vitres · ${c.rate} %`
                  : c.type === 'override' ? `Override équipe · ${c.deals_closed} vente(s)`
                    : `${c.deals_closed} vente(s) · ${c.rate} %`
              }
              sub={c.paid ? 'Payé ✓' : 'En attente'}
              value={money2((Number(c.commission_amount) || 0) + (Number(c.bonus) || 0))}
            />
          ))}
          {ts.map((r) => (
            <Line
              key={r.id}
              label={new Date(r.date + 'T00:00:00').toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'short' })}
              sub={timesheetIsHourly(r)
                ? `${(Number(r.hours) || 0).toFixed(1)} h · ${money2(hourlyRateFor(r.work_type, rates))}/h · ${WORK_TYPES.find((w) => w.id === (r.work_type ?? 'paysagement'))?.label ?? 'Paysagement'}`
                : `${(Number(r.hours) || 0).toFixed(1)} h · payé à la commission (job de vitres)`}
              value={timesheetIsHourly(r) ? money2(timesheetPay(r, rates)) : '—'}
            />
          ))}
        </div>
      )}
      {!loading && comm.length === 0 && ts.length === 0 && (
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 12px', textAlign: 'center' }}>
          Rien d&apos;enregistré pour cette semaine.
        </p>
      )}

      <Link href="/payes" style={{
        display: 'block', textAlign: 'center', padding: '9px 12px', borderRadius: 10,
        background: '#F3F4F6', color: '#374151', fontSize: 13, fontWeight: 700,
        textDecoration: 'none', marginBottom: 16,
      }}>
        Voir le détail de mes payes
      </Link>

      {/* ── grille de paye ──────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Ma grille de paye
      </div>
      {hasRates(rates) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeFields.map((f) => (
            <div key={f.key} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: '#F9FAFB', borderRadius: 10, padding: '10px 12px',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: '#111827', fontWeight: 600, fontSize: 13, margin: 0 }}>{f.label}</p>
                <p style={{ color: '#9CA3AF', fontSize: 11, margin: '1px 0 0', lineHeight: 1.35 }}>{f.hint}</p>
              </div>
              <span style={{
                color: '#0D6E6F', fontWeight: 800, fontSize: 17, flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {f.unit === '%' ? `${rates[f.key]} %` : `${money2(rates[f.key])}/h`}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0, lineHeight: 1.5 }}>
          Aucun taux enregistré sur ton profil pour l&apos;instant — la direction le règle
          dans Profil → Équipe, et il apparaîtra ici automatiquement.
        </p>
      )}
    </SettingsSection>
  )
}

function Line({ label, sub, value }: { label: string; sub: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid #F3F4F6', fontSize: 13 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, color: '#111827', textTransform: 'capitalize' }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11, color: '#9CA3AF' }}>{sub}</span>
      </div>
      <strong style={{ color: '#0D6E6F', whiteSpace: 'nowrap' }}>{value}</strong>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8,
  border: '1px solid #D1D5DB', background: '#FFF', cursor: 'pointer', color: '#374151', flexShrink: 0,
}
