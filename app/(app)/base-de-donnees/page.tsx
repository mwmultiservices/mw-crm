'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Phone, MapPin, Search, Plus, User, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { getPinBadge } from '@/lib/colors'
import DoorForm from '@/components/DoorForm'
import { isManager } from '@/lib/roles'

// ─── constants ────────────────────────────────────────────────────────────────

const SERVICES = [
  { value: 'vitres_ext',     label: 'Lavage vitres ext.' },
  { value: 'vitres_int_ext', label: 'Lavage int./ext.' },
  { value: 'gouttières',     label: 'Gouttières' },
  { value: 'paysager',       label: 'Entretien paysager' },
  { value: 'pave_uni',       label: 'Pavé uni' },
  { value: 'tourbe',         label: 'Pose de tourbe' },
  { value: 'plates_bandes',  label: 'Plates-bandes' },
  { value: 'autre',          label: 'Autre' },
]

const SERVICE_LABELS: Record<string, string> = Object.fromEntries(SERVICES.map(s => [s.value, s.label]))

const PAGE_SIZE = 20

// ─── types ────────────────────────────────────────────────────────────────────

interface ClientDoor {
  id: string
  user_id: string
  latitude: number
  longitude: number
  address?: string | null
  status: string
  service_type?: string | null
  contract_value?: number | null
  notes?: string | null
  client_name: string
  phone?: string | null
  created_at: string
  profiles?: { full_name: string; color: string } | null
}

// ─── shared styles ────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E5E7EB',
  borderRadius: 12,
  padding: 16,
  marginBottom: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
}

const filterInput: React.CSSProperties = {
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 16,
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  background: '#FFFFFF',
  color: '#1F2937',
}

const btnPrimary: React.CSSProperties = {
  background: '#69C9CA',
  color: '#000000',
  fontWeight: 600,
  padding: '10px 20px',
  borderRadius: 10,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
  fontSize: 14,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

function StatusBadge({ status }: { status: string }) {
  const badge = getPinBadge(status)
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      background: badge.bg,
      color: badge.color,
    }}>
      {status === 'vendu' ? '✓ Vendu' : 'Contact'}
    </span>
  )
}

function VendeurChip({ profile }: { profile?: { full_name: string; color: string } | null }) {
  if (!profile) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: profile.color || '#69C9CA', flexShrink: 0 }} />
      <span style={{ color: '#6B7280', fontSize: 12 }}>{profile.full_name}</span>
    </span>
  )
}

function formatDateFr(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

// ─── fiche modal ──────────────────────────────────────────────────────────────

function FicheModal({ door, onClose, onEdit }: { door: ClientDoor; onClose: () => void; onEdit: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div
        style={{ background: '#FFFFFF', width: '100%', borderRadius: '16px 16px 0 0', maxHeight: '90vh', overflowY: 'auto', fontFamily: 'Inter, sans-serif' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div style={{ padding: '8px 20px 14px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ color: '#111827', fontWeight: 700, fontSize: 18, margin: '0 0 4px' }}>{door.client_name}</p>
            <StatusBadge status={door.status} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onEdit} style={{ background: '#69C9CA', color: '#000', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Modifier
            </button>
            <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', borderRadius: '50%', width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color="#6B7280" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px 48px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {door.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Phone size={16} color="#69C9CA" />
              <a href={`tel:${door.phone}`} style={{ color: '#69C9CA', textDecoration: 'none', fontWeight: 600, fontSize: 15 }}>{door.phone}</a>
            </div>
          )}
          {door.address && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <MapPin size={16} color="#9CA3AF" style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ color: '#374151', fontSize: 14 }}>{door.address}</span>
            </div>
          )}

          {(door.service_type || door.contract_value != null) && (
            <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '12px 14px' }}>
              {door.service_type && <p style={{ color: '#374151', fontSize: 14, margin: '0 0 4px', fontWeight: 500 }}>{SERVICE_LABELS[door.service_type] || door.service_type}</p>}
              {door.contract_value != null && <p style={{ color: '#065F46', fontSize: 16, fontWeight: 700, margin: 0 }}>{Number(door.contract_value).toLocaleString('fr-CA')} $</p>}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <VendeurChip profile={door.profiles} />
            <span style={{ color: '#6B7280', fontSize: 12 }}>{formatDateFr(door.created_at)}</span>
          </div>

          {door.notes && (
            <div>
              <p style={{ color: '#374151', fontWeight: 600, fontSize: 12, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</p>
              <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '12px 14px', fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                {door.notes}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── edit modal ───────────────────────────────────────────────────────────────

function EditClientModal({ door, onClose, onSaved }: { door: ClientDoor; onClose: () => void; onSaved: () => void }) {
  const [clientName, setClientName] = useState(door.client_name || '')
  const [phone, setPhone]           = useState(door.phone || '')
  const [service, setService]       = useState(door.service_type || '')
  const [price, setPrice]           = useState(door.contract_value?.toString() || '')
  const [notes, setNotes]           = useState(door.notes || '')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const fi: React.CSSProperties = {
    width: '100%', border: '1px solid #E5E7EB', borderRadius: 8,
    padding: '10px 14px', fontSize: 16, color: '#1F2937',
    fontFamily: 'Inter, sans-serif', outline: 'none', background: '#FFFFFF', boxSizing: 'border-box',
  }
  const fx = {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      (e.target as HTMLElement).style.borderColor = '#69C9CA'
      ;(e.target as HTMLElement).style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)'
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      (e.target as HTMLElement).style.borderColor = '#E5E7EB'
      ;(e.target as HTMLElement).style.boxShadow = 'none'
    },
  }

  const handleSave = async () => {
    if (!clientName.trim()) { setError('Le nom est obligatoire.'); return }
    setSaving(true)
    const { error: err } = await supabase
      .from('doors')
      .update({
        client_name: clientName.trim(),
        phone: phone.trim() || null,
        service_type: service || null,
        contract_value: price ? parseFloat(price) : null,
        notes: notes.trim() || null,
      })
      .eq('id', door.id)
    setSaving(false)
    if (err) { setError('Erreur lors de la mise à jour.'); return }
    onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div
        style={{ background: '#FFFFFF', width: '100%', borderRadius: '20px 20px 0 0', maxHeight: '92vh', overflowY: 'auto', fontFamily: 'Inter, sans-serif' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 2 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px 14px', borderBottom: '1px solid #F3F4F6' }}>
          <p style={{ color: '#111827', fontWeight: 600, fontSize: 17, margin: 0 }}>Modifier le client</p>
          <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#6B7280" />
          </button>
        </div>
        <div style={{ padding: '20px 20px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Nom complet *">
            <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} style={fi} {...fx} />
          </Field>
          <Field label="Téléphone">
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={fi} {...fx} />
          </Field>
          <Field label="Service">
            <select value={service} onChange={e => setService(e.target.value)} style={{ ...fi, appearance: 'none' } as React.CSSProperties} {...fx}>
              <option value="">— Aucun —</option>
              {SERVICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Montant ($)">
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Ex: 250" style={fi} {...fx} />
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              style={{ ...fi, resize: 'none' } as React.CSSProperties}
              onFocus={e => { e.target.style.borderColor = '#69C9CA'; e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)' }}
              onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
            />
          </Field>
          {error && <p style={{ color: '#EF4444', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={handleSave} disabled={saving}
            style={{ ...btnPrimary, justifyContent: 'center', width: '100%', height: 48, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Sauvegarde...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── add client modal ─────────────────────────────────────────────────────────

function AddClientModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [clientName, setClientName] = useState('')
  const [phone, setPhone]           = useState('')
  const [address, setAddress]       = useState('')
  const [service, setService]       = useState('')
  const [price, setPrice]           = useState('')
  const [notes, setNotes]           = useState('')
  const [vendeurId, setVendeurId]   = useState('')
  const [vendeurs, setVendeurs]     = useState<{ id: string; full_name: string }[]>([])
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').order('full_name')
      .then(({ data }) => {
        const list = data || []
        setVendeurs(list)
        if (list.length > 0) setVendeurId(list[0].id)
      })
  }, [])

  const fi: React.CSSProperties = {
    width: '100%', border: '1px solid #E5E7EB', borderRadius: 8,
    padding: '10px 14px', fontSize: 16, color: '#1F2937',
    fontFamily: 'Inter, sans-serif', outline: 'none', background: '#FFFFFF', boxSizing: 'border-box',
  }
  const fx = {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      (e.target as HTMLElement).style.borderColor = '#69C9CA'
      ;(e.target as HTMLElement).style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)'
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      (e.target as HTMLElement).style.borderColor = '#E5E7EB'
      ;(e.target as HTMLElement).style.boxShadow = 'none'
    },
  }

  const handleSave = async () => {
    if (!clientName.trim()) { setError('Le nom est obligatoire.'); return }
    if (!phone.trim()) { setError('Le téléphone est obligatoire.'); return }
    if (!vendeurId) { setError('Sélectionnez un vendeur.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('doors').insert({
      client_name: clientName.trim(),
      phone: phone.trim(),
      address: address.trim() || null,
      service_type: service || null,
      contract_value: price ? parseFloat(price) : null,
      notes: notes.trim() || null,
      status: 'vendu',
      user_id: vendeurId,
      latitude: 0,
      longitude: 0,
    })
    setSaving(false)
    if (err) { setError('Erreur lors de l\'ajout.'); return }
    onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div
        style={{ background: '#FFFFFF', width: '100%', borderRadius: '20px 20px 0 0', maxHeight: '92vh', overflowY: 'auto', fontFamily: 'Inter, sans-serif' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 2 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px 14px', borderBottom: '1px solid #F3F4F6' }}>
          <p style={{ color: '#111827', fontWeight: 600, fontSize: 17, margin: 0 }}>Ajouter un client</p>
          <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#6B7280" />
          </button>
        </div>
        <div style={{ padding: '20px 20px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Nom complet *">
            <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Jean Tremblay" style={fi} {...fx} />
          </Field>
          <Field label="Téléphone *">
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(514) 555-1234" style={fi} {...fx} />
          </Field>
          <Field label="Adresse">
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Rue Principale, Montréal" style={fi} {...fx} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Service">
              <select value={service} onChange={e => setService(e.target.value)} style={{ ...fi, appearance: 'none' } as React.CSSProperties} {...fx}>
                <option value="">— Aucun —</option>
                {SERVICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Montant ($)">
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="250" style={fi} {...fx} />
            </Field>
          </div>
          <Field label="Vendeur associé">
            <select value={vendeurId} onChange={e => setVendeurId(e.target.value)} style={{ ...fi, appearance: 'none' } as React.CSSProperties} {...fx}>
              {vendeurs.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
            </select>
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              style={{ ...fi, resize: 'none' } as React.CSSProperties}
              onFocus={e => { e.target.style.borderColor = '#69C9CA'; e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)' }}
              onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
            />
          </Field>
          {error && <p style={{ color: '#EF4444', fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={handleSave} disabled={saving}
            style={{ ...btnPrimary, justifyContent: 'center', width: '100%', height: 48, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Ajout en cours...' : 'Ajouter le client'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function BaseDeDonneesPage() {
  const [role, setRole]         = useState<string | null>(null)
  const [clients, setClients]   = useState<ClientDoor[]>([])
  const [loading, setLoading]   = useState(true)

  // filters
  const [search, setSearch]         = useState('')
  const [vendeurFilter, setVendeur] = useState('')
  const [serviceFilter, setService] = useState('')
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')
  const [page, setPage]             = useState(1)

  // modals
  const [ficheClient, setFicheClient] = useState<ClientDoor | null>(null)
  const [editClient, setEditClient]   = useState<ClientDoor | null>(null)
  const [showAdd, setShowAdd]         = useState(false)

  const loadClients = useCallback(async () => {
    const { data } = await supabase
      .from('doors')
      .select('*, profiles(full_name, color)')
      .not('client_name', 'is', null)
      .order('created_at', { ascending: false })
    setClients((data as ClientDoor[]) || [])
    setPage(1)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setRole(data?.role ?? 'rep')
      if (isManager(data?.role)) await loadClients()
      setLoading(false)
    })
  }, [loadClients])

  // distinct vendors from loaded data
  const vendeurOptions = Array.from(
    new Map(clients.filter(c => c.profiles?.full_name).map(c => [c.user_id, c.profiles!.full_name])).entries()
  ).map(([id, name]) => ({ id, name }))

  // distinct services
  const serviceOptions = Array.from(new Set(clients.filter(c => c.service_type).map(c => c.service_type!)))

  // filter
  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    if (q && ![c.client_name, c.phone, c.address, c.service_type].some(f => f?.toLowerCase().includes(q))) return false
    if (vendeurFilter && c.user_id !== vendeurFilter) return false
    if (serviceFilter && c.service_type !== serviceFilter) return false
    if (dateFrom && c.created_at < dateFrom) return false
    if (dateTo && c.created_at > dateTo + 'T23:59:59') return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const resetFilters = () => {
    setSearch(''); setVendeur(''); setService(''); setDateFrom(''); setDateTo('')
    setPage(1)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(105,201,202,0.2)', borderTopColor: '#69C9CA', borderRadius: '50%', animation: 'mw-spin 0.8s linear infinite' }} />
      <style>{`@keyframes mw-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!isManager(role)) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'Inter, sans-serif', padding: 32 }}>
      <User size={48} color="#9CA3AF" />
      <p style={{ color: '#374151', fontWeight: 600, fontSize: 16, margin: '16px 0 4px' }}>Accès réservé au manager</p>
      <p style={{ color: '#6B7280', fontSize: 14, margin: 0, textAlign: 'center' }}>Cette section n'est accessible qu'aux gestionnaires.</p>
    </div>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F1F2F2', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '16px 16px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <h1 style={{ color: '#111827', fontWeight: 700, fontSize: 20, margin: '0 0 2px', letterSpacing: '-0.02em' }}>Base de données clients</h1>
            <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>{filtered.length} client{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setShowAdd(true)} style={btnPrimary}>
            <Plus size={16} />
            <span style={{ whiteSpace: 'nowrap' }}>Ajouter</span>
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={14} color="#9CA3AF" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Rechercher un client, téléphone, adresse..."
            style={{ ...filterInput, width: '100%', paddingLeft: 32, boxSizing: 'border-box' }}
            onFocus={e => { e.target.style.borderColor = '#69C9CA'; e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)' }}
            onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
          />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <select value={vendeurFilter} onChange={e => { setVendeur(e.target.value); setPage(1) }}
            style={{ ...filterInput, minWidth: 0, flex: '1 1 120px' }}>
            <option value="">Tous les vendeurs</option>
            {vendeurOptions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select value={serviceFilter} onChange={e => { setService(e.target.value); setPage(1) }}
            style={{ ...filterInput, minWidth: 0, flex: '1 1 120px' }}>
            <option value="">Tous les services</option>
            {serviceOptions.map(s => <option key={s} value={s}>{SERVICE_LABELS[s] || s}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            style={{ ...filterInput, flex: '1 1 120px' }} />
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
            style={{ ...filterInput, flex: '1 1 120px' }} />
          {(search || vendeurFilter || serviceFilter || dateFrom || dateTo) && (
            <button onClick={resetFilters} style={{ ...filterInput, background: '#F3F4F6', cursor: 'pointer', border: '1px solid #E5E7EB', color: '#374151', fontWeight: 500, whiteSpace: 'nowrap' }}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 80px' }}>
        {paginated.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', color: '#9CA3AF' }}>
            <FileText size={40} color="#D1D5DB" />
            <p style={{ fontSize: 15, fontWeight: 500, color: '#374151', margin: '16px 0 4px' }}>Aucun client trouvé</p>
            {(search || vendeurFilter || serviceFilter || dateFrom || dateTo) && (
              <button onClick={resetFilters} style={{ marginTop: 8, color: '#69C9CA', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : (
          <>
            {paginated.map(client => (
              <div key={client.id} style={card}>
                {/* Row 1: name + badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <p style={{ color: '#111827', fontWeight: 700, fontSize: 15, margin: 0, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {client.client_name}
                  </p>
                  <StatusBadge status={client.status} />
                </div>

                {/* Row 2: phone */}
                {client.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Phone size={12} color="#9CA3AF" />
                    <a href={`tel:${client.phone}`} style={{ color: '#69C9CA', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>{client.phone}</a>
                  </div>
                )}

                {/* Row 3: address */}
                {client.address && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                    <MapPin size={12} color="#9CA3AF" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ color: '#6B7280', fontSize: 12, lineHeight: 1.4 }}>{client.address}</span>
                  </div>
                )}

                {/* Row 4: service + price | vendeur */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {client.service_type && (
                      <span style={{ background: '#E8F8F8', color: '#0D6E6F', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999 }}>
                        {SERVICE_LABELS[client.service_type] || client.service_type}
                      </span>
                    )}
                    {client.contract_value != null && (
                      <span style={{ color: '#065F46', fontSize: 13, fontWeight: 700 }}>
                        {Number(client.contract_value).toLocaleString('fr-CA')} $
                      </span>
                    )}
                  </div>
                  <VendeurChip profile={client.profiles} />
                </div>

                {/* Row 5: date + notes */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ color: '#9CA3AF', fontSize: 11 }}>{formatDateFr(client.created_at)}</span>
                  {client.notes && (
                    <span style={{ color: '#9CA3AF', fontSize: 11, flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {client.notes.length > 60 ? client.notes.slice(0, 60) + '…' : client.notes}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setFicheClient(client)}
                    style={{ flex: 1, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: '#374151', fontFamily: 'Inter, sans-serif' }}>
                    Fiche complète
                  </button>
                  <button onClick={() => setEditClient(client)}
                    style={{ flex: 1, background: '#69C9CA', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#000000', fontFamily: 'Inter, sans-serif' }}>
                    Modifier
                  </button>
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '8px 0 16px' }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ background: page === 1 ? '#F3F4F6' : '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1, display: 'flex', alignItems: 'center' }}>
                  <ChevronLeft size={16} color="#374151" />
                </button>
                <span style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ background: page === totalPages ? '#F3F4F6' : '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1, display: 'flex', alignItems: 'center' }}>
                  <ChevronRight size={16} color="#374151" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {ficheClient && (
        <FicheModal
          door={ficheClient}
          onClose={() => setFicheClient(null)}
          onEdit={() => { setEditClient(ficheClient); setFicheClient(null) }}
        />
      )}

      {editClient && (
        <EditClientModal
          door={editClient}
          onClose={() => setEditClient(null)}
          onSaved={async () => { await loadClients(); setEditClient(null) }}
        />
      )}

      {showAdd && (
        <AddClientModal
          onClose={() => setShowAdd(false)}
          onSaved={async () => { await loadClients(); setShowAdd(false) }}
        />
      )}
    </div>
  )
}
