'use client'
import { useEffect, useState } from 'react'
import {
  getJobUpsells, addJobUpsell, deleteJobUpsell, getTeamProfiles,
  type JobUpsell, type AssignProfile,
} from '@/lib/queries/calendar'
import { UPSELL_SERVICES } from '@/lib/services'
import { money2, upsellSellers, upsellShare } from '@/lib/payes'
import MultiPicker from '@/components/ui/MultiPicker'
import { Plus, X, TrendingUp } from 'lucide-react'

// ============================================================
// Ventes additionnelles (« upsells ») faites pendant une job.
// Comme JobExtras, ce bloc vit HORS du <fieldset disabled> du JobModal :
// c'est le technicien sur place — pas seulement l'admin — qui enregistre
// le service ajouté et désigne le ou les vendeurs qui ont conclu la vente.
//
// PLUSIEURS vendeurs : la vente est SPLITTÉE également entre eux (chacun
// touche son % de vente sur SA part). Cf. upsellSellers/upsellShare.
// ============================================================

interface Props {
  jobId: string
  userId: string | null
  isAdmin: boolean
  /** notifie le JobModal du nouveau total (affichage de la paye estimée) */
  onTotalChange?: (total: number) => void
}

const AUTRE = '__autre__'

export default function JobUpsells({ jobId, userId, isAdmin, onTotalChange }: Props) {
  const [upsells, setUpsells] = useState<JobUpsell[]>([])
  const [team, setTeam] = useState<AssignProfile[]>([])
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [service, setService] = useState(UPSELL_SERVICES[0]?.label ?? '')
  const [custom, setCustom] = useState('')
  const [price, setPrice] = useState('')
  const [sellers, setSellers] = useState<string[]>(userId ? [userId] : [])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([getJobUpsells(jobId), getTeamProfiles()]).then(([u, t]) => {
      setTeam(t)
      if (u.error) { setMigrationMissing(true); return }
      setUpsells(u.upsells)
      onTotalChange?.(u.upsells.reduce((s, x) => s + (Number(x.price) || 0), 0))
    })
    // onTotalChange : callback du parent, volontairement hors deps (re-créé à chaque rendu)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  if (migrationMissing) {
    return (
      <div style={{ background: '#FEF3C7', color: '#92400E', padding: 10, borderRadius: 8, fontSize: 12, marginTop: 12 }}>
        Upsells : appliquer <code>migration_crm_vitres_upsell.sql</code> pour activer.
      </div>
    )
  }

  const nameOf = (id: string | null) => team.find((p) => p.id === id)?.full_name ?? null

  const refresh = async () => {
    const { upsells: fresh } = await getJobUpsells(jobId)
    setUpsells(fresh)
    onTotalChange?.(fresh.reduce((s, x) => s + (Number(x.price) || 0), 0))
  }

  const save = async () => {
    const label = (service === AUTRE ? custom : service).trim()
    if (!label) { setError('Service requis.'); return }
    const amount = Number(price)
    if (!amount || amount <= 0) { setError('Prix requis.'); return }
    const picked = sellers.length ? sellers : (userId ? [userId] : [])
    if (picked.length === 0) { setError('Choisir au moins un vendeur.'); return }
    setSaving(true); setError('')
    const { error: e } = await addJobUpsell({
      job_id: jobId, service: label, price: amount,
      // sold_by reste le 1er vendeur : lisible même sans la migration
      sold_by: picked[0], sold_by_ids: picked, created_by: userId,
    })
    setSaving(false)
    if (e) { setError(e); return }
    setService(UPSELL_SERVICES[0]?.label ?? ''); setCustom(''); setPrice('')
    setSellers(userId ? [userId] : []); setShowForm(false)
    refresh()
  }

  const remove = async (x: JobUpsell) => {
    if (!confirm(`Supprimer l'upsell « ${x.service} » ?`)) return
    const { error: e } = await deleteJobUpsell(x.id)
    if (e) { setError(e); return }
    refresh()
  }

  const total = upsells.reduce((s, x) => s + (Number(x.price) || 0), 0)
  const sellerOptions = team.map((p) => ({
    id: p.id,
    label: `${p.full_name ?? '—'}${p.id === userId ? ' (moi)' : ''}`,
  }))
  const share = sellers.length > 1 ? (Number(price) || 0) / sellers.length : 0

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={sectionLabel}>
          <TrendingUp size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
          Upsells{upsells.length ? ` · ${money2(total)}` : ''}
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} style={addBtn}>
            <Plus size={13} />Upsell
          </button>
        )}
      </div>

      {upsells.length === 0 && !showForm && (
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9CA3AF', lineHeight: 1.45 }}>
          Un service ajouté sur place (gouttières, intérieur…) : le ou les vendeurs choisis touchent leur commission de vente.
        </p>
      )}

      {upsells.map((x) => {
        const ids = upsellSellers(x)
        const names = ids.map((id) => `${nameOf(id) ?? '—'}${id === userId ? ' (moi)' : ''}`)
        const part = upsellShare(x.price, ids)
        return (
          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #F3F4F6', fontSize: 13 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: '#111827' }}>{x.service}</span>
              <span style={{ display: 'block', fontSize: 11, color: '#9CA3AF' }}>
                {names.length === 0
                  ? 'vendeur non précisé'
                  : `vendu par ${names.join(' + ')}${ids.length > 1 ? ` · ${money2(part)} chacun` : ''}`}
              </span>
            </div>
            <strong style={{ color: '#0D6E6F', whiteSpace: 'nowrap' }}>{money2(Number(x.price) || 0)}</strong>
            {(isAdmin || x.created_by === userId) && (
              <button onClick={() => remove(x)} aria-label="Supprimer" style={{ border: 'none', background: 'none', color: '#DC2626', cursor: 'pointer', display: 'inline-flex', padding: 2 }}>
                <X size={13} />
              </button>
            )}
          </div>
        )
      })}

      {showForm && (
        <div style={{ background: '#F9FAFB', borderRadius: 10, padding: 10, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={service} onChange={(e) => setService(e.target.value)} style={{ ...inp, flex: 2 }}>
              {UPSELL_SERVICES.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
              <option value={AUTRE}>Autre service…</option>
            </select>
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00 $" type="number" inputMode="decimal" style={{ ...inp, flex: 1 }} />
          </div>
          {service === AUTRE && (
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Nom du service vendu" style={inp} />
          )}
          <div>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>
              Vendu par {sellers.length > 1 ? `(${sellers.length} vendeurs — split)` : ''}
            </span>
            <MultiPicker
              options={sellerOptions}
              selected={sellers}
              onChange={setSellers}
              placeholder="— Choisir le ou les vendeurs —"
            />
            {sellers.length > 1 && (
              <p style={{ margin: '4px 2px 0', fontSize: 11, color: '#9CA3AF' }}>
                Vente partagée : {money2(share)} chacun{Number(price) > 0 ? '' : ' (une fois le prix entré)'}.
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setShowForm(false); setError('') }} style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, border: 'none', background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
            <button onClick={save} disabled={saving} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : 'Ajouter'}</button>
          </div>
        </div>
      )}

      {error && <div style={{ color: '#991B1B', fontSize: 12, marginTop: 6 }}>{error}</div>}
    </div>
  )
}

const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }
const addBtn: React.CSSProperties = {
  marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8,
  border: '1px solid #D1D5DB', background: '#FFF', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer',
}
const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, background: '#FFF', boxSizing: 'border-box', minWidth: 0 }
