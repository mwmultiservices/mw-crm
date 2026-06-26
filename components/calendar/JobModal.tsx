'use client'
import { useState } from 'react'
import { createJob, updateJob, deleteJob, clientName, type Job, type AssignProfile } from '@/lib/queries/calendar'
import type { Lane } from './WeekCalendar'
import { Trash2 } from 'lucide-react'

interface Props {
  kind: 'fenetre' | 'paysagement'
  lanes: Lane[]
  assignProfiles: AssignProfile[]
  // création
  initialDate?: string // YYYY-MM-DD
  initialTeam?: string
  // édition
  job?: Job | null
  onClose: () => void
  onSaved: () => void
}

function dateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function timeInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function buildISO(date: string, time: string): string | null {
  if (!date || !time) return null
  return new Date(`${date}T${time}`).toISOString()
}

export default function JobModal({ kind, lanes, assignProfiles, initialDate, initialTeam, job, onClose, onSaved }: Props) {
  const isEdit = !!job

  const [type, setType] = useState(job?.type ?? (kind === 'fenetre' ? 'fenetre' : 'gazon'))
  const [title, setTitle] = useState(job ? (clientName(job) || job.title || '') : '')
  const [service, setService] = useState(job?.service ?? '')
  const [routeName, setRouteName] = useState(job?.route_name ?? '')
  const [date, setDate] = useState(job ? dateInput(job.start_at) : (initialDate ?? ''))
  const [start, setStart] = useState(job ? timeInput(job.start_at) : '08:00')
  const [end, setEnd] = useState(job ? timeInput(job.end_at) : '10:00')
  const [team, setTeam] = useState(job?.team ?? initialTeam ?? lanes[0]?.id ?? 'equipe1')
  const [assigned, setAssigned] = useState<string[]>(job?.assigned_ids ?? [])
  const [price, setPrice] = useState(job?.price != null ? String(job.price) : '')
  const [status, setStatus] = useState(job?.status ?? 'scheduled')
  const [notes, setNotes] = useState(job?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isGazon = kind === 'paysagement' && type === 'gazon'

  const toggleAssign = (id: string) =>
    setAssigned((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const save = async () => {
    if (!title.trim()) { setError(kind === 'fenetre' ? 'Nom du client / job requis.' : 'Nom du job requis.'); return }
    if (!date) { setError('Date requise.'); return }
    setSaving(true); setError('')
    const payload = {
      title: title.trim(),
      service: service || null,
      type,
      team,
      assigned_ids: assigned,
      route_name: isGazon ? (routeName || null) : null,
      start_at: buildISO(date, start),
      end_at: buildISO(date, end),
      status,
      price: price ? Number(price) : null,
      notes: notes || null,
    }
    const { error: e } = isEdit ? await updateJob(job!.id, payload) : await createJob(payload)
    setSaving(false)
    if (e) { setError(e); return }
    onSaved()
  }

  const remove = async () => {
    if (!isEdit) return
    if (!confirm('Supprimer ce job ?')) return
    setSaving(true)
    const { error: e } = await deleteJob(job!.id)
    setSaving(false)
    if (e) { setError(e); return }
    onSaved()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFF', borderRadius: 14, padding: 20, width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto', fontFamily: 'Inter, sans-serif' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>{isEdit ? 'Modifier le job' : 'Nouveau job'}</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {kind === 'paysagement' && (
            <Field label="Type">
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ id: 'gazon', l: '🌿 Gazon (route)' }, { id: 'projet', l: '🔨 Projet' }].map((t) => (
                  <button key={t.id} onClick={() => setType(t.id)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: type === t.id ? '2px solid #697035' : '1px solid #D1D5DB',
                    background: type === t.id ? '#6970350F' : '#FFF', color: '#374151',
                  }}>{t.l}</button>
                ))}
              </div>
            </Field>
          )}

          <Field label={kind === 'fenetre' ? 'Client / job *' : 'Nom du job *'}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inp} autoFocus placeholder={kind === 'fenetre' ? 'Famille Tremblay' : 'Tonte secteur Magog'} />
          </Field>

          {isGazon && (
            <Field label="Route (gazon)"><input value={routeName} onChange={(e) => setRouteName(e.target.value)} style={inp} placeholder="Route Lundi A" /></Field>
          )}

          <Field label="Service"><input value={service} onChange={(e) => setService(e.target.value)} style={inp} placeholder={kind === 'fenetre' ? 'Lavage ext.' : 'Tonte + plate-bandes'} /></Field>

          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Date" flex><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} /></Field>
            <Field label="Équipe" flex>
              <select value={team} onChange={(e) => setTeam(e.target.value)} style={inp}>
                {lanes.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Début" flex><input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={inp} /></Field>
            <Field label="Fin" flex><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={inp} /></Field>
            <Field label="Prix ($)" flex><input value={price} onChange={(e) => setPrice(e.target.value)} type="number" inputMode="decimal" style={inp} /></Field>
          </div>

          <Field label={kind === 'fenetre' ? 'Techniciens assignés' : 'Équipe assignée'}>
            {assignProfiles.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>Aucun employé disponible.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {assignProfiles.map((p) => {
                  const on = assigned.includes(p.id)
                  return (
                    <button key={p.id} onClick={() => toggleAssign(p.id)} style={{
                      padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: on ? `2px solid ${p.color ?? '#69C9CA'}` : '1px solid #D1D5DB',
                      background: on ? (p.color ?? '#69C9CA') + '14' : '#FFF', color: '#374151',
                    }}>{p.full_name ?? '—'}</button>
                  )
                })}
              </div>
            )}
          </Field>

          {isEdit && (
            <Field label="Statut">
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inp}>
                <option value="scheduled">Cédulé</option>
                <option value="done">Complété</option>
                <option value="canceled">Annulé</option>
              </select>
            </Field>
          )}

          <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, minHeight: 54, resize: 'vertical' }} /></Field>

          {error && <div style={{ color: '#991B1B', fontSize: 13 }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
          {isEdit && (
            <button onClick={remove} disabled={saving} aria-label="Supprimer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}>
              <Trash2 size={17} />
            </button>
          )}
          <button onClick={onClose} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1 }}>Annuler</button>
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, flex: 1, opacity: saving ? 0.6 : 1 }}>{saving ? '…' : isEdit ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <label style={{ display: 'block', flex: flex ? 1 : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, background: '#FFF', boxSizing: 'border-box' }
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
