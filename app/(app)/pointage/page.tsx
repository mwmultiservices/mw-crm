'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  getOpenTimesheet, clockIn, clockOut, getMyTimesheets, type TimesheetRow,
} from '@/lib/queries/payes'
import { mondayOf, hoursBetween, money2, formatWeekLabel } from '@/lib/payes'
import { Play, Square, Clock } from 'lucide-react'

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : '—'
const fmtDay = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' })

export default function PointagePage() {
  const [profileId, setProfileId] = useState<string | null>(null)
  const [hourlyRate, setHourlyRate] = useState(0)
  const [open, setOpen] = useState<TimesheetRow | null>(null)
  const [week, setWeek] = useState<TimesheetRow[]>([])
  const [note, setNote] = useState('')
  const [now, setNow] = useState(Date.now())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const weekOf = mondayOf()

  const refresh = async (pid: string) => {
    const [o, w] = await Promise.all([getOpenTimesheet(pid), getMyTimesheets(pid, weekOf)])
    setOpen(o)
    setWeek(w)
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      setProfileId(user.id)
      const { data: p } = await supabase.from('profiles').select('hourly_rate').eq('id', user.id).single()
      setHourlyRate(Number(p?.hourly_rate) || 0)
      await refresh(user.id)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // tic-tac pour le chrono en cours
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [open])

  const doClockIn = async () => {
    if (!profileId || busy) return
    setBusy(true)
    await clockIn(profileId, note)
    setNote('')
    await refresh(profileId)
    setBusy(false)
  }
  const doClockOut = async () => {
    if (!profileId || !open || busy) return
    setBusy(true)
    await clockOut(open, note)
    setNote('')
    await refresh(profileId)
    setBusy(false)
  }

  const totalHours = week.reduce((s, r) => s + (Number(r.hours) || 0), 0)
  const elapsed = open?.clock_in
    ? Math.floor((now - new Date(open.clock_in).getTime()) / 1000)
    : 0
  const hh = String(Math.floor(elapsed / 3600)).padStart(2, '0')
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontFamily: 'Inter, sans-serif' }}>Chargement…</div>

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', maxWidth: 560, margin: '0 auto', padding: '8px 4px 80px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Pointage</h1>
      <p style={{ color: '#6B7280', fontSize: 13, margin: '0 0 20px' }}>{formatWeekLabel(weekOf)}</p>

      {/* Carte clock */}
      <div style={{
        background: open ? 'linear-gradient(160deg, #064E3B, #065F46)' : '#FFFFFF',
        border: '1px solid #E5E7EB', borderRadius: 16, padding: 24, textAlign: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: 20,
      }}>
        {open ? (
          <>
            <div style={{ color: '#A7F3D0', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>En service depuis {fmtTime(open.clock_in)}</div>
            <div style={{ color: '#FFF', fontSize: 44, fontWeight: 800, fontVariantNumeric: 'tabular-nums', margin: '8px 0 16px' }}>{hh}:{mm}:{ss}</div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note de job (optionnel)…"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', fontSize: 14, marginBottom: 12 }} />
            <button onClick={doClockOut} disabled={busy} style={{ ...bigBtn, background: '#EF4444', color: '#FFF' }}>
              <Square size={18} fill="#FFF" />Clock out
            </button>
          </>
        ) : (
          <>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <Clock size={26} color="#10B981" />
            </div>
            <div style={{ color: '#111827', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Prêt à commencer</div>
            <div style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>Pointez en arrivant sur le chantier.</div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note de job (optionnel)…"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #D1D5DB', fontSize: 14, marginBottom: 12 }} />
            <button onClick={doClockIn} disabled={busy} style={{ ...bigBtn, background: '#10B981', color: '#FFF' }}>
              <Play size={18} fill="#FFF" />Clock in
            </button>
          </>
        )}
      </div>

      {/* Résumé semaine */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Ma semaine</h2>
        <div style={{ fontSize: 13, color: '#6B7280' }}>
          {totalHours.toFixed(1)} h{hourlyRate > 0 ? <> · <strong style={{ color: '#697035' }}>{money2(totalHours * hourlyRate)}</strong></> : null}
        </div>
      </div>

      <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
        {week.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Aucun pointage cette semaine.</div>
        ) : (
          week.map((r, i) => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 60px', gap: 8, padding: '10px 14px', borderTop: i ? '1px solid #F3F4F6' : 'none', fontSize: 13, alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: '#111827', textTransform: 'capitalize' }}>{fmtDay(r.date)}</span>
              <span style={{ color: '#6B7280' }}>{fmtTime(r.clock_in)}</span>
              <span style={{ color: '#6B7280' }}>{r.clock_out ? fmtTime(r.clock_out) : '…'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, color: '#697035' }}>
                {r.clock_out ? `${(Number(r.hours) || 0).toFixed(1)}h` : `${hoursBetween(r.clock_in, new Date().toISOString()).toFixed(1)}h`}
              </span>
            </div>
          ))
        )}
      </div>
      {hourlyRate === 0 && (
        <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 10 }}>Taux horaire non défini sur ton profil — la paye s&apos;affichera une fois réglé par un admin.</p>
      )}
    </div>
  )
}

const bigBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
  padding: '14px 20px', borderRadius: 12, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer',
}
