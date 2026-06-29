'use client'
import { Plus, Navigation } from 'lucide-react'
import { clientName, jobDirectionsUrl, type Job } from '@/lib/queries/calendar'

export interface Lane { id: string; label: string; color: string }
export interface ProfileMini { full_name: string | null; color: string | null }

interface Props {
  weekStart: string // lundi YYYY-MM-DD
  lanes: Lane[]
  jobs: Job[]
  profileMap: Record<string, ProfileMini>
  currentUserId?: string | null
  canEdit: boolean
  onAddJob: (dateISO: string, laneId: string) => void
  onJobClick: (job: Job) => void
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dayKeyOf(iso: string | null): string {
  if (!iso) return ''
  return ymd(new Date(iso))
}
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : ''
const initials = (name: string | null | undefined) =>
  (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

export default function WeekCalendar({
  weekStart, lanes, jobs, profileMap, currentUserId, canEdit, onAddJob, onJobClick,
}: Props) {
  const todayKey = ymd(new Date())
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 12, fontFamily: 'Inter, sans-serif' }}>
      {days.map((day, i) => {
        const key = ymd(day)
        const isToday = key === todayKey
        return (
          <div key={key} style={{ flex: '0 0 240px', maxWidth: 240 }}>
            {/* en-tête jour */}
            <div style={{
              textAlign: 'center', padding: '8px 0', borderRadius: 10, marginBottom: 8,
              background: isToday ? '#69C9CA' : '#F3F4F6', color: isToday ? '#06363B' : '#374151',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{WEEKDAYS[i]}</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{day.getDate()}</div>
            </div>

            {/* lanes (équipes) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lanes.map((lane) => {
                const laneJobs = jobs
                  .filter((j) => dayKeyOf(j.start_at) === key && (j.team ?? 'equipe1') === lane.id)
                  .sort((a, b) => (a.start_at ?? '').localeCompare(b.start_at ?? ''))
                return (
                  <div key={lane.id} style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderLeft: `3px solid ${lane.color}` }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{lane.label}</span>
                      {canEdit && (
                        <button onClick={() => onAddJob(`${key}T08:00`, lane.id)} aria-label="Ajouter" style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: 6, border: 'none', background: '#F3F4F6', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                    <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 16 }}>
                      {laneJobs.length === 0 ? (
                        <button
                          onClick={() => canEdit && onAddJob(`${key}T08:00`, lane.id)}
                          disabled={!canEdit}
                          style={{ border: '1px dashed #E5E7EB', borderRadius: 8, background: 'transparent', color: '#C4C9D0', fontSize: 11, padding: '8px 0', cursor: canEdit ? 'pointer' : 'default' }}
                        >
                          {canEdit ? '+ libre' : '—'}
                        </button>
                      ) : (
                        laneJobs.map((job) => {
                          const mine = !!currentUserId && job.assigned_ids?.includes(currentUserId)
                          const done = job.status === 'done'
                          const canceled = job.status === 'canceled'
                          const gpsUrl = jobDirectionsUrl(job)
                          return (
                            <div key={job.id} role="button" tabIndex={0} onClick={() => onJobClick(job)} style={{
                              textAlign: 'left', border: `1px solid ${mine ? lane.color : '#E5E7EB'}`,
                              borderLeft: `3px solid ${lane.color}`, borderRadius: 8, background: mine ? lane.color + '12' : '#FFF',
                              padding: 8, cursor: 'pointer', opacity: canceled ? 0.5 : 1,
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>
                                  {fmtTime(job.start_at)}{job.end_at ? `–${fmtTime(job.end_at)}` : ''}
                                  {done && <span style={{ marginLeft: 6, color: '#10B981' }}>✓</span>}
                                  {canceled && <span style={{ marginLeft: 6, textDecoration: 'line-through' }}>annulé</span>}
                                </div>
                                {gpsUrl && (
                                  <a
                                    href={gpsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    title="Itinéraire"
                                    aria-label="Itinéraire"
                                    style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, color: '#0E6B6E', background: '#69C9CA1F', flexShrink: 0 }}
                                  >
                                    <Navigation size={12} />
                                  </a>
                                )}
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {clientName(job) || job.title || job.service || 'Job'}
                              </div>
                              {job.route_name && <div style={{ fontSize: 11, color: '#697035' }}>🌿 {job.route_name}</div>}
                              {job.service && (clientName(job) || job.title) && <div style={{ fontSize: 11, color: '#6B7280' }}>{job.service}</div>}
                              {job.assigned_ids?.length > 0 && (
                                <div style={{ display: 'flex', gap: 3, marginTop: 5, flexWrap: 'wrap' }}>
                                  {job.assigned_ids.map((id) => {
                                    const p = profileMap[id]
                                    return (
                                      <span key={id} title={p?.full_name ?? ''} style={{
                                        width: 20, height: 20, borderRadius: '50%', fontSize: 9, fontWeight: 700,
                                        background: (p?.color ?? '#94A3B8') + '22', color: p?.color ?? '#64748B',
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        border: `1px solid ${(p?.color ?? '#94A3B8')}55`,
                                      }}>{initials(p?.full_name)}</span>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
