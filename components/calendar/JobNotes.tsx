'use client'
import { useEffect, useState } from 'react'
import { getJobNotes, addJobNote, deleteJobNote, type JobNote } from '@/lib/queries/calendar'

// ============================================================
// Notes du jour d'une job — le technicien documente ce qu'il a vu sur place
// (client absent, vitre fissurée, à revenir…), comme la « Note du jour » des
// terrains de la Run gazon. Volontairement HORS du <fieldset disabled> du
// JobModal : les employés écrivent même en lecture seule. Chaque note garde
// son auteur et son heure ; l'auteur (ou l'admin) peut la supprimer.
// ============================================================

interface Props {
  jobId: string
  userId: string | null
  isAdmin: boolean
}

export default function JobNotes({ jobId, userId, isAdmin }: Props) {
  const [notes, setNotes] = useState<JobNote[]>([])
  const [tableMissing, setTableMissing] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getJobNotes(jobId).then(({ notes: list, error: e }) => {
      if (cancelled) return
      setNotes(list)
      setTableMissing(!!e)
    })
    return () => { cancelled = true }
  }, [jobId])

  const reload = async () => {
    const { notes: list } = await getJobNotes(jobId)
    setNotes(list)
  }

  const save = async () => {
    if (!text.trim()) return
    setSaving(true); setError('')
    const { error: e } = await addJobNote(jobId, text.trim(), userId)
    setSaving(false)
    if (e) { setError(e); return }
    setText('')
    reload()
  }

  const remove = async (n: JobNote) => {
    if (!confirm('Supprimer cette note ?')) return
    const { error: e } = await deleteJobNote(n.id)
    if (e) { setError(e); return }
    reload()
  }

  if (tableMissing) {
    return (
      <div style={{ background: '#FEF3C7', color: '#92400E', padding: 10, borderRadius: 8, fontSize: 12, marginTop: 12 }}>
        Notes du jour : appliquer <code>migration_crm_job_notes.sql</code> pour activer.
      </div>
    )
  }

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
      <div style={sectionLabel}>Notes du jour{notes.length ? ` (${notes.length})` : ''}</div>

      {notes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 13, color: '#111827', whiteSpace: 'pre-wrap' }}>{n.note}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>{n.profiles?.full_name ?? 'Employé'} · {fmtStamp(n.created_at)}</span>
                {(isAdmin || n.author_id === userId) && (
                  <button onClick={() => remove(n)} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ex. : client absent, vitre fissurée côté cour, moustiquaire brisée, à revenir…"
        style={{ width: '100%', minHeight: 64, padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, fontFamily: 'inherit', background: '#FFF', boxSizing: 'border-box', resize: 'vertical' }}
      />
      {error && <div style={{ color: '#991B1B', fontSize: 12, marginTop: 6 }}>{error}</div>}
      <button
        onClick={save}
        disabled={saving || !text.trim()}
        style={{
          marginTop: 6, width: '100%', padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
          border: '1px solid #69C9CA', background: '#69C9CA14', color: '#0E6B6E', fontSize: 13, fontWeight: 700,
          opacity: saving || !text.trim() ? 0.6 : 1,
        }}
      >
        {saving ? '…' : 'Ajouter la note'}
      </button>
    </div>
  )
}

// « 2 oct. 14 h 05 » — date et heure de la note
const fmtStamp = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}`
}

const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }
