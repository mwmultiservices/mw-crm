'use client'
import { useEffect, useRef, useState } from 'react'
import { getJobPhotos, addJobPhoto, deleteJobPhoto, type JobPhoto } from '@/lib/queries/calendar'
import { getJobFactures, deleteFacture, factureFileName, type Facture } from '@/lib/queries/factures'
import { uploadPhoto, photoUrl, photoDownloadUrl, deletePhoto } from '@/lib/storage'
import { money2 } from '@/lib/payes'
import FactureModal from '@/components/factures/FactureModal'
import { Camera, X, Download, Receipt } from 'lucide-react'

// ============================================================
// Photos partagées + dépenses (factures) d'un job.
// Volontairement HORS du <fieldset disabled> du JobModal : les employés
// (non-admin) peuvent ajouter photos et factures depuis le chantier.
// Chaque facture a son bouton « Télécharger » : le reçu part direct dans
// Téléchargements (prêt à glisser dans QuickBooks), sans ouvrir l'image.
// ============================================================

interface Props {
  jobId: string
  userId: string | null
  isAdmin: boolean
  // libellé de la job (« 🍂 Fermeture Longueuil #1 ») : modal + nom du fichier
  jobTitle?: string | null
  // gazon : les photos vivent sur la fiche du terrain dans Run gazon, pas sur le job
  showPhotos?: boolean
}

export default function JobExtras({ jobId, userId, isAdmin, jobTitle, showPhotos = true }: Props) {
  const [photos, setPhotos] = useState<JobPhoto[]>([])
  const [expenses, setExpenses] = useState<Facture[]>([])
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [adding, setAdding] = useState(false) // modal « Entrée de facture »
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([getJobPhotos(jobId), getJobFactures(jobId)]).then(([p, e]) => {
      setPhotos(p.photos)
      setExpenses(e.factures)
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

  const removeExpense = async (x: Facture) => {
    if (!confirm(`Supprimer la dépense « ${x.label} » ?`)) return
    const { error: e } = await deleteFacture(x)
    if (e) { setError(e); return }
    setExpenses((prev) => prev.filter((p) => p.id !== x.id))
  }

  const onFactureSaved = async (message: string) => {
    setAdding(false)
    setFlash(message)
    const { factures } = await getJobFactures(jobId)
    setExpenses(factures)
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

      {/* --- DÉPENSES (factures) --- */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={sectionLabel}>Dépenses{expenses.length ? ` · ${money2(total)}` : ''}</div>
          <button onClick={() => { setFlash(''); setAdding(true) }} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: '1px solid #69C9CA', background: '#69C9CA14', color: '#0E6B6E', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <Camera size={14} />Entrée de facture
          </button>
        </div>

        {flash && <div style={{ fontSize: 12, color: '#065F46', margin: '4px 0 6px' }}>{flash}</div>}

        {expenses.map((x) => (
          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #F3F4F6', fontSize: 13 }}>
            {x.photo_path ? (
              <a href={photoUrl(x.photo_path)} target="_blank" rel="noopener noreferrer" aria-label="Voir la facture" style={{ flexShrink: 0, display: 'inline-flex' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(x.photo_path)} alt="" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 6, border: '1px solid #E5E7EB' }} />
              </a>
            ) : (
              <span title="Pas de photo" style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 6, background: '#F3F4F6', color: '#9CA3AF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Receipt size={15} />
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.label}</span>
              <span style={{ display: 'block', fontSize: 11, color: '#9CA3AF' }}>
                {fmtStamp(x.created_at)}{x.profiles?.full_name ? ` · payé par ${x.profiles.full_name}` : ''}
              </span>
            </div>
            <strong style={{ color: '#0D6E6F', whiteSpace: 'nowrap' }}>{money2(Number(x.amount) || 0)}</strong>
            {/* téléchargement direct (Content-Disposition: attachment) — pas besoin d'ouvrir l'image */}
            {x.photo_path && (
              <a href={photoDownloadUrl(x.photo_path, factureFileName(x, jobTitle))} download aria-label="Télécharger la facture" title="Télécharger la facture" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid #69C9CA', background: '#69C9CA14', color: '#0E6B6E' }}>
                <Download size={15} />
              </a>
            )}
            {(isAdmin || x.profile_id === userId) && (
              <button onClick={() => removeExpense(x)} aria-label="Supprimer" style={{ border: 'none', background: 'none', color: '#DC2626', cursor: 'pointer', display: 'inline-flex', padding: 2 }}>
                <X size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      {error && <div style={{ color: '#991B1B', fontSize: 12 }}>{error}</div>}

      {adding && (
        <FactureModal
          userId={userId}
          isAdmin={isAdmin}
          job={{ id: jobId, label: jobTitle || 'Cette job' }}
          stacked
          onClose={() => setAdding(false)}
          onSaved={onFactureSaved}
        />
      )}
    </div>
  )
}

// « 30 sept. 20 h 51 » — date et heure d'entrée de la facture
const fmtStamp = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}`
}

const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }
const xBtn: React.CSSProperties = { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#DC2626', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
