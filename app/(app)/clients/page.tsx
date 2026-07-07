'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isManager } from '@/lib/roles'
import { money } from '@/lib/payes'
import { stageLabel } from '@/lib/pipeline'
import {
  getClients, getClientHistory, createClient, updateClient, deleteClient,
  directionsUrl, type Client, type ClientHistory,
} from '@/lib/queries/clients'
import { Plus, Search, Users, Navigation, Phone, Mail, MapPin, X, Trash2, Pencil, RefreshCw } from 'lucide-react'

const SERVICE_LABELS: Record<string, string> = { fenetre: 'Fenêtres', paysagement: 'Paysagement', projet: 'Projet' }
const SERVICE_COLORS: Record<string, string> = { fenetre: '#69C9CA', paysagement: '#697035', projet: '#8D5D36' }
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })

export default function ClientsPage() {
  const [role, setRole] = useState<string | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Client | null>(null)
  const [editing, setEditing] = useState<Client | 'new' | null>(null)
  const [loading, setLoading] = useState(true)
  const [qbSyncing, setQbSyncing] = useState(false)
  const [qbMsg, setQbMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const manager = isManager(role)

  const load = useCallback(async () => {
    setClients(await getClients())
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        setRole(data?.role ?? 'rep')
      }
      await load()
      setLoading(false)
    })
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) =>
      [c.name, c.phone, c.address, c.city, c.email].some((f) => (f || '').toLowerCase().includes(q))
    )
  }, [clients, search])

  const onSaved = () => { setEditing(null); load() }
  const onDeleted = () => { setEditing(null); setSelected(null); load() }

  // Import QB → CRM : clients + contrats passés (Estimates/Invoices → historique)
  const syncQuickBooks = async () => {
    setQbSyncing(true); setQbMsg(null)
    try {
      const res = await fetch('/api/quickbooks/import', { method: 'POST' })
      const j = await res.json()
      if (j.ok) {
        setQbMsg({
          ok: true,
          text: `✓ QuickBooks : ${j.clientsCreated} client(s) créé(s), ${j.clientsUpdated} complété(s), ${j.quotesImported} devis + ${j.invoicesImported} facture(s) importés${j.skipped ? ` (${j.skipped} déjà présents)` : ''}.`,
        })
        await load()
      } else {
        setQbMsg({ ok: false, text: j.error || "Échec de l'import QuickBooks." })
      }
    } catch {
      setQbMsg({ ok: false, text: 'Erreur réseau.' })
    } finally {
      setQbSyncing(false)
    }
  }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', maxWidth: 1000, margin: '0 auto', padding: '8px 4px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Clients</h1>
        <span style={{ color: '#6B7280', fontSize: 13 }}>{clients.length}</span>
        {manager && (
          <button onClick={syncQuickBooks} disabled={qbSyncing} title="Importer les clients et contrats QuickBooks" style={{
            ...primaryBtn, marginLeft: 'auto', background: '#2CA01C', color: '#FFF', opacity: qbSyncing ? 0.6 : 1,
          }}>
            <RefreshCw size={15} style={qbSyncing ? { animation: 'mw-spin 1s linear infinite' } : undefined} />
            {qbSyncing ? 'Import…' : 'Importer QuickBooks'}
          </button>
        )}
        <button onClick={() => setEditing('new')} style={{ ...primaryBtn, marginLeft: manager ? 0 : 'auto' }}><Plus size={16} />Nouveau</button>
      </div>

      {qbMsg && (
        <div style={{
          padding: '9px 12px', borderRadius: 10, marginBottom: 12, fontSize: 13, fontWeight: 600,
          background: qbMsg.ok ? '#ECFDF5' : '#FEF2F2', color: qbMsg.ok ? '#047857' : '#B91C1C',
          border: `1px solid ${qbMsg.ok ? '#A7F3D0' : '#FCA5A5'}`,
        }}>{qbMsg.text}</div>
      )}

      {/* recherche */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par nom, téléphone, adresse…"
          style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 10, border: '1px solid #D1D5DB', fontSize: 14, boxSizing: 'border-box' }} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '50px 0', color: '#9CA3AF' }}>
          <Users size={26} />
          <span style={{ fontSize: 14 }}>{clients.length === 0 ? 'Aucun client pour l’instant.' : 'Aucun résultat.'}</span>
        </div>
      ) : (
        <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((c, i) => {
            const gps = directionsUrl(c)
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i ? '1px solid #F3F4F6' : 'none' }}>
                <button onClick={() => setSelected(c)} style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[c.address, c.city].filter(Boolean).join(', ') || c.phone || '—'}
                  </div>
                </button>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(c.services ?? []).map((s) => (
                    <span key={s} title={SERVICE_LABELS[s] ?? s} style={{ width: 10, height: 10, borderRadius: '50%', background: SERVICE_COLORS[s] ?? '#94A3B8' }} />
                  ))}
                </div>
                {gps && (
                  <a href={gps} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Itinéraire GPS" style={gpsBtn}>
                    <Navigation size={15} />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <ClientDrawer
          client={selected}
          canDelete={manager}
          onClose={() => setSelected(null)}
          onEdit={() => setEditing(selected)}
          onDeleted={onDeleted}
        />
      )}

      {editing && (
        <ClientModal
          client={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Fiche client (drawer) : détails + historique + GPS
function ClientDrawer({ client, canDelete, onClose, onEdit, onDeleted }: {
  client: Client; canDelete: boolean; onClose: () => void; onEdit: () => void; onDeleted: () => void
}) {
  const [hist, setHist] = useState<ClientHistory | null>(null)
  const gps = directionsUrl(client)

  useEffect(() => { getClientHistory(client.id).then(setHist) }, [client.id])

  const remove = async () => {
    if (!confirm(`Supprimer ${client.name} ? (l'historique lié est conservé)`)) return
    const { error } = await deleteClient(client.id)
    if (!error) onDeleted()
    else alert(error)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 40 }} />
      <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100vw)', background: '#FFF', zIndex: 50, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ padding: 16, borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{client.name}</div>
            <button onClick={onClose} aria-label="Fermer" style={iconBtn}><X size={18} /></button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {(client.services ?? []).map((s) => (
              <span key={s} style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: (SERVICE_COLORS[s] ?? '#94A3B8') + '1A', color: SERVICE_COLORS[s] ?? '#64748B' }}>{SERVICE_LABELS[s] ?? s}</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={onEdit} style={{ ...primaryBtn, flex: 1, justifyContent: 'center' }}><Pencil size={15} />Modifier</button>
            {gps && <a href={gps} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, flex: 1, justifyContent: 'center', textDecoration: 'none', background: '#111827', color: '#FFF' }}><Navigation size={15} />Itinéraire</a>}
            {canDelete && <button onClick={remove} aria-label="Supprimer" style={{ ...iconBtn, width: 40, height: 'auto', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626' }}><Trash2 size={16} /></button>}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {/* coordonnées */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            <InfoRow icon={<MapPin size={15} />} text={[client.address, client.city, client.postal_code].filter(Boolean).join(', ') || '—'} />
            <InfoRow icon={<Phone size={15} />} text={client.phone || '—'} href={client.phone ? `tel:${client.phone}` : undefined} />
            <InfoRow icon={<Mail size={15} />} text={client.email || '—'} href={client.email ? `mailto:${client.email}` : undefined} />
          </div>

          {/* spécifiques service */}
          {(client.num_vitres != null || client.superficie_pi2 != null) && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              {client.num_vitres != null && <MiniStat label="Vitres" value={String(client.num_vitres)} />}
              {client.superficie_pi2 != null && <MiniStat label="Superficie" value={`${client.superficie_pi2} pi²`} />}
            </div>
          )}

          {client.notes && (
            <div style={{ marginBottom: 18 }}>
              <Label>Notes</Label>
              <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', background: '#F9FAFB', borderRadius: 8, padding: 10 }}>{client.notes}</div>
            </div>
          )}

          {/* historique */}
          <Label>Historique</Label>
          {!hist ? (
            <div style={{ fontSize: 13, color: '#9CA3AF' }}>Chargement…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
              <HistGroup title={`Leads (${hist.leads.length})`} empty={hist.leads.length === 0}>
                {hist.leads.map((l) => (
                  <HistRow key={l.id} left={l.name} mid={stageLabel(l.stage)} right={l.price ? money(Number(l.price)) : ''} date={l.created_at} />
                ))}
              </HistGroup>
              <HistGroup title={`Soumissions (${hist.quotes.length})`} empty={hist.quotes.length === 0}>
                {hist.quotes.map((q) => (
                  <HistRow key={q.id} left={q.service_type || 'Soumission'} mid={q.status} right={q.price ? money(Number(q.price)) : ''} date={q.created_at} />
                ))}
              </HistGroup>
              <HistGroup title={`Jobs (${hist.jobs.length})`} empty={hist.jobs.length === 0}>
                {hist.jobs.map((j) => (
                  <HistRow key={j.id} left={j.title || j.type} mid={j.status} right="" date={j.start_at} />
                ))}
              </HistGroup>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

// ----------------------------------------------------------------------------
// Modal création / édition
function ClientModal({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!client
  const [name, setName] = useState(client?.name ?? '')
  const [address, setAddress] = useState(client?.address ?? '')
  const [city, setCity] = useState(client?.city ?? '')
  const [postal, setPostal] = useState(client?.postal_code ?? '')
  const [phone, setPhone] = useState(client?.phone ?? '')
  const [email, setEmail] = useState(client?.email ?? '')
  const [services, setServices] = useState<string[]>(client?.services ?? [])
  const [numVitres, setNumVitres] = useState(client?.num_vitres != null ? String(client.num_vitres) : '')
  const [superficie, setSuperficie] = useState(client?.superficie_pi2 != null ? String(client.superficie_pi2) : '')
  const [notes, setNotes] = useState(client?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleService = (s: string) => setServices((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))

  const save = async () => {
    if (!name.trim()) { setError('Nom requis.'); return }
    setSaving(true); setError('')
    const payload = {
      name: name.trim(), address: address || null, city: city || null, postal_code: postal || null,
      phone: phone || null, email: email || null, services,
      num_vitres: numVitres ? Number(numVitres) : null,
      superficie_pi2: superficie ? Number(superficie) : null,
      notes: notes || null,
    }
    const { error: e } = isEdit ? await updateClient(client!.id, payload) : await createClient(payload)
    setSaving(false)
    if (e) { setError(e); return }
    onSaved()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFF', borderRadius: 14, padding: 20, width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto', fontFamily: 'Inter, sans-serif' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>{isEdit ? 'Modifier le client' : 'Nouveau client'}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Nom *"><input value={name} onChange={(e) => setName(e.target.value)} style={inp} autoFocus /></Field>
          <Field label="Adresse"><input value={address} onChange={(e) => setAddress(e.target.value)} style={inp} placeholder="245 rue des Pins" /></Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Ville" flex><input value={city} onChange={(e) => setCity(e.target.value)} style={inp} /></Field>
            <Field label="Code postal" flex><input value={postal} onChange={(e) => setPostal(e.target.value)} style={inp} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Téléphone" flex><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} /></Field>
            <Field label="Courriel" flex><input value={email} onChange={(e) => setEmail(e.target.value)} style={inp} type="email" /></Field>
          </div>
          <Field label="Services">
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.entries(SERVICE_LABELS).map(([id, lbl]) => {
                const on = services.includes(id)
                return (
                  <button key={id} onClick={() => toggleService(id)} style={{
                    flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: on ? `2px solid ${SERVICE_COLORS[id]}` : '1px solid #D1D5DB',
                    background: on ? SERVICE_COLORS[id] + '14' : '#FFF', color: '#374151',
                  }}>{lbl}</button>
                )
              })}
            </div>
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Nb de vitres" flex><input value={numVitres} onChange={(e) => setNumVitres(e.target.value)} style={inp} type="number" inputMode="numeric" /></Field>
            <Field label="Superficie (pi²)" flex><input value={superficie} onChange={(e) => setSuperficie(e.target.value)} style={inp} type="number" inputMode="numeric" /></Field>
          </div>
          <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, minHeight: 54, resize: 'vertical' }} /></Field>
          {error && <div style={{ color: '#991B1B', fontSize: 13 }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1, justifyContent: 'center' }}>Annuler</button>
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : isEdit ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}

// --- petits composants ---
function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <label style={{ display: 'block', flex: flex ? 1 : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  )
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{children}</div>
}
function InfoRow({ icon, text, href }: { icon: React.ReactNode; text: string; href?: string }) {
  const inner = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: href ? '#0D6E6F' : '#374151' }}>
      <span style={{ color: '#9CA3AF' }}>{icon}</span>{text}
    </div>
  )
  return href ? <a href={href} style={{ textDecoration: 'none' }}>{inner}</a> : inner
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, background: '#F9FAFB', borderRadius: 8, padding: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{value}</div>
    </div>
  )
}
function HistGroup({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{title}</div>
      {empty ? <div style={{ fontSize: 12, color: '#C4C9D0' }}>—</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>}
    </div>
  )
}
function HistRow({ left, mid, right, date }: { left: string; mid: string; right: string; date: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '6px 8px', background: '#F9FAFB', borderRadius: 6 }}>
      <span style={{ flex: 1, color: '#111827', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{left}</span>
      <span style={{ color: '#6B7280' }}>{mid}</span>
      {right && <span style={{ fontWeight: 700, color: '#0D6E6F' }}>{right}</span>}
      {date && <span style={{ color: '#9CA3AF', fontSize: 11 }}>{fmtDate(date)}</span>}
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
const iconBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFF', cursor: 'pointer', color: '#374151',
}
const gpsBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8,
  border: '1px solid #D1D5DB', background: '#FFF', cursor: 'pointer', color: '#0D6E6F', flexShrink: 0, textDecoration: 'none',
}
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, background: '#FFF', boxSizing: 'border-box' }
