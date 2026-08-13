'use client'
import { useEffect, useRef, useState } from 'react'
import {
  getJobPhotos, addJobPhoto, deleteJobPhoto,
  getJobExpenses, addJobExpense, deleteJobExpense, getTeamProfiles,
  type JobPhoto, type JobExpense, type AssignProfile,
} from '@/lib/queries/calendar'
import { uploadPhoto, photoUrl, deletePhoto } from '@/lib/storage'
import { money2 } from '@/lib/payes'
import { Camera, X, Plus, Receipt } from 'lucide-react'

// ============================================================
// Photos partagées + dépenses (factures) d'un job.
// Volontairement HORS du <fieldset disabled> du JobModal : les employés
// (non-admin) peuvent ajouter photos et dépenses depuis le chantier.
// ============================================================

interface Props {
  jobId: string
  userId: string | null
  isAdmin: boolean
  // gazon : les photos vivent sur la fiche du terrain dans Run gazon, pas sur le job
  showPhotos?: boolean
}

export default function JobExtras({ jobId, userId, isAdmin, showPhotos = true }: Props) {
  const [photos, setPhotos] = useState<JobPhoto[]>([])
  const [expenses, setExpenses] = useState<JobExpense[]>([])
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const photoRef = useRef<HTMLInputElement>(null)

  // form dépense
  const [showExpForm, setShowExpForm] = useState(false)
  const [expLabel, setExpLabel] = useState('')
  const [expAmount, setExpAmount] = useState('')
  const [expPayer, setExpPayer] = useState<string>(userId ?? '') // qui a payé
  const [expFile, setExpFile] = useState<File | null>(null)
  const [savingExp, setSavingExp] = useState(false)
  const [team, setTeam] = useState<AssignProfile[]>([])
  const expFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([getJobPhotos(jobId), getJobExpenses(jobId), getTeamProfiles()]).then(([p, e, t]) => {
      setPhotos(p.photos)
      setExpenses(e.expenses)
      setTeam(t)
      if (p.error || e.error) setMigrationMissing(true)
    })
  }, [jobId])

  if (migrationMissing) {
    return (
      <div style={{ background: '#FEF3C7', color: '#92400E', padding: 10, borderRadius: 8, fontSize: 12, marginTop: 12 }}>
        Photos & dépenses : appliquer <code>migration_crm_gazon_paye.sql</code> pour activer.
      </div>
    )
  }

  const addPhoto = async (file: File) => {
    setUploading(true); setError('')
    const { path, error: e } = await uploadPhoto(`jobs/${jobId}`, file)
    if (e || !path) { setUploading(false); setError(e ?? 'Upload impossible'); return }
    const { error: e2 } = await addJobPhoto(jobId, path, userId)
    setUploading(false)
    if (e2) { setError(e2); return }
    const { photos: fresh } = await getJobPhotos(jobId)
    setPhotos(fresh)
  }

  const removePhoto = async (p: JobPhoto) => {
    if (!confirm('Supprimer cette photo ?')) return
    const { error: e } = await deleteJobPhoto(p.id)
    if (e) { setError(e); return }
    setPhotos((prev) => prev.filter((x) => x.id !== p.id))
    deletePhoto(p.path)
  }

  const saveExpense = async () => {
    if (!expLabel.trim()) { setError('Nom de la dépense requis (ex. Gaz).'); return }
    const amount = Number(expAmount)
    if (!amount || amount <= 0) { setError('Montant requis.'); return }
    setSavingExp(true); setError('')
    let photoPath: string | null = null
    if (expFile) {
      const { path, error: e } = await uploadPhoto(`expenses/${jobId}`, expFile)
      if (e) { setSavingExp(false); setError(e); return }
      photoPath = path
    }
    const { error: e2 } = await addJobExpense({ job_id: jobId, profile_id: expPayer || userId, label: expLabel.trim(), amount, photo_path: photoPath })
    setSavingExp(false)
    if (e2) { setError(e2); return }
    setExpLabel(''); setExpAmount(''); setExpFile(null); setExpPayer(userId ?? ''); setShowExpForm(false)
    const { expenses: fresh } = await getJobExpenses(jobId)
    setExpenses(fresh)
  }

  const removeExpense = async (x: JobExpense) => {
    if (!confirm(`Supprimer la dépense « ${x.label} » ?`)) return
    const { error: e } = await deleteJobExpense(x.id)
    if (e) { setError(e); return }
    setExpenses((prev) => prev.filter((p) => p.id !== x.id))
    if (x.photo_path) deletePhoto(x.photo_path)
  }

  const total = expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0)

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #E5E7EB', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* --- PHOTOS --- */}
      {showPhotos && (
      <div>
        <div style={sectionLabel}>Photos du job ({photos.length})</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((p) => (
            <div key={p.id} style={{ position: 'relative' }}>
              <a href={photoUrl(p.path)} target="_blank" rel="noopener noreferrer" title={p.profiles?.full_name ?? ''}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(p.path)} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #E5E7EB' }} />
              </a>
              {(isAdmin || p.author_id === userId) && (
                <button onClick={() => removePhoto(p)} aria-label="Supprimer" style={xBtn}><X size={11} /></button>
              )}
            </div>
          ))}
          <button onClick={() => photoRef.current?.click()} disabled={uploading} style={{ width: 64, height: 64, borderRadius: 8, border: '1px dashed #9CA3AF', background: '#F9FAFB', color: '#6B7280', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: 10, fontWeight: 700 }}>
            <Camera size={16} />{uploading ? '…' : 'Photo'}
          </button>
          <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = '' }} />
        </div>
      </div>
      )}

      {/* --- DÉPENSES --- */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={sectionLabel}>Dépenses{expenses.length ? ` · ${money2(total)}` : ''}</div>
          {!showExpForm && (
            <button onClick={() => setShowExpForm(true)} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#FFF', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={13} />Dépense
            </button>
          )}
        </div>

        {expenses.map((x) => (
          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #F3F4F6', fontSize: 13 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: '#111827' }}>{x.label}</span>
              <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6 }}>{x.profiles?.full_name ? `payé par ${x.profiles.full_name}` : ''}</span>
            </div>
            {x.photo_path && (
              <a href={photoUrl(x.photo_path)} target="_blank" rel="noopener noreferrer" aria-label="Facture" style={{ color: '#0E6B6E', display: 'inline-flex' }}>
                <Receipt size={15} />
              </a>
            )}
            <strong style={{ color: '#0D6E6F', whiteSpace: 'nowrap' }}>{money2(Number(x.amount) || 0)}</strong>
            {(isAdmin || x.profile_id === userId) && (
              <button onClick={() => removeExpense(x)} aria-label="Supprimer" style={{ border: 'none', background: 'none', color: '#DC2626', cursor: 'pointer', display: 'inline-flex', padding: 2 }}>
                <X size={13} />
              </button>
            )}
          </div>
        ))}

        {showExpForm && (
          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: 10, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={expLabel} onChange={(e) => setExpLabel(e.target.value)} placeholder="Gaz, matériel…" style={{ ...inp, flex: 2 }} />
              <input value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="0.00 $" type="number" inputMode="decimal" style={{ ...inp, flex: 1 }} />
            </div>
            {/* qui a sorti l'argent (défaut : moi) */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: '#6B7280' }}>
              Payé par
              <select value={expPayer} onChange={(e) => setExpPayer(e.target.value)} style={{ ...inp, flex: 1 }}>
                {!userId && <option value="">—</option>}
                {team.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name ?? '—'}{p.id === userId ? ' (moi)' : ''}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => expFileRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: 8, border: '1px dashed #9CA3AF', background: '#FFF', color: expFile ? '#0D6E6F' : '#6B7280', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <Camera size={14} />{expFile ? 'Facture ✓' : 'Photo facture'}
              </button>
              <input ref={expFileRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => setExpFile(e.target.files?.[0] ?? null)} />
              <button onClick={() => { setShowExpForm(false); setExpFile(null); setError('') }} style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, border: 'none', background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={saveExpense} disabled={savingExp} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: savingExp ? 0.6 : 1 }}>{savingExp ? '…' : 'Ajouter'}</button>
            </div>
          </div>
        )}
      </div>

      {error && <div style={{ color: '#991B1B', fontSize: 12 }}>{error}</div>}
    </div>
  )
}

const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }
const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, background: '#FFF', boxSizing: 'border-box', minWidth: 0 }
const xBtn: React.CSSProperties = { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#DC2626', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
