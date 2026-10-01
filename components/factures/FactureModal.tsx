'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { addFacture, getJobsForFacture, currentJobOf } from '@/lib/queries/factures'
import { getTeamProfiles, jobLabel, type Job, type AssignProfile } from '@/lib/queries/calendar'
import { uploadPhoto, deletePhoto } from '@/lib/storage'
import { money2 } from '@/lib/payes'
import { Camera, ImagePlus, RotateCcw } from 'lucide-react'

// ============================================================
// « Entrée de facture » — l'employé prend le reçu en photo sur la job, pour
// n'importe quelle dépense (gaz, matériel…), en plus de garder le papier.
// Ouvert depuis le Pointage, Mes factures, la Run fermeture et une job du
// calendrier (job imposée). Écrit dans job_expenses → page admin /factures.
// ============================================================

// Dépenses fréquentes : un tap au lieu du clavier sur le chantier.
const TYPES = ['Gaz', 'Matériel', 'Outils', 'Location', 'Dépotoir', 'Repas']

interface Props {
  userId: string | null
  isAdmin?: boolean
  // job imposée (ouvert depuis une job du calendrier) : pas de choix
  job?: { id: string; label: string } | null
  // job pré-choisie (job du jour au Pointage, journée de la Run fermeture) ;
  // les choix = les jobs de l'employé (toutes pour un admin), 7 jours → demain
  defaultJobId?: string | null
  // ouvert par-dessus un autre modal (JobModal) : passe devant, et un clic sur
  // son fond ne doit pas fermer le modal du dessous
  stacked?: boolean
  onClose: () => void
  onSaved: (message: string) => void
}

const fmtJob = (j: Job) => {
  const d = j.start_at ? new Date(j.start_at) : null
  const when = d
    ? `${d.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}`
    : 'sans date'
  return `${when} — ${jobLabel(j)}`
}

export default function FactureModal({ userId, isAdmin = false, job, defaultJobId, stacked, onClose, onSaved }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [jobList, setJobList] = useState<Job[]>([])
  const [jobPick, setJobPick] = useState<string | null>(null) // null = pas encore choisi → défaut
  const [payer, setPayer] = useState<string>(userId ?? '')
  const [team, setTeam] = useState<AssignProfile[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const camRef = useRef<HTMLInputElement>(null)
  const libRef = useRef<HTMLInputElement>(null)

  // id seulement : le parent recrée l'objet `job` à chaque rendu
  const fixedJobId = job?.id ?? null
  useEffect(() => {
    let cancelled = false
    getTeamProfiles().then((t) => { if (!cancelled) setTeam(t) })
    if (!fixedJobId) getJobsForFacture(userId, isAdmin).then((l) => { if (!cancelled) setJobList(l) })
    return () => { cancelled = true }
  }, [fixedJobId, userId, isAdmin])

  // job pré-choisie : celle demandée, sinon celle en cours aujourd'hui
  const jobId = job ? job.id : jobPick ?? (defaultJobId && jobList.some((j) => j.id === defaultJobId)
    ? defaultJobId
    : currentJobOf(jobList)?.id ?? '')

  const pickFile = (f: File | undefined | null) => { if (f) { setFile(f); setError('') } }

  const save = async () => {
    const value = Number(amount.replace(/,/g, '.').replace(/[^\d.]/g, ''))
    if (!label.trim()) { setError('Choisis le type de dépense (ex. Gaz).'); return }
    if (!value || value <= 0) { setError('Montant requis.'); return }
    if (!file && !confirm('Aucune photo de la facture — enregistrer quand même ?')) return
    setSaving(true); setError('')
    let photoPath: string | null = null
    if (file) {
      const { path, error: e } = await uploadPhoto(`expenses/${jobId || 'sans-job'}`, file)
      if (e || !path) { setSaving(false); setError(e ?? 'Envoi de la photo impossible.'); return }
      photoPath = path
    }
    const { error: e2 } = await addFacture({
      job_id: jobId || null, profile_id: payer || userId, label: label.trim(), amount: value, photo_path: photoPath,
    })
    if (e2) {
      if (photoPath) deletePhoto(photoPath)
      setSaving(false); setError(e2); return
    }
    onSaved(`Facture « ${label.trim()} » de ${money2(value)} enregistrée.`)
  }

  return (
    <div
      className="mw-modal-overlay"
      style={stacked ? { zIndex: 70 } : undefined}
      onClick={(e) => { e.stopPropagation(); onClose() }}
    >
      <div onClick={(e) => e.stopPropagation()} className="mw-modal-card" style={{ width: 'min(440px, 100%)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 14px' }}>Entrée de facture</h2>

        {/* photo d'abord : c'est la raison d'être du bouton */}
        {preview ? (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Facture" style={{ display: 'block', width: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 12, background: '#F3F4F6', border: '1px solid #E5E7EB' }} />
            <button type="button" onClick={() => camRef.current?.click()} style={{ ...chip, position: 'absolute', right: 8, bottom: 8, background: '#FFFFFFE6' }}>
              <RotateCcw size={13} />Reprendre
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            <button type="button" onClick={() => camRef.current?.click()} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '22px 12px', borderRadius: 12, border: '2px dashed #69C9CA', background: '#69C9CA14',
              color: '#0E6B6E', fontSize: 15, fontWeight: 800, cursor: 'pointer',
            }}>
              <Camera size={28} />Prendre la facture en photo
            </button>
            <button type="button" onClick={() => libRef.current?.click()} style={{ ...chip, alignSelf: 'center', border: 'none', background: 'none', color: '#6B7280' }}>
              <ImagePlus size={13} />ou choisir une photo déjà prise
            </button>
          </div>
        )}
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
        <input ref={libRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Dépense *">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {TYPES.map((t) => {
                const on = label.trim().toLowerCase() === t.toLowerCase()
                return (
                  <button key={t} type="button" onClick={() => setLabel(t)} style={{
                    ...chip, border: on ? '2px solid #0E6B6E' : '1px solid #D1D5DB',
                    background: on ? '#69C9CA1F' : '#FFF', color: '#374151',
                  }}>{t}</button>
                )
              })}
            </div>
            <input value={label} onChange={(e) => setLabel(e.target.value)} style={inp} aria-label="Dépense" placeholder="Gaz, pavés Rona, location de souffleuse…" />
          </Field>

          <Field label="Montant ($) *">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} style={inp} inputMode="decimal" aria-label="Montant" placeholder="0,00" />
          </Field>

          <Field label="Job">
            {job ? (
              <div style={{ ...inp, background: '#F9FAFB', color: '#374151' }}>{job.label}</div>
            ) : (
              <select value={jobId} onChange={(e) => setJobPick(e.target.value)} style={inp} aria-label="Job">
                <option value="">Aucune job — dépense générale</option>
                {jobList.map((j) => <option key={j.id} value={j.id}>{fmtJob(j)}</option>)}
              </select>
            )}
          </Field>

          <Field label="Payé par">
            <select value={payer} onChange={(e) => setPayer(e.target.value)} style={inp} aria-label="Payé par">
              {!userId && <option value="">—</option>}
              {team.length === 0 && userId && <option value={userId}>Moi</option>}
              {team.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name ?? '—'}{p.id === userId ? ' (moi)' : ''}</option>
              ))}
            </select>
          </Field>

          <p style={{ margin: 0, fontSize: 11.5, color: '#6B7280', lineHeight: 1.45 }}>
            Garde quand même la facture papier et rapporte-la au bureau.
          </p>

          {error && <div style={{ color: '#991B1B', fontSize: 13 }}>{error}</div>}
        </div>

        <div className="mw-modal-actions">
          <button onClick={onClose} disabled={saving} style={{ ...btn, background: '#F3F4F6', color: '#374151', flex: 1 }}>Annuler</button>
          <button onClick={save} disabled={saving} style={{ ...btn, flex: 1, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Envoi…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// <div> et pas <label> : un tap sur le titre d'un <label> « clique » son 1er
// bouton — ici la pastille « Gaz ».
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, background: '#FFF', boxSizing: 'border-box' }
const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 999,
  border: '1px solid #D1D5DB', background: '#FFF', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer',
}
