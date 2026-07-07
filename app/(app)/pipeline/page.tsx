'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isManager } from '@/lib/roles'
import {
  leadsToColumns, sourceLabel, SOURCE_LABELS, STAGES, type Lead,
} from '@/lib/pipeline'
import LeadDrawer from '@/components/pipeline/LeadDrawer'
import { Plus, KanbanSquare } from 'lucide-react'

const money = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

const LEAD_COLS =
  'id, name, phone, email, source, service, service_category, stage, rep_id, price, notes, needs_follow_up, created_at'

interface Profile { id: string; full_name: string | null }

function relDate(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return d === 0 ? 'Auj.' : d === 1 ? 'Hier' : `${d} j`
}

export default function PipelinePage() {
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [repFilter, setRepFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const manager = isManager(role)
  const profileName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of profiles) m[p.id] = p.full_name ?? '—'
    return m
  }, [profiles])

  const loadLeads = useCallback(async (r: string | null, uid: string | null) => {
    let q = supabase.from('leads').select(LEAD_COLS).order('created_at', { ascending: false })
    if (!isManager(r) && uid) q = q.eq('rep_id', uid)
    const { data } = await q
    setLeads((data as Lead[]) ?? [])
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const r = prof?.role ?? 'rep'
      setRole(r)
      const { data: profs } = await supabase.from('profiles').select('id, full_name').order('full_name')
      setProfiles((profs as Profile[]) ?? [])
      await loadLeads(r, user.id)
      setLoading(false)
    })
  }, [loadLeads])

  // realtime : tout changement sur leads recharge le board
  useEffect(() => {
    if (!role) return
    const channel = supabase
      .channel('pipeline-leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => loadLeads(role, userId))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [role, userId, loadLeads])

  const visibleLeads = useMemo(() => {
    if (!manager || repFilter === 'all') return leads
    return leads.filter((l) => l.rep_id === repFilter)
  }, [leads, manager, repFilter])

  const columns = useMemo(() => leadsToColumns(visibleLeads), [visibleLeads])

  // maj optimiste du stage (le drawer a déjà écrit en DB)
  const handleStageChange = (leadId: string, stage: string) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage } : l)))
    setSelected((s) => (s && s.id === leadId ? { ...s, stage } : s))
  }

  // drop d'une carte sur une colonne : maj optimiste + route serveur (mêmes automatisations que le drawer)
  const dropLead = async (leadId: string, newStage: string) => {
    setDragOver(null)
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.stage === newStage) return
    const prevStage = lead.stage
    handleStageChange(leadId, newStage)
    const res = await fetch('/api/leads/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, stage: newStage }),
    }).catch(() => null)
    if (!res || !res.ok) handleStageChange(leadId, prevStage)
  }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', padding: '8px 4px 80px' }}>
      {/* en-tête */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Pipeline</h1>
        <span style={{ color: '#6B7280', fontSize: 13 }}>{visibleLeads.length} leads</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {manager && (
            <select value={repFilter} onChange={(e) => setRepFilter(e.target.value)} style={selectStyle}>
              <option value="all">Tous les reps</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? '—'}</option>)}
            </select>
          )}
          <button onClick={() => setShowNew(true)} style={primaryBtn}><Plus size={16} />Nouveau lead</button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#9CA3AF', fontSize: 14, padding: 40, textAlign: 'center' }}>Chargement…</div>
      ) : leads.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '60px 0', color: '#9CA3AF' }}>
          <KanbanSquare size={28} />
          <span style={{ fontSize: 14 }}>Aucun lead pour l&apos;instant.</span>
          <button onClick={() => setShowNew(true)} style={primaryBtn}><Plus size={16} />Créer le premier lead</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
          {columns.map((col) => (
            <div
              key={col.id}
              style={{ flex: '0 0 260px', maxWidth: 260 }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOver !== col.id) setDragOver(col.id) }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver((d) => (d === col.id ? null : d)) }}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) dropLead(id, col.id) }}
            >
              <div style={{
                background: dragOver === col.id ? '#F0FDFA' : '#FFF', borderRadius: '0 0 8px 8px',
                border: `1px ${dragOver === col.id ? 'dashed' : 'solid'} ${dragOver === col.id ? col.color : '#E5E7EB'}`,
                borderTop: `3px solid ${col.color}`,
              }}>
                <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {col.label}
                    <span style={{ marginLeft: 6, color: '#9CA3AF' }}>{col.leads.length}</span>
                  </span>
                  {col.total > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: col.color }}>{money(col.total)}</span>}
                </div>
                <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 }}>
                  {col.leads.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => setSelected(lead)}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', lead.id); e.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => setDragOver(null)}
                      style={{ ...cardStyle, ...(lead.needs_follow_up ? { borderColor: '#F59E0B', background: '#FFFBEB' } : null) }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {lead.needs_follow_up && <span title="À relancer" style={{ fontSize: 12 }}>⏰</span>}
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{lead.name}</div>
                      </div>
                      {lead.service && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{lead.service}</div>}
                      {lead.price ? <div style={{ fontSize: 13, fontWeight: 700, color: col.color, marginTop: 4 }}>{money(Number(lead.price))}</div> : null}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', background: '#F3F4F6', padding: '1px 7px', borderRadius: 999 }}>{sourceLabel(lead.source)}</span>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                          {manager && lead.rep_id ? `${profileName[lead.rep_id] ?? ''} · ` : ''}{relDate(lead.created_at)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <LeadDrawer
          lead={selected}
          repName={selected.rep_id ? profileName[selected.rep_id] ?? null : null}
          onClose={() => setSelected(null)}
          onStageChange={handleStageChange}
        />
      )}

      {showNew && (
        <NewLeadModal
          profiles={profiles}
          manager={manager}
          defaultRep={manager ? '' : userId ?? ''}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); loadLeads(role, userId) }}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Modal de création de lead
// ----------------------------------------------------------------------------
function NewLeadModal({
  profiles, manager, defaultRep, onClose, onCreated,
}: {
  profiles: Profile[]; manager: boolean; defaultRep: string
  onClose: () => void; onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [service, setService] = useState('')
  const [category, setCategory] = useState('')
  const [source, setSource] = useState('site_web')
  const [price, setPrice] = useState('')
  const [stage, setStage] = useState('new')
  const [rep, setRep] = useState(defaultRep)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!name.trim()) { setError('Le nom est requis.'); return }
    setSaving(true); setError('')
    const { error: e } = await supabase.from('leads').insert({
      name: name.trim(),
      phone: phone || null,
      service: service || null,
      service_category: category || null,
      source,
      price: price ? Number(price) : null,
      stage,
      rep_id: rep || null,
    })
    setSaving(false)
    if (e) { setError(e.message); return }
    onCreated()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFF', borderRadius: 14, padding: 20, width: 'min(420px, 100%)', fontFamily: 'Inter, sans-serif' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>Nouveau lead</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Nom *"><input value={name} onChange={(e) => setName(e.target.value)} style={inp} autoFocus /></Field>
          <Field label="Téléphone"><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} placeholder="819-555-0000" /></Field>
          <Field label="Service"><input value={service} onChange={(e) => setService(e.target.value)} style={inp} placeholder="Lavage de fenêtres ext." /></Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Catégorie" flex>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={inp}>
                <option value="">—</option>
                <option value="fenetre">Fenêtres</option>
                <option value="paysagement">Paysagement</option>
                <option value="projet">Projet</option>
              </select>
            </Field>
            <Field label="Prix ($)" flex><input value={price} onChange={(e) => setPrice(e.target.value)} style={inp} type="number" inputMode="decimal" /></Field>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Source" flex>
              <select value={source} onChange={(e) => setSource(e.target.value)} style={inp}>
                {Object.entries(SOURCE_LABELS).map(([id, lbl]) => <option key={id} value={id}>{lbl}</option>)}
              </select>
            </Field>
            <Field label="Stage" flex>
              <select value={stage} onChange={(e) => setStage(e.target.value)} style={inp}>
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
          </div>
          {manager && (
            <Field label="Assigné à">
              <select value={rep} onChange={(e) => setRep(e.target.value)} style={inp}>
                <option value="">Non assigné</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? '—'}</option>)}
              </select>
            </Field>
          )}
          {error && <div style={{ color: '#991B1B', fontSize: 13 }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1, justifyContent: 'center' }}>Annuler</button>
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>{saving ? 'Enregistrement…' : 'Créer'}</button>
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

const selectStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, fontWeight: 600, color: '#374151', background: '#FFF',
}
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
const cardStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: 10, borderRadius: 10,
  border: '1px solid #E5E7EB', background: '#FFF', cursor: 'pointer',
}
const inp: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, background: '#FFF',
}
