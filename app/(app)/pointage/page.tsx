'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  getOpenTimesheet, clockIn, clockOut, getMyTimesheets, timesheetPay, timesheetIsHourly,
  type TimesheetRow,
} from '@/lib/queries/payes'
import { getMyJobsForDay, jobLabel, jobDirectionsUrl, type Job } from '@/lib/queries/calendar'
import {
  mondayOf, hoursBetween, money2, formatWeekLabel,
  payRatesOf, hourlyRateFor, jobPayFor, PAY_MODE_BY_ID, autoPayMode,
  WORK_TYPES, EMPTY_RATES, type PayRates, type WorkType,
} from '@/lib/payes'
import FactureModal from '@/components/factures/FactureModal'
import { Play, Square, Clock, Navigation, Camera } from 'lucide-react'

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : '—'
const fmtDay = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' })
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Mode de paye effectif d'une job (celui fixé par l'admin, sinon déduit). */
function payModeOf(j: Job) {
  return (j.pay_mode as ReturnType<typeof autoPayMode> | null) ||
    autoPayMode(j.type, j.service, j.assigned_ids?.length ?? 0)
}

/**
 * Ce que la job rapporte à l'employé : un montant pour les jobs payées au %
 * (vitres), un taux horaire pour les jobs payées aux heures pointées.
 */
function payPreview(j: Job, rates: PayRates): { text: string; percent: boolean } {
  const { mode, amount, rate, hours } = jobPayFor(j, rates)
  const meta = PAY_MODE_BY_ID[mode]
  if (meta.kind === 'hourly') {
    const h = hourlyRateFor(mode === 'commercial' ? 'commercial' : 'paysagement', rates)
    // temps de la job inscrit par la direction → on montre ce qu'elle paye
    if (hours > 0 && h > 0) return { text: `${money2(amount)} · ${hours} h`, percent: false }
    return { text: h > 0 ? `${money2(h)}/h` : 'aux heures', percent: false }
  }
  if (!j.price) return { text: `${rate || '—'} % (prix à venir)`, percent: true }
  return { text: `${money2(amount)} · ${rate} %`, percent: true }
}

/**
 * Job à pré-sélectionner dans l'horaire du jour : celle en cours, sinon la
 * prochaine à venir, sinon la dernière de la journée.
 */
function currentJob(jobs: Job[]): Job | null {
  if (jobs.length === 0) return null
  const now = Date.now()
  const inProgress = jobs.find((j) => {
    const s = j.start_at ? new Date(j.start_at).getTime() : null
    const e = j.end_at ? new Date(j.end_at).getTime() : (s != null ? s + 2 * 3600000 : null)
    return s != null && e != null && now >= s && now <= e
  })
  if (inProgress) return inProgress
  const next = jobs.find((j) => j.start_at && new Date(j.start_at).getTime() > now)
  return next ?? jobs[jobs.length - 1]
}

// Quel taux horaire s'applique à ce bloc de temps. Affiché seulement aux
// employés qui ont DEUX taux différents (ex. laveurs de vitres : 20 $/h
// paysagement vs 22 $/h commercial).
function WorkTypePicker({
  value, onChange, rates, dark,
}: {
  value: WorkType
  onChange: (v: WorkType) => void
  rates: PayRates
  dark?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      {WORK_TYPES.map((w) => {
        const on = value === w.id
        const rate = hourlyRateFor(w.id, rates)
        return (
          <button
            key={w.id}
            onClick={() => onChange(w.id)}
            style={{
              flex: 1, padding: '9px 8px', borderRadius: 10, cursor: 'pointer',
              fontSize: 12, fontWeight: 700, lineHeight: 1.3,
              fontFamily: 'Inter, sans-serif', textAlign: 'center',
              border: on ? '2px solid #10B981' : `1px solid ${dark ? '#ffffff33' : '#D1D5DB'}`,
              background: on ? (dark ? '#10B98126' : '#ECFDF5') : (dark ? '#ffffff14' : '#FFF'),
              color: dark ? '#FFF' : '#374151',
            }}
          >
            <span style={{ display: 'block' }}>{w.label}</span>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 600, opacity: 0.75 }}>
              {money2(rate)}/h
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function PointagePage() {
  const [profileId, setProfileId] = useState<string | null>(null)
  const [rates, setRates] = useState<PayRates>(EMPTY_RATES)
  const [workType, setWorkType] = useState<WorkType>('paysagement')
  const [open, setOpen] = useState<TimesheetRow | null>(null)
  const [week, setWeek] = useState<TimesheetRow[]>([])
  // jobs du jour assignées à l'employé (son horaire) + celle qu'il pointe
  const [todayJobs, setTodayJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [now, setNow] = useState(Date.now())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [facture, setFacture] = useState(false)          // modal « Entrée de facture »
  const [factureMsg, setFactureMsg] = useState<string | null>(null)

  const weekOf = mondayOf()

  const refresh = async (pid: string) => {
    const [o, w, js] = await Promise.all([
      getOpenTimesheet(pid), getMyTimesheets(pid, weekOf), getMyJobsForDay(pid, todayISO()),
    ])
    setOpen(o)
    setWeek(w)
    setTodayJobs(js)
    if (o?.work_type === 'commercial' || o?.work_type === 'paysagement') setWorkType(o.work_type)
    // pré-sélection : la job déjà pointée (job_id, sinon repli sur le libellé
    // pour les poinçons d'avant migration_crm_vitres_upsell), sinon celle en cours.
    const fromOpen =
      (o?.job_id ? js.find((j) => j.id === o.job_id) : null) ??
      (o?.job_note ? js.find((j) => jobLabel(j) === o.job_note) : null)
    setJobId((fromOpen ?? currentJob(js))?.id ?? null)
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      setProfileId(user.id)
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setRates(payRatesOf(p))
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

  const selected = todayJobs.find((j) => j.id === jobId) ?? null
  // ce qui est enregistré dans timesheets.job_note : la job de l'horaire,
  // sinon la note libre (repli quand rien n'est cédulé aujourd'hui)
  const jobNote = selected ? jobLabel(selected) : note
  const selectedMode = selected ? payModeOf(selected) : null

  // « poinçon réglé pour les jobs du jour » : le type d'heures suit la job
  // choisie (copro/commercial vs paysagement) au lieu d'être re-coché à la main.
  useEffect(() => {
    if (!selectedMode) return
    const meta = PAY_MODE_BY_ID[selectedMode]
    if (meta.kind !== 'hourly') return
    setWorkType(selectedMode === 'commercial' ? 'commercial' : 'paysagement')
  }, [selectedMode])

  const doClockIn = async () => {
    if (!profileId || busy) return
    setBusy(true)
    await clockIn(profileId, jobNote, workType, jobId)
    setNote('')
    await refresh(profileId)
    setBusy(false)
  }
  const doClockOut = async () => {
    if (!profileId || !open || busy) return
    setBusy(true)
    await clockOut(open, jobNote || open.job_note || '', jobId)
    setNote('')
    await refresh(profileId)
    setBusy(false)
  }

  // le taux dépend de CE qui est pointé (paysagement 20-24 $/h vs commercial 22 $/h)
  const hourlyRate = hourlyRateFor(workType, rates)
  const showWorkType = rates.rate_commercial > 0 && rates.rate_commercial !== rates.rate_paysagement

  const totalHours = week.reduce((s, r) => s + (Number(r.hours) || 0), 0)
  // les heures faites sur une job payée au % ne sont pas payées à l'heure
  const weekPay = week.reduce((s, r) => s + timesheetPay(r, rates), 0)
  const elapsed = open?.clock_in
    ? Math.floor((now - new Date(open.clock_in).getTime()) / 1000)
    : 0
  const hh = String(Math.floor(elapsed / 3600)).padStart(2, '0')
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontFamily: 'Inter, sans-serif' }}>Chargement…</div>

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', maxWidth: 560, margin: '0 auto', padding: '12px 16px var(--mw-page-pb)' }}>
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
            {showWorkType && <WorkTypePicker value={workType} onChange={setWorkType} rates={rates} dark />}
            <JobPicker jobs={todayJobs} jobId={jobId} onPick={setJobId} note={note} setNote={setNote} rates={rates} dark />
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
            {showWorkType && <WorkTypePicker value={workType} onChange={setWorkType} rates={rates} />}
            <JobPicker jobs={todayJobs} jobId={jobId} onPick={setJobId} note={note} setNote={setNote} rates={rates} />
            <button onClick={doClockIn} disabled={busy} style={{ ...bigBtn, background: '#10B981', color: '#FFF' }}>
              <Play size={18} fill="#FFF" />Clock in
            </button>
          </>
        )}
      </div>

      {/* Entrée de facture : le reçu d'une dépense en photo, sur la job */}
      <button onClick={() => { setFactureMsg(null); setFacture(true) }} style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
        padding: '14px 16px', marginBottom: factureMsg ? 8 : 20, borderRadius: 14, cursor: 'pointer',
        border: '1px solid #69C9CA', background: '#69C9CA14', color: '#0E6B6E',
      }}>
        <Camera size={24} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 800 }}>Entrée de facture</span>
          <span style={{ display: 'block', fontSize: 12, color: '#374151' }}>Gaz, matériel, dépotoir… prends le reçu en photo</span>
        </span>
      </button>
      {factureMsg && (
        <div style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, marginBottom: 20 }}>
          {factureMsg}
        </div>
      )}

      {/* Résumé semaine */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Ma semaine</h2>
        <div style={{ fontSize: 13, color: '#6B7280' }}>
          {totalHours.toFixed(1)} h{weekPay > 0 ? <> · <strong style={{ color: '#697035' }}>{money2(weekPay)}</strong></> : null}
        </div>
      </div>

      <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
        {week.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Aucun pointage cette semaine.</div>
        ) : (
          week.map((r, i) => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 60px', gap: 8, padding: '10px 14px', borderTop: i ? '1px solid #F3F4F6' : 'none', fontSize: 13, alignItems: 'center' }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, color: '#111827', textTransform: 'capitalize' }}>{fmtDay(r.date)}</span>
                {r.job_note && (
                  <span style={{ display: 'block', fontSize: 11, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.job_note}</span>
                )}
              </span>
              <span style={{ color: '#6B7280' }}>{fmtTime(r.clock_in)}</span>
              <span style={{ color: '#6B7280' }}>{r.clock_out ? fmtTime(r.clock_out) : '…'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, color: timesheetIsHourly(r) ? '#697035' : '#0D6E6F' }}>
                {r.clock_out ? `${(Number(r.hours) || 0).toFixed(1)}h` : `${hoursBetween(r.clock_in, new Date().toISOString()).toFixed(1)}h`}
                {!timesheetIsHourly(r) && <span style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}>COMM.</span>}
              </span>
            </div>
          ))
        )}
      </div>
      {hourlyRate === 0 && (
        <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 10 }}>Taux horaire non défini sur ton profil — la paye s&apos;affichera une fois réglé par un admin.</p>
      )}

      {facture && (
        <FactureModal
          userId={profileId}
          defaultJobId={jobId}
          onClose={() => setFacture(false)}
          onSaved={(msg) => { setFacture(false); setFactureMsg(msg) }}
        />
      )}
    </div>
  )
}

/**
 * Choix de la job pointée : l'employé prend une job de SON horaire du jour
 * (pré-sélectionnée) au lieu de l'écrire. Repli sur une note libre si rien n'est cédulé.
 * `dark` = rendu sur la carte verte (en service).
 */
function JobPicker({ jobs, jobId, onPick, note, setNote, rates, dark = false }: {
  jobs: Job[]
  jobId: string | null
  onPick: (id: string) => void
  note: string
  setNote: (v: string) => void
  rates: PayRates
  dark?: boolean
}) {
  const selected = jobs.find((j) => j.id === jobId) ?? null
  const gps = selected ? jobDirectionsUrl(selected) : null
  const selectedPay = selected ? payPreview(selected, rates) : null

  if (jobs.length === 0) {
    return (
      <>
        <div style={{ fontSize: 12, color: dark ? '#A7F3D0' : '#9CA3AF', marginBottom: 6 }}>
          Aucune job cédulée aujourd&apos;hui
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note de job (optionnel)…"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: dark ? 'none' : '1px solid #D1D5DB', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
        />
      </>
    )
  }

  return (
    <div style={{ textAlign: 'left', marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: dark ? '#A7F3D0' : '#6B7280', marginBottom: 6 }}>
        Ma job
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {jobs.map((j) => {
          const on = j.id === jobId
          const pay = payPreview(j, rates)
          return (
            <button
              key={j.id}
              onClick={() => onPick(j.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 14,
                border: on ? '2px solid #10B981' : `1px solid ${dark ? 'rgba(255,255,255,0.25)' : '#D1D5DB'}`,
                background: on ? (dark ? 'rgba(16,185,129,0.22)' : '#ECFDF5') : (dark ? 'rgba(255,255,255,0.08)' : '#FFF'),
                color: dark ? '#FFF' : '#111827',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: dark ? '#A7F3D0' : '#6B7280', flexShrink: 0 }}>
                {fmtTime(j.start_at)}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {jobLabel(j)}
              </span>
              {/* ce que CETTE job rapporte : % de vitres ou taux horaire */}
              <span style={{
                flexShrink: 0, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                color: dark ? '#A7F3D0' : (pay.percent ? '#0D6E6F' : '#697035'),
              }}>
                {pay.text}
              </span>
            </button>
          )
        })}
      </div>
      {selectedPay?.percent && (
        <p style={{ margin: '8px 0 0', fontSize: 11, lineHeight: 1.45, color: dark ? '#A7F3D0' : '#6B7280' }}>
          Job payée à la commission : le poinçon sert au suivi des heures, la paye
          vient du % sur le prix de la job (upsells inclus).
        </p>
      )}
      {gps && (
        <a
          href={gps}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13, fontWeight: 600,
            color: dark ? '#A7F3D0' : '#0E6B6E', textDecoration: 'none',
          }}
        >
          <Navigation size={14} />{selected?.address}
        </a>
      )}
    </div>
  )
}

const bigBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
  padding: '14px 20px', borderRadius: 12, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer',
}
