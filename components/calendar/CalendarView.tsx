'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isManager } from '@/lib/roles'
import { mondayOf, addWeeks, formatWeekLabel } from '@/lib/payes'
import { getJobsWeek, getAssignableProfiles, updateJob, type Job, type AssignProfile } from '@/lib/queries/calendar'
import WeekCalendar, { type Lane, type ProfileMini } from './WeekCalendar'
import JobModal from './JobModal'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

const LANES: Lane[] = [
  { id: 'equipe1', label: 'Équipe 1', color: '#69C9CA' },
  { id: 'equipe2', label: 'Équipe 2', color: '#697035' },
]

const CONFIG = {
  fenetre: { title: 'Calendrier — Fenêtres', types: ['fenetre'], assignRoles: ['tech'] },
  paysagement: { title: 'Calendrier — Paysagement', types: ['gazon', 'projet'], assignRoles: ['terrain', 'rep'] },
} as const

export default function CalendarView({ kind }: { kind: 'fenetre' | 'paysagement' }) {
  const cfg = CONFIG[kind]
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState(mondayOf())
  const [jobs, setJobs] = useState<Job[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, ProfileMini>>({})
  const [assignProfiles, setAssignProfiles] = useState<AssignProfile[]>([])
  const [loading, setLoading] = useState(true)

  // modal : { mode:'create', date, time, team } | { mode:'edit', job }
  const [modal, setModal] = useState<{ date?: string; time?: string; team?: string; job?: Job } | null>(null)

  const canEdit = isManager(role)

  const loadJobs = useCallback(async (ws: string) => {
    setJobs(await getJobsWeek([...cfg.types], ws))
  }, [cfg.types])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const [{ data: prof }, { data: allProfiles }, assignables] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', user.id).single(),
        supabase.from('profiles').select('id, full_name, color'),
        getAssignableProfiles([...cfg.assignRoles]),
      ])
      setRole(prof?.role ?? 'rep')
      const map: Record<string, ProfileMini> = {}
      for (const p of allProfiles ?? []) map[p.id] = { full_name: p.full_name, color: p.color }
      setProfileMap(map)
      setAssignProfiles(assignables)
      await loadJobs(weekStart)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // recharge quand la semaine change
  useEffect(() => { if (!loading) loadJobs(weekStart) }, [weekStart, loading, loadJobs])

  // realtime sur jobs
  useEffect(() => {
    const channel = supabase
      .channel(`jobs-${kind}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => loadJobs(weekStart))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [kind, weekStart, loadJobs])

  const total = useMemo(() => jobs.length, [jobs])

  const onSaved = () => { setModal(null); loadJobs(weekStart) }

  // Glisser-déposer : déplace un job vers un autre jour / équipe / heure.
  // La durée est conservée ; maj optimiste puis rollback si l'update échoue.
  const moveJob = async (job: Job, dayKey: string, laneId: string, startMinutes?: number) => {
    const [y, m, d] = dayKey.split('-').map(Number)
    const oldStart = job.start_at ? new Date(job.start_at) : null
    // durée d'origine (défaut 2 h) pour recaler la fin quand l'heure change
    const durationMs = oldStart && job.end_at
      ? Math.max(new Date(job.end_at).getTime() - oldStart.getTime(), 15 * 60000)
      : 2 * 3600000

    let start_at: string | null = null
    let end_at: string | null = null
    if (startMinutes != null) {
      const s = new Date(y, m - 1, d, Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)
      start_at = s.toISOString()
      end_at = new Date(s.getTime() + durationMs).toISOString()
    } else {
      const shift = (iso: string | null): string | null => {
        if (!iso) return iso
        const dt = new Date(iso)
        dt.setFullYear(y, m - 1, d)
        return dt.toISOString()
      }
      start_at = shift(job.start_at)
      end_at = shift(job.end_at)
    }
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, start_at, end_at, team: laneId } : j)))
    const { error } = await updateJob(job.id, { start_at, end_at, team: laneId })
    if (error) { alert(error); loadJobs(weekStart) }
  }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', padding: '12px 16px 84px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>{cfg.title}</h1>
        <span style={{ color: '#6B7280', fontSize: 13 }}>{total} job{total > 1 ? 's' : ''}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <button onClick={() => setWeekStart(addWeeks(weekStart, -1))} style={navBtn} aria-label="Semaine précédente"><ChevronLeft size={16} /></button>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', minWidth: 168, textAlign: 'center' }}>{formatWeekLabel(weekStart)}</span>
          <button onClick={() => setWeekStart(addWeeks(weekStart, 1))} style={navBtn} aria-label="Semaine suivante"><ChevronRight size={16} /></button>
          {weekStart !== mondayOf() && (
            <button onClick={() => setWeekStart(mondayOf())} style={{ ...navBtn, width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 600 }}>Auj.</button>
          )}
          {canEdit && (
            <button onClick={() => setModal({ date: mondayOf(), team: 'equipe1' })} style={addBtn}><Plus size={16} />Job</button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement…</div>
      ) : (
        <WeekCalendar
          weekStart={weekStart}
          lanes={LANES}
          jobs={jobs}
          profileMap={profileMap}
          currentUserId={userId}
          canEdit={canEdit}
          onAddJob={(dateISO, laneId) => setModal({ date: dateISO.slice(0, 10), time: dateISO.slice(11, 16), team: laneId })}
          onJobClick={(job) => setModal({ job })}
          onMoveJob={moveJob}
        />
      )}

      {!loading && (
        <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
          {canEdit
            ? 'Clique un créneau libre pour créer une job. Glisse une job vers un autre jour, une autre équipe ou une autre heure (pas de 15 min).'
            : 'Lecture seule — seuls les admins peuvent céduler. Tes jobs sont surlignés.'}
        </p>
      )}

      {modal && (
        <JobModal
          kind={kind}
          canEdit={canEdit}
          userId={userId}
          lanes={LANES}
          assignProfiles={assignProfiles}
          initialDate={modal.date}
          initialStart={modal.time}
          initialTeam={modal.team}
          job={modal.job}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8,
  border: '1px solid #D1D5DB', background: '#FFF', cursor: 'pointer', color: '#374151',
}
const addBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
