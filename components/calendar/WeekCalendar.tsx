'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { Navigation, Play } from 'lucide-react'
import { clientName, jobDirectionsUrl, type Job } from '@/lib/queries/calendar'
import { findRoute } from '@/lib/gazon-routes'

export interface Lane { id: string; label: string; color: string }
export interface ProfileMini { full_name: string | null; color: string | null }

interface Props {
  weekStart: string // lundi YYYY-MM-DD
  lanes: Lane[]
  jobs: Job[]
  profileMap: Record<string, ProfileMini>
  currentUserId?: string | null
  canEdit: boolean
  // false = une seule colonne par jour (vue employé : ses jobs, sans notion d'équipe)
  groupByTeam?: boolean
  // dateISO = `YYYY-MM-DDTHH:MM` (heure du créneau cliqué)
  onAddJob: (dateISO: string, laneId: string) => void
  onJobClick: (job: Job) => void
  // glisser-déposer d'un job vers un autre jour / équipe / heure (admin)
  onMoveJob?: (job: Job, dayKey: string, laneId: string, startMinutes?: number) => void
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

// Plage horaire affichée : 6h → 21h, une ligne par heure.
const START_HOUR = 6
const END_HOUR = 21
const HOURS = END_HOUR - START_HOUR // 15 créneaux d'une heure
const HOUR_H = 54 // hauteur d'une heure en px
const GRID_H = HOURS * HOUR_H
const COL_W = 116 // largeur d'une colonne équipe
const GUTTER = 48 // colonne des heures
const SNAP = 15 // minutes : pas de calage au glisser / clic

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dayKeyOf(iso: string | null): string {
  if (!iso) return ''
  return ymd(new Date(iso))
}
/** minutes depuis minuit (heure locale) */
function minutesOf(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : ''
const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
const initials = (name: string | null | undefined) =>
  (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

interface Placed { job: Job; top: number; height: number; leftPct: number; widthPct: number }

/**
 * Positionne les jobs d'une colonne : top/hauteur selon l'heure, et répartition
 * horizontale des jobs qui se chevauchent (colonnes greedy à l'intérieur d'un groupe).
 */
function layout(dayJobs: Job[]): Placed[] {
  const items = dayJobs
    .map((job) => {
      const s = minutesOf(job.start_at) ?? START_HOUR * 60
      const e = minutesOf(job.end_at) ?? s + 60
      return { job, start: s, end: Math.max(e, s + 30) }
    })
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const placed: Placed[] = []
  let group: typeof items = []
  let groupEnd = -1

  const flush = () => {
    if (group.length === 0) return
    // affectation greedy en sous-colonnes
    const colEnds: number[] = []
    const colOf: number[] = []
    for (const it of group) {
      let c = colEnds.findIndex((endAt) => endAt <= it.start)
      if (c === -1) { c = colEnds.length; colEnds.push(0) }
      colEnds[c] = it.end
      colOf.push(c)
    }
    const cols = colEnds.length
    group.forEach((it, i) => {
      const min = START_HOUR * 60
      const max = END_HOUR * 60
      const s = Math.min(Math.max(it.start, min), max)
      const e = Math.min(Math.max(it.end, s + 20), max)
      placed.push({
        job: it.job,
        top: ((s - min) / 60) * HOUR_H,
        height: Math.max(((e - s) / 60) * HOUR_H, 22),
        leftPct: (colOf[i] / cols) * 100,
        widthPct: 100 / cols,
      })
    })
    group = []
    groupEnd = -1
  }

  for (const it of items) {
    if (group.length > 0 && it.start >= groupEnd) flush()
    group.push(it)
    groupEnd = Math.max(groupEnd, it.end)
  }
  flush()
  return placed
}

/**
 * Minutes de DÉBUT du créneau visé à partir de la position du curseur dans la colonne.
 * `grabMin` = décalage (en minutes) entre le haut de la carte et le point de saisie au
 * glisser : sans lui, le repère suivrait le curseur (donc le bas de la carte si on l'a
 * attrapée par le bas) au lieu du haut du job. `durMin` sert à ne pas déborder la grille.
 */
function minutesFromEvent(
  e: React.MouseEvent | React.DragEvent, el: HTMLElement, grabMin = 0, durMin = SNAP,
): number {
  const y = e.clientY - el.getBoundingClientRect().top
  const raw = START_HOUR * 60 + (y / HOUR_H) * 60 - grabMin
  const snapped = Math.round(raw / SNAP) * SNAP
  const max = Math.max(END_HOUR * 60 - Math.max(durMin, SNAP), START_HOUR * 60)
  return Math.min(Math.max(snapped, START_HOUR * 60), max)
}

/** durée d'un job en minutes (1 h par défaut si pas de fin) */
function durationOf(job: Job): number {
  const s = minutesOf(job.start_at)
  const e = minutesOf(job.end_at)
  return s != null && e != null && e > s ? e - s : 60
}

export default function WeekCalendar({
  weekStart, lanes, jobs, profileMap, currentUserId, canEdit, groupByTeam = true, onAddJob, onJobClick, onMoveJob,
}: Props) {
  const now = new Date()
  const todayKey = ymd(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const showNow = nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60
  const dnd = canEdit && !!onMoveJob
  const [dragOver, setDragOver] = useState<{ day: string; lane: string; minutes: number; dur: number } | null>(null)
  // point de saisie (offset depuis le haut de la carte) + durée du job en cours de glisser
  const dragRef = useRef<{ grabMin: number; durMin: number } | null>(null)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + i)
    return d
  })

  const handleDrop = (e: React.DragEvent, dayKey: string, laneId: string) => {
    e.preventDefault()
    const d = dragRef.current
    const minutes = minutesFromEvent(e, e.currentTarget as HTMLElement, d?.grabMin ?? 0, d?.durMin ?? 60)
    setDragOver(null)
    dragRef.current = null
    const id = e.dataTransfer.getData('text/plain')
    const job = jobs.find((j) => j.id === id)
    if (!job) return
    onMoveJob?.(job, dayKey, laneId, minutes)
  }

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 12, fontFamily: 'Inter, sans-serif' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `${GUTTER}px repeat(${days.length * lanes.length}, minmax(${COL_W}px, 1fr))`,
        minWidth: GUTTER + days.length * lanes.length * COL_W,
      }}>
        {/* ── ligne 1 : jours (2 colonnes chacun) ── */}
        <div style={{ position: 'sticky', left: 0, zIndex: 3, background: '#FFF' }} />
        {days.map((day, i) => {
          const isToday = ymd(day) === todayKey
          return (
            <div key={`h-${ymd(day)}`} style={{
              gridColumn: `span ${lanes.length}`, textAlign: 'center', padding: '6px 0', marginBottom: 4,
              borderRadius: 10, background: isToday ? '#69C9CA' : '#F3F4F6', color: isToday ? '#06363B' : '#374151',
              borderLeft: i === 0 ? undefined : '2px solid #FFF',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{WEEKDAYS[i]}</div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{day.getDate()}</div>
            </div>
          )
        })}

        {/* ── ligne 2 : équipes (masquée en vue employé, une seule colonne) ── */}
        {lanes.length > 1 && (
          <>
            <div style={{ position: 'sticky', left: 0, zIndex: 3, background: '#FFF' }} />
            {days.map((day) => lanes.map((lane) => (
              <div key={`l-${ymd(day)}-${lane.id}`} style={{
                padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                textTransform: 'uppercase', color: '#6B7280', borderTop: `3px solid ${lane.color}`,
                background: lane.color + '10', marginBottom: 4,
              }}>
                {lane.label.replace('Équipe ', 'Éq. ')}
              </div>
            )))}
          </>
        )}

        {/* ── ligne 3 : gouttière des heures + colonnes ── */}
        <div style={{ position: 'sticky', left: 0, zIndex: 3, background: '#FFF', height: GRID_H }}>
          {Array.from({ length: HOURS + 1 }, (_, i) => START_HOUR + i).map((h, i) => (
            <div key={h} style={{
              position: 'absolute', top: i * HOUR_H, right: 6, transform: 'translateY(-50%)',
              fontSize: 10, fontWeight: 600, color: '#9CA3AF', whiteSpace: 'nowrap',
            }}>
              {h}h
            </div>
          ))}
        </div>

        {days.map((day) => {
          const key = ymd(day)
          const isToday = key === todayKey
          return lanes.map((lane, li) => {
            const laneJobs = jobs.filter((j) =>
              dayKeyOf(j.start_at) === key && (!groupByTeam || (j.team ?? 'equipe1') === lane.id))
            const placed = layout(laneJobs)
            const over = dragOver?.day === key && dragOver?.lane === lane.id
            return (
              <div
                key={`b-${key}-${lane.id}`}
                onClick={canEdit ? (e) => {
                  const m = minutesFromEvent(e, e.currentTarget as HTMLElement)
                  onAddJob(`${key}T${hhmm(m)}`, lane.id)
                } : undefined}
                onDragOver={dnd ? (e) => {
                  e.preventDefault()
                  const d = dragRef.current
                  const dur = d?.durMin ?? 60
                  setDragOver({
                    day: key, lane: lane.id, dur,
                    minutes: minutesFromEvent(e, e.currentTarget as HTMLElement, d?.grabMin ?? 0, dur),
                  })
                } : undefined}
                onDragLeave={dnd ? (e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null)
                } : undefined}
                onDrop={dnd ? (e) => handleDrop(e, key, lane.id) : undefined}
                style={{
                  position: 'relative', height: GRID_H, cursor: canEdit ? 'copy' : 'default',
                  borderLeft: li === 0 ? '2px solid #E5E7EB' : '1px solid #F3F4F6',
                  borderRight: li === lanes.length - 1 ? '1px solid #E5E7EB' : undefined,
                  borderBottom: '1px solid #E5E7EB',
                  background: `${isToday ? '#69C9CA08' : '#FFF'}`,
                  backgroundImage: `repeating-linear-gradient(to bottom, #E5E7EB 0 1px, transparent 1px ${HOUR_H}px)`,
                }}
              >
                {/* ligne « maintenant » */}
                {isToday && showNow && (
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: ((nowMin - START_HOUR * 60) / 60) * HOUR_H,
                    borderTop: '2px solid #EF4444', zIndex: 2, pointerEvents: 'none',
                  }} />
                )}

                {/* repère du créneau visé pendant un glisser */}
                {over && dragOver && (
                  <div style={{
                    position: 'absolute', left: 2, right: 2, top: ((dragOver.minutes - START_HOUR * 60) / 60) * HOUR_H,
                    height: Math.max((dragOver.dur / 60) * HOUR_H, 22), overflow: 'hidden',
                    borderRadius: 6, background: '#F0FDFA', border: `1px dashed ${lane.color}`,
                    fontSize: 10, fontWeight: 700, color: '#0E6B6E', padding: 2, pointerEvents: 'none',
                  }}>
                    {hhmm(dragOver.minutes)}
                  </div>
                )}

                {placed.map(({ job, top, height, leftPct, widthPct }) => {
                  const mine = !!currentUserId && job.assigned_ids?.includes(currentUserId)
                  const done = job.status === 'done'
                  const canceled = job.status === 'canceled'
                  const dispo = job.status === 'dispo' // slot mauve « à vendre »
                  const gpsUrl = jobDirectionsUrl(job)
                  const route = job.type === 'gazon' ? findRoute(job.route_name) : null
                  const compact = height < 56
                  return (
                    <div
                      key={job.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onJobClick(job) }}
                      draggable={dnd}
                      onDragStart={dnd ? (e) => {
                        e.dataTransfer.setData('text/plain', job.id)
                        e.dataTransfer.effectAllowed = 'move'
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        const durMin = durationOf(job)
                        const grabMin = Math.min(Math.max(((e.clientY - rect.top) / HOUR_H) * 60, 0), durMin)
                        dragRef.current = { grabMin, durMin }
                      } : undefined}
                      onDragEnd={dnd ? () => { setDragOver(null); dragRef.current = null } : undefined}
                      title={`${fmtTime(job.start_at)}${job.end_at ? `–${fmtTime(job.end_at)}` : ''} · ${route ? route.label : (clientName(job) || job.title || job.service || 'Job')}`}
                      style={{
                        position: 'absolute', top, height,
                        left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`,
                        textAlign: 'left', overflow: 'hidden',
                        border: dispo ? '1px solid #8B5CF6' : `1px solid ${mine ? lane.color : '#E5E7EB'}`,
                        borderLeft: `3px solid ${dispo ? '#8B5CF6' : lane.color}`, borderRadius: 8,
                        background: dispo ? '#F5F3FF' : mine ? lane.color + '1F' : '#FFF',
                        boxShadow: '0 1px 2px rgba(16,24,40,0.06)',
                        padding: compact ? '2px 5px' : '4px 6px', cursor: 'pointer', opacity: canceled ? 0.5 : 1,
                        zIndex: 1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                          {fmtTime(job.start_at)}{job.end_at && !compact ? `–${fmtTime(job.end_at)}` : ''}
                          {done && <span style={{ marginLeft: 4, color: '#10B981' }}>✓</span>}
                          {canceled && <span style={{ marginLeft: 4, textDecoration: 'line-through' }}>annulé</span>}
                          {dispo && <span style={{ marginLeft: 4, padding: '0 5px', borderRadius: 999, background: '#8B5CF6', color: '#FFF', fontSize: 9, fontWeight: 800 }}>DISPO</span>}
                        </div>
                        {route ? (
                          <Link
                            href={`/gazon?route=${encodeURIComponent(route.id)}`}
                            onClick={(e) => e.stopPropagation()}
                            title="Démarrer la run"
                            aria-label="Démarrer la run"
                            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 5, color: '#FFF', background: '#697035', flexShrink: 0 }}
                          >
                            <Play size={11} />
                          </Link>
                        ) : gpsUrl && (
                          <a
                            href={gpsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Itinéraire"
                            aria-label="Itinéraire"
                            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 5, color: '#0E6B6E', background: '#69C9CA1F', flexShrink: 0 }}
                          >
                            <Navigation size={11} />
                          </a>
                        )}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {route ? `🌿 ${route.label}` : (clientName(job) || job.title || job.service || 'Job')}
                      </div>
                      {!compact && !route && job.route_name && <div style={{ fontSize: 10, color: '#697035' }}>🌿 {job.route_name}</div>}
                      {!compact && job.service && (clientName(job) || job.title) && (
                        <div style={{ fontSize: 10, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.service}</div>
                      )}
                      {height >= 76 && job.assigned_ids?.length > 0 && (
                        <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
                          {job.assigned_ids.map((id) => {
                            const p = profileMap[id]
                            return (
                              <span key={id} title={p?.full_name ?? ''} style={{
                                width: 18, height: 18, borderRadius: '50%', fontSize: 9, fontWeight: 700,
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
                })}
              </div>
            )
          })
        })}
      </div>
    </div>
  )
}
