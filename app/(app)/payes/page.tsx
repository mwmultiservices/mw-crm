'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isManager } from '@/lib/roles'
import {
  getCommissions, markCommissionPaid, computeCommissions,
  getTimesheetsWeek, markTimesheetsPaid,
  getMyCommission, getMyTimesheets, getDoneJobs,
  type CommissionRow, type EmployeeHours, type TimesheetRow, type DoneJobRow,
} from '@/lib/queries/payes'
import { mondayOf, addWeeks, formatWeekLabel, periodStartOf, formatPeriodLabel, money, money2 } from '@/lib/payes'
import { ChevronLeft, ChevronRight, RefreshCw, Check, Send } from 'lucide-react'

export default function PayesPage() {
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setRole(data?.role ?? 'rep')
      setLoading(false)
    })
  }, [])

  if (loading) return <div style={page}><div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement…</div></div>

  return (
    <div style={page}>
      {isManager(role) ? <AdminPayes userId={userId!} /> : <PersoPayes profileId={userId!} role={role ?? 'rep'} />}
    </div>
  )
}

// ============================================================
// VUE ADMIN — datasheets commissions + heures, à la semaine OU
// à la période de paye de 2 semaines (ex. 3 au 16 août).
// ============================================================

// Lignes de commissions fusionnées sur la période (1 ligne DB par semaine).
interface MergedComm {
  key: string
  profile_id: string
  type: string
  name: string | null
  sales: number
  rate: number
  commission: number
  jobs: number
  deals: number
  bonus: number
  paid: boolean
  ids: string[]
}

function AdminPayes({ userId }: { userId: string }) {
  const [mode, setMode] = useState<'week' | 'period'>('week')
  const [weekOf, setWeekOf] = useState(mondayOf())
  const [tab, setTab] = useState<'comm' | 'hours'>('comm')
  const [rawComms, setRawComms] = useState<CommissionRow[]>([])
  const [hours, setHours] = useState<EmployeeHours[]>([])
  const [doneJobs, setDoneJobs] = useState<DoneJobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [sendingSms, setSendingSms] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [openRow, setOpenRow] = useState<string | null>(null)

  const period = mode === 'period'
  const weekB = addWeeks(weekOf, 1)

  const load = useCallback(async () => {
    setLoading(true)
    const [cA, cB, hA, hB, dj] = await Promise.all([
      getCommissions(weekOf),
      period ? getCommissions(weekB) : Promise.resolve([] as CommissionRow[]),
      getTimesheetsWeek(weekOf),
      period ? getTimesheetsWeek(weekB) : Promise.resolve([] as EmployeeHours[]),
      getDoneJobs(weekOf, period ? 2 : 1),
    ])
    setRawComms([...cA, ...cB])
    // fusionne les heures des 2 semaines par employé
    const byId = new Map<string, EmployeeHours>()
    for (const e of [...hA, ...hB]) {
      const ex = byId.get(e.profile_id)
      if (!ex) byId.set(e.profile_id, { ...e, rows: [...e.rows] })
      else {
        ex.rows.push(...e.rows)
        ex.totalHours = Math.round((ex.totalHours + e.totalHours) * 100) / 100
        ex.pay = Math.round((ex.pay + e.pay) * 100) / 100
        ex.paid = ex.paid && e.paid
      }
    }
    setHours([...byId.values()])
    setDoneJobs(dj)
    setLoading(false)
  }, [weekOf, weekB, period])

  useEffect(() => { load() }, [load])

  const switchMode = (m: 'week' | 'period') => {
    setMode(m)
    if (m === 'period') setWeekOf(periodStartOf(weekOf))
  }

  const recompute = async () => {
    setComputing(true)
    const r1 = await computeCommissions(weekOf)
    const r2 = period ? await computeCommissions(weekB) : null
    setComputing(false)
    setMsg(`Recalculé : ${r1.reps + (r2?.reps ?? 0)} ligne(s) rep, ${r1.techs + (r2?.techs ?? 0)} ligne(s) tech`)
    setTimeout(() => setMsg(null), 3000)
    load()
  }

  const sendList = async () => {
    setSendingSms(true)
    try {
      const res = await fetch('/api/payes/sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: userId, week_of: weekOf, weeks: period ? 2 : 1 }),
      })
      const data = await res.json()
      setMsg(res.ok ? 'Liste des salaires envoyée par texto 📱' : `Texto : ${data.error ?? 'erreur'}`)
    } catch {
      setMsg('Texto : envoi impossible')
    }
    setSendingSms(false)
    setTimeout(() => setMsg(null), 4000)
  }

  const merged = useMemo(() => {
    const m = new Map<string, MergedComm>()
    for (const c of rawComms) {
      const k = `${c.profile_id}:${c.type}`
      const e = m.get(k)
      if (!e) {
        m.set(k, {
          key: k, profile_id: c.profile_id, type: c.type, name: c.profiles?.full_name ?? null,
          sales: Number(c.sales_amount) || 0, rate: Number(c.rate) || 0, commission: Number(c.commission_amount) || 0,
          jobs: c.jobs_count || 0, deals: c.deals_closed || 0, bonus: Number(c.bonus) || 0, paid: c.paid, ids: [c.id],
        })
      } else {
        e.sales += Number(c.sales_amount) || 0
        e.commission += Number(c.commission_amount) || 0
        e.jobs += c.jobs_count || 0
        e.deals += c.deals_closed || 0
        e.bonus += Number(c.bonus) || 0
        e.paid = e.paid && c.paid
        e.ids.push(c.id)
      }
    }
    return [...m.values()].sort((a, b) => b.commission - a.commission)
  }, [rawComms])

  const reps = merged.filter((c) => c.type === 'rep')
  const techs = merged.filter((c) => c.type === 'tech')

  const totalDue = merged.filter((c) => !c.paid).reduce((s, c) => s + c.commission + c.bonus, 0)
    + hours.filter((h) => !h.paid).reduce((s, h) => s + h.pay, 0)
  const totalAll = merged.reduce((s, c) => s + c.commission + c.bonus, 0) + hours.reduce((s, h) => s + h.pay, 0)

  const togglePaid = async (c: MergedComm) => {
    const target = !c.paid
    await Promise.all(c.ids.map((id) => markCommissionPaid(id, target)))
    setRawComms((prev) => prev.map((x) => (c.ids.includes(x.id) ? { ...x, paid: target } : x)))
  }
  const toggleHoursPaid = async (e: EmployeeHours) => {
    const target = !e.paid
    await markTimesheetsPaid(e.profile_id, weekOf, target)
    if (period) await markTimesheetsPaid(e.profile_id, weekB, target)
    setHours((prev) => prev.map((x) => (x.profile_id === e.profile_id ? { ...x, paid: target } : x)))
  }

  const jobsOf = (profileId: string) => doneJobs.filter((j) => j.assigned_ids?.includes(profileId))

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Payes</h1>
        <div style={{ display: 'flex', gap: 4, background: '#F3F4F6', borderRadius: 999, padding: 3 }}>
          {([['week', 'Semaine'], ['period', '2 semaines']] as const).map(([m, l]) => (
            <button key={m} onClick={() => switchMode(m)} style={{
              padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: mode === m ? '#111827' : 'transparent', color: mode === m ? '#FFF' : '#6B7280',
            }}>{l}</button>
          ))}
        </div>
        <PeriodNav weekOf={weekOf} mode={mode} onChange={setWeekOf} />
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button onClick={sendList} disabled={sendingSms} style={{ ...btn, background: '#111827', color: '#FFF' }}>
            <Send size={14} />{sendingSms ? '…' : 'Liste par texto'}
          </button>
          {tab === 'comm' && (
            <button onClick={recompute} disabled={computing} style={btn}>
              <RefreshCw size={15} />{computing ? 'Calcul…' : period ? 'Recalculer la période' : 'Recalculer la semaine'}
            </button>
          )}
        </div>
      </div>

      {/* total à payer */}
      {!loading && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 150, background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>À payer ({period ? '2 sem.' : 'semaine'})</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: totalDue > 0 ? '#B45309' : '#10B981' }}>{money(totalDue)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 150, background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total payes {period ? 'de la période' : 'de la semaine'}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0D6E6F' }}>{money(totalAll)}</div>
          </div>
        </div>
      )}

      {msg && <div style={{ background: '#D1FAE5', color: '#065F46', padding: 10, borderRadius: 10, fontSize: 13, marginBottom: 12 }}>{msg}</div>}

      {/* onglets */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <Tab active={tab === 'comm'} onClick={() => setTab('comm')}>Commissions</Tab>
        <Tab active={tab === 'hours'} onClick={() => setTab('hours')}>Heures paysagement</Tab>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement…</div>
      ) : tab === 'comm' ? (
        <>
          <SectionTitle>Reps & ventes</SectionTitle>
          {reps.length === 0 ? <Empty text="Aucune commission rep. Clique « Recalculer »." /> : (
            <Card>
              <Header cols="1fr 90px 56px 90px 70px 110px" labels={['Employé', 'Ventes', 'Taux', 'Commission', 'Bonus', '']} />
              {reps.map((c) => (
                <Row key={c.key} cols="1fr 90px 56px 90px 70px 110px">
                  <NameCell name={c.name} sub={`${c.deals} vente(s)`} />
                  <span>{money(c.sales)}</span>
                  <Badge>{c.rate}%</Badge>
                  <strong style={{ color: '#0D6E6F' }}>{money(c.commission)}</strong>
                  <span>{c.bonus > 0 ? <Badge green>+{money(c.bonus)}</Badge> : '—'}</span>
                  <PayBtn paid={c.paid} onClick={() => togglePaid(c)} />
                </Row>
              ))}
            </Card>
          )}

          <SectionTitle>Techniciens fenêtres (18%)</SectionTitle>
          {techs.length === 0 ? <Empty text="Aucune commission tech (jobs fenêtres « done » de la période)." /> : (
            <Card>
              <Header cols="1fr 70px 90px 90px 110px" labels={['Employé', 'Jobs', 'Revenu', 'Commission', '']} />
              {techs.map((c) => (
                <div key={c.key}>
                  <div role="button" tabIndex={0} onClick={() => setOpenRow(openRow === c.key ? null : c.key)} style={{ cursor: 'pointer' }}>
                    <Row cols="1fr 70px 90px 90px 110px">
                      <NameCell name={c.name} sub={`Tech fenêtres · ${openRow === c.key ? 'replier' : 'voir les jobs'}`} />
                      <span>{c.jobs}</span>
                      <span>{money(c.sales)}</span>
                      <strong style={{ color: '#0D6E6F' }}>{money(c.commission)}</strong>
                      <PayBtn paid={c.paid} onClick={(ev) => { ev.stopPropagation(); togglePaid(c) }} />
                    </Row>
                  </div>
                  {openRow === c.key && <JobsDetail jobs={jobsOf(c.profile_id)} />}
                </div>
              ))}
            </Card>
          )}
        </>
      ) : (
        <HoursDatasheet hours={hours} onTogglePaid={toggleHoursPaid} jobsOf={jobsOf} />
      )}
    </>
  )
}

// Détail « toutes les jobs faites » d'un employé sur la période.
function JobsDetail({ jobs }: { jobs: DoneJobRow[] }) {
  if (!jobs.length) return <div style={{ padding: '4px 14px 12px', background: '#F9FAFB', fontSize: 12, color: '#9CA3AF' }}>Aucun job « complété » assigné sur la période.</div>
  return (
    <div style={{ padding: '0 14px 12px', background: '#F9FAFB' }}>
      {jobs.map((j) => {
        const n = j.assigned_ids?.length || 1
        const share = (Number(j.price) || 0) / n
        return (
          <div key={j.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px 90px', gap: 8, padding: '6px 0', fontSize: 12, color: '#6B7280', borderTop: '1px solid #F3F4F6' }}>
            <span style={{ textTransform: 'capitalize', fontWeight: 600, color: '#374151' }}>
              {j.start_at ? new Date(j.start_at).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
            </span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {j.type === 'fenetre' ? '🪟' : j.type === 'gazon' ? '🌿' : '🔨'} {j.title || j.service || 'Job'}
            </span>
            <span>{money(Number(j.price) || 0)}{n > 1 ? ` ÷${n}` : ''}</span>
            <span style={{ textAlign: 'right', fontWeight: 700, color: '#0D6E6F' }}>{money(share)}</span>
          </div>
        )
      })}
    </div>
  )
}

function PeriodNav({ weekOf, mode, onChange }: { weekOf: string; mode: 'week' | 'period'; onChange: (w: string) => void }) {
  const step = mode === 'period' ? 2 : 1
  const label = mode === 'period' ? formatPeriodLabel(weekOf) : formatWeekLabel(weekOf)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={() => onChange(addWeeks(weekOf, -step))} style={navBtn} aria-label="Précédent"><ChevronLeft size={16} /></button>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', minWidth: 170, textAlign: 'center' }}>{label}</span>
      <button onClick={() => onChange(addWeeks(weekOf, step))} style={navBtn} aria-label="Suivant"><ChevronRight size={16} /></button>
    </div>
  )
}

function HoursDatasheet({ hours, onTogglePaid, jobsOf }: {
  hours: EmployeeHours[]
  onTogglePaid: (e: EmployeeHours) => void
  jobsOf: (profileId: string) => DoneJobRow[]
}) {
  const [open, setOpen] = useState<string | null>(null)
  if (hours.length === 0) return <Empty text="Aucune heure pointée sur la période." />
  return (
    <Card>
      {hours.map((e, i) => (
        <div key={e.profile_id} style={{ borderTop: i ? '1px solid #F3F4F6' : 'none' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 90px 110px', gap: 8, padding: '12px 14px', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setOpen(open === e.profile_id ? null : e.profile_id)}>
            <NameCell name={e.name} sub={`${e.hourly_rate > 0 ? money2(e.hourly_rate) + '/h' : 'taux non défini'}`} />
            <span style={{ fontSize: 13 }}>{e.totalHours.toFixed(1)}h</span>
            <strong style={{ color: '#697035' }}>{money2(e.pay)}</strong>
            <PayBtn paid={e.paid} onClick={(ev) => { ev.stopPropagation(); onTogglePaid(e) }} />
          </div>
          {open === e.profile_id && (
            <>
              <div style={{ padding: '0 14px 12px', background: '#F9FAFB' }}>
                {e.rows.map((r) => (
                  <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 60px', gap: 8, padding: '6px 0', fontSize: 12, color: '#6B7280' }}>
                    <span style={{ textTransform: 'capitalize', fontWeight: 600, color: '#374151' }}>{new Date(r.date + 'T00:00:00').toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <span>{r.clock_in ? new Date(r.clock_in).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                    <span>{r.clock_out ? new Date(r.clock_out).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                    <span style={{ textAlign: 'right', fontWeight: 700, color: '#697035' }}>{(Number(r.hours) || 0).toFixed(1)}h</span>
                  </div>
                ))}
              </div>
              {jobsOf(e.profile_id).length > 0 && (
                <>
                  <div style={{ padding: '6px 14px 0', background: '#F9FAFB', fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Jobs complétés (période)</div>
                  <JobsDetail jobs={jobsOf(e.profile_id)} />
                </>
              )}
            </>
          )}
        </div>
      ))}
    </Card>
  )
}

// ============================================================
// VUE PERSO — mes commissions / ma paye
// ============================================================
function PersoPayes({ profileId, role }: { profileId: string; role: string }) {
  const [weekOf, setWeekOf] = useState(mondayOf())
  const [comm, setComm] = useState<CommissionRow[]>([])
  const [ts, setTs] = useState<TimesheetRow[]>([])
  const [rate, setRate] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getMyCommission(profileId, weekOf),
      getMyTimesheets(profileId, weekOf),
      supabase.from('profiles').select('hourly_rate').eq('id', profileId).single(),
    ]).then(([c, t, p]) => {
      setComm(c)
      setTs(t)
      setRate(Number(p.data?.hourly_rate) || 0)
      setLoading(false)
    })
  }, [profileId, weekOf])

  const totalHours = ts.reduce((s, r) => s + (Number(r.hours) || 0), 0)
  const totalComm = comm.reduce((s, c) => s + (Number(c.commission_amount) || 0) + (Number(c.bonus) || 0), 0)
  const isTerrain = role === 'terrain'

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Ma paye</h1>
        <WeekNav weekOf={weekOf} onChange={setWeekOf} />
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement…</div> : (
        <>
          {/* commissions (rep/tech) */}
          {!isTerrain && (
            <>
              <SectionTitle>Mes commissions</SectionTitle>
              {comm.length === 0 ? <Empty text="Aucune commission pour cette semaine." /> : (
                <Card>
                  <div style={{ padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total semaine</div>
                    <div style={{ fontSize: 34, fontWeight: 800, color: '#0D6E6F', margin: '4px 0 2px' }}>{money(totalComm)}</div>
                    {comm.map((c) => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#374151', padding: '8px 0', borderTop: '1px solid #F3F4F6' }}>
                        <span>{c.type === 'tech' ? `${c.jobs_count} job(s) · 18%` : `${c.deals_closed} vente(s) · ${money(c.sales_amount)} @ ${c.rate}%`}</span>
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <strong>{money(c.commission_amount + (c.bonus || 0))}</strong>
                          <Badge green={c.paid}>{c.paid ? 'Payé ✓' : 'En attente'}</Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}

          {/* heures (terrain ou capacité paysagement) */}
          {(isTerrain || ts.length > 0) && (
            <>
              <SectionTitle>Mes heures{rate > 0 ? ` · ${money2(rate)}/h` : ''}</SectionTitle>
              {ts.length === 0 ? <Empty text="Aucune heure pointée cette semaine." /> : (
                <Card>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: '#697035' }}>{money2(totalHours * rate)}</span>
                      <span style={{ fontSize: 13, color: '#6B7280' }}>{totalHours.toFixed(1)} h</span>
                    </div>
                    {ts.map((r) => (
                      <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 56px', gap: 8, padding: '6px 0', fontSize: 12, color: '#6B7280', borderTop: '1px solid #F3F4F6' }}>
                        <span style={{ textTransform: 'capitalize', fontWeight: 600, color: '#374151' }}>{new Date(r.date + 'T00:00:00').toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                        <span>{r.clock_in ? new Date(r.clock_in).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                        <span>{r.clock_out ? new Date(r.clock_out).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                        <span style={{ textAlign: 'right', fontWeight: 700, color: '#697035' }}>{(Number(r.hours) || 0).toFixed(1)}h</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </>
  )
}

// ============================================================
// Petits composants UI
// ============================================================
const page: React.CSSProperties = { fontFamily: 'Inter, sans-serif', maxWidth: 900, margin: '0 auto', padding: '12px 16px 84px' }

function WeekNav({ weekOf, onChange }: { weekOf: string; onChange: (w: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={() => onChange(addWeeks(weekOf, -1))} style={navBtn} aria-label="Semaine précédente"><ChevronLeft size={16} /></button>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', minWidth: 170, textAlign: 'center' }}>{formatWeekLabel(weekOf)}</span>
      <button onClick={() => onChange(addWeeks(weekOf, 1))} style={navBtn} aria-label="Semaine suivante"><ChevronRight size={16} /></button>
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
      background: active ? '#111827' : '#F3F4F6', color: active ? '#FFF' : '#374151',
    }}>{children}</button>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '20px 0 10px' }}>{children}</h2>
}
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>{children}</div>
}
function Empty({ text }: { text: string }) {
  return <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>{text}</div>
}
function Header({ cols, labels }: { cols: string; labels: string[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '8px 14px', background: '#F9FAFB', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {labels.map((l, i) => <span key={i} style={{ textAlign: i === 0 ? 'left' : 'left' }}>{l}</span>)}
    </div>
  )
}
function Row({ cols, children }: { cols: string; children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '10px 14px', borderTop: '1px solid #F3F4F6', fontSize: 13, alignItems: 'center', color: '#374151' }}>{children}</div>
}
function NameCell({ name, sub }: { name?: string | null; sub?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{sub}</div>}
    </div>
  )
}
function Badge({ children, green }: { children: React.ReactNode; green?: boolean }) {
  return <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: green ? '#D1FAE5' : '#F3F4F6', color: green ? '#065F46' : '#6B7280' }}>{children}</span>
}
function PayBtn({ paid, onClick }: { paid: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center', padding: '6px 10px', borderRadius: 8,
      border: paid ? 'none' : '1px solid #D1D5DB', cursor: 'pointer', fontSize: 12, fontWeight: 600,
      background: paid ? '#D1FAE5' : '#FFF', color: paid ? '#065F46' : '#374151', whiteSpace: 'nowrap',
    }}>
      {paid ? <><Check size={13} />Payé</> : 'Marquer payé'}
    </button>
  )
}

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
const navBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8,
  border: '1px solid #D1D5DB', background: '#FFF', cursor: 'pointer', color: '#374151',
}
