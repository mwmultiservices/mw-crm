'use client'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ─── defaults (mirror DoorForm constants) ────────────────────────────────────

const DEFAULT_SERVICES = [
  { value: 'vitres_ext',     label: 'Lavage vitres ext.' },
  { value: 'vitres_int_ext', label: 'Lavage int./ext.' },
  { value: 'gouttières',     label: 'Gouttières' },
  { value: 'paysager',       label: 'Entretien paysager' },
  { value: 'pave_uni',       label: 'Pavé uni' },
  { value: 'tourbe',         label: 'Pose de tourbe' },
  { value: 'plates_bandes',  label: 'Plates-bandes' },
  { value: 'autre',          label: 'Autre' },
]

const DEFAULT_STATUSES = [
  { value: 'pas_repondu',   label: 'Sans réponse',   activeBg: '#1F2937' },
  { value: 'pas_interesse', label: 'Pas intéressé',  activeBg: '#EF4444' },
  { value: 'interesse',     label: 'Intéressé',      activeBg: '#F59E0B' },
  { value: 'a_rappeler',    label: 'À rappeler',     activeBg: '#F59E0B' },
  { value: 'soumission',    label: 'Soumission',     activeBg: '#69C9CA' },
  { value: 'vendu',         label: '✓ Vendu',        activeBg: '#10B981' },
]

const DEFAULT_FOLLOW_UPS = [
  { value: 'pas_interesse', label: 'Pas intéressé' },
  { value: 'trop_cher',     label: 'Trop cher' },
  { value: 'deja_quelquun', label: "Déjà quelqu'un" },
  { value: 'conjoint',      label: 'Parler au conjoint' },
  { value: 'a_rappeler',    label: 'À rappeler' },
  { value: 'reflechir',     label: 'Veut réfléchir' },
  { value: 'autre',         label: 'Autre' },
]

// ─── types ────────────────────────────────────────────────────────────────────

interface ServiceItem  { value: string; label: string }
interface StatusItem   { value: string; label: string; activeBg: string }
interface FollowUpItem { value: string; label: string }

interface Props {
  initialSettings: Record<string, string>
  onSaved?: () => void
}

// ─── shared styles ────────────────────────────────────────────────────────────

const inputSm: React.CSSProperties = {
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 16,
  color: '#1F2937',
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  background: '#FFFFFF',
  minWidth: 0,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#374151',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  margin: '0 0 10px',
}

const iconBtn = (color = '#9CA3AF'): React.CSSProperties => ({
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '4px', display: 'flex', color, borderRadius: 4, flexShrink: 0,
})

function useFocusHandlers() {
  return {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.style.borderColor = '#69C9CA'
      e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)'
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.style.borderColor = '#E5E7EB'
      e.target.style.boxShadow = 'none'
    },
  }
}

// ─── row editors ─────────────────────────────────────────────────────────────

function ServiceRow({ item, onChange, onDelete }: {
  item: ServiceItem
  onChange: (updated: ServiceItem) => void
  onDelete: () => void
}) {
  const fx = useFocusHandlers()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F9FAFB', borderRadius: 8, padding: '8px 10px' }}>
      <input
        value={item.label} onChange={e => onChange({ ...item, label: e.target.value })}
        placeholder="Libellé" style={{ ...inputSm, flex: 2 }} {...fx}
      />
      <input
        value={item.value} onChange={e => onChange({ ...item, value: e.target.value })}
        placeholder="Clé" style={{ ...inputSm, flex: 1, fontFamily: 'monospace', fontSize: 16 }} {...fx}
      />
      <button onClick={onDelete} style={iconBtn()}><X size={14} /></button>
    </div>
  )
}

function StatusRow({ item, onChange, onDelete }: {
  item: StatusItem
  onChange: (updated: StatusItem) => void
  onDelete: () => void
}) {
  const fx = useFocusHandlers()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F9FAFB', borderRadius: 8, padding: '8px 10px' }}>
      <input
        value={item.label} onChange={e => onChange({ ...item, label: e.target.value })}
        placeholder="Libellé" style={{ ...inputSm, flex: 2 }} {...fx}
      />
      <input
        value={item.value} onChange={e => onChange({ ...item, value: e.target.value })}
        placeholder="Clé" style={{ ...inputSm, flex: 1, fontFamily: 'monospace', fontSize: 16 }} {...fx}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <input
          type="color" value={item.activeBg} onChange={e => onChange({ ...item, activeBg: e.target.value })}
          title="Couleur active"
          style={{ width: 30, height: 30, border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer', padding: 1, background: 'none' }}
        />
        <div style={{ width: 20, height: 20, borderRadius: 4, background: item.activeBg, border: '1px solid rgba(0,0,0,0.08)' }} />
      </div>
      <button onClick={onDelete} style={iconBtn()}><X size={14} /></button>
    </div>
  )
}

function FollowUpRow({ item, onChange, onDelete }: {
  item: FollowUpItem
  onChange: (updated: FollowUpItem) => void
  onDelete: () => void
}) {
  const fx = useFocusHandlers()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F9FAFB', borderRadius: 8, padding: '8px 10px' }}>
      <input
        value={item.label} onChange={e => onChange({ ...item, label: e.target.value })}
        placeholder="Libellé" style={{ ...inputSm, flex: 2 }} {...fx}
      />
      <input
        value={item.value} onChange={e => onChange({ ...item, value: e.target.value })}
        placeholder="Clé" style={{ ...inputSm, flex: 1, fontFamily: 'monospace', fontSize: 16 }} {...fx}
      />
      <button onClick={onDelete} style={iconBtn()}><X size={14} /></button>
    </div>
  )
}

// ─── add-row input ─────────────────────────────────────────────────────────────

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (label: string) => void }) {
  const [val, setVal] = useState('')
  const fx = useFocusHandlers()
  const commit = () => {
    const s = val.trim()
    if (!s) return
    onAdd(s)
    setVal('')
  }
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        type="text" value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && commit()}
        placeholder={placeholder}
        style={{ ...inputSm, flex: 1 }} {...fx}
      />
      <button
        onClick={commit}
        style={{ background: '#69C9CA', border: 'none', borderRadius: 8, padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
      >
        <Plus size={16} color="#000" />
      </button>
    </div>
  )
}

// ─── parse helpers ────────────────────────────────────────────────────────────

function parseOrDefault<T>(json: string | undefined, fallback: T[]): T[] {
  try { if (json) return JSON.parse(json) } catch {}
  return fallback
}

function toKey(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '')
}

// ─── main component ────────────────────────────────────────────────────────────

export default function SaleSettingsForm({ initialSettings, onSaved }: Props) {
  const [services,  setServices]  = useState<ServiceItem[]>(parseOrDefault(initialSettings.sale_services,        DEFAULT_SERVICES))
  const [statuses,  setStatuses]  = useState<StatusItem[]>(parseOrDefault(initialSettings.sale_statuses,         DEFAULT_STATUSES))
  const [followUps, setFollowUps] = useState<FollowUpItem[]>(parseOrDefault(initialSettings.sale_follow_up_types, DEFAULT_FOLLOW_UPS))
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await Promise.all([
      supabase.from('app_settings').upsert({ key: 'sale_services',        value: JSON.stringify(services)  }, { onConflict: 'key' }),
      supabase.from('app_settings').upsert({ key: 'sale_statuses',        value: JSON.stringify(statuses)  }, { onConflict: 'key' }),
      supabase.from('app_settings').upsert({ key: 'sale_follow_up_types', value: JSON.stringify(followUps) }, { onConflict: 'key' }),
    ])
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    onSaved?.()
  }

  // ── services ──

  const updateService = (idx: number, updated: ServiceItem) =>
    setServices(prev => prev.map((s, i) => i === idx ? updated : s))

  const addService = (label: string) => {
    const value = toKey(label)
    if (services.some(s => s.value === value)) return
    setServices(prev => [...prev, { value, label }])
  }

  // ── statuses ──

  const updateStatus = (idx: number, updated: StatusItem) =>
    setStatuses(prev => prev.map((s, i) => i === idx ? updated : s))

  const addStatus = (label: string) => {
    const value = toKey(label)
    if (statuses.some(s => s.value === value)) return
    setStatuses(prev => [...prev, { value, label, activeBg: '#69C9CA' }])
  }

  // ── follow-ups ──

  const updateFollowUp = (idx: number, updated: FollowUpItem) =>
    setFollowUps(prev => prev.map((f, i) => i === idx ? updated : f))

  const addFollowUp = (label: string) => {
    const value = toKey(label)
    if (followUps.some(f => f.value === value)) return
    setFollowUps(prev => [...prev, { value, label }])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Services ── */}
      <div>
        <p style={sectionTitle}>Services disponibles</p>
        <p style={{ color: '#6B7280', fontSize: 12, margin: '0 0 10px' }}>
          Affichés dans le formulaire de création de porte.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {services.map((s, i) => (
            <ServiceRow key={i} item={s} onChange={u => updateService(i, u)} onDelete={() => setServices(prev => prev.filter((_, j) => j !== i))} />
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <AddRow placeholder="Nouveau service..." onAdd={addService} />
        </div>
      </div>

      <div style={{ height: 1, background: '#F3F4F6' }} />

      {/* ── Statuts ── */}
      <div>
        <p style={sectionTitle}>Statuts disponibles</p>
        <p style={{ color: '#6B7280', fontSize: 12, margin: '0 0 10px' }}>
          Statuts affichés sur la carte et dans les fiches. La couleur active est utilisée sur le badge.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {statuses.map((s, i) => (
            <StatusRow key={i} item={s} onChange={u => updateStatus(i, u)} onDelete={() => setStatuses(prev => prev.filter((_, j) => j !== i))} />
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <AddRow placeholder="Nouveau statut..." onAdd={addStatus} />
        </div>
      </div>

      <div style={{ height: 1, background: '#F3F4F6' }} />

      {/* ── Types de suivi ── */}
      <div>
        <p style={sectionTitle}>Types de suivi</p>
        <p style={{ color: '#6B7280', fontSize: 12, margin: '0 0 10px' }}>
          Options proposées lors d'un refus ou d'un suivi à planifier.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {followUps.map((f, i) => (
            <FollowUpRow key={i} item={f} onChange={u => updateFollowUp(i, u)} onDelete={() => setFollowUps(prev => prev.filter((_, j) => j !== i))} />
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <AddRow placeholder="Nouveau type de suivi..." onAdd={addFollowUp} />
        </div>
      </div>

      <button
        onClick={handleSave} disabled={saving}
        style={{
          background: '#69C9CA', color: '#000000',
          fontWeight: 600, padding: '0 24px', height: 48, borderRadius: 10, fontSize: 14,
          border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
          fontFamily: 'Inter, sans-serif', width: '100%', opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Sauvegarde...' : 'Enregistrer'}
      </button>
      {saved && (
        <p style={{ margin: 0, textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#10B981' }}>
          ✓ Paramètres sauvegardés
        </p>
      )}
    </div>
  )
}
