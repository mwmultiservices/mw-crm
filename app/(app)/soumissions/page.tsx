'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isManager } from '@/lib/roles'
import { money } from '@/lib/payes'
import {
  getQuotes, createQuote, updateQuote, deleteQuote, nextStatus,
  QUOTE_STATUSES, STATUS_BY_ID, CATEGORY_LABELS, type Quote,
} from '@/lib/queries/soumissions'
import { Plus, FileText, ArrowRight, Trash2 } from 'lucide-react'

interface Profile { id: string; full_name: string | null }

function relDate(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return d === 0 ? "Auj." : d === 1 ? 'Hier' : new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })
}

export default function SoumissionsPage() {
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [editing, setEditing] = useState<Quote | 'new' | null>(null)
  const [loading, setLoading] = useState(true)

  const manager = isManager(role)
  const profileName = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p.full_name ?? '—'])), [profiles])

  const load = useCallback(async (r: string | null, uid: string | null) => {
    setQuotes(await getQuotes(!isManager(r) && uid ? uid : undefined))
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
      await load(r, user.id)
      setLoading(false)
    })
  }, [load])

  const filtered = useMemo(
    () => (filter === 'all' ? quotes : quotes.filter((q) => q.status === filter)),
    [quotes, filter]
  )

  // résumé : total en attente (sent) + total concrétisé (signed/invoiced/paid)
  const summary = useMemo(() => {
    let pending = 0, closed = 0
    for (const q of quotes) {
      const v = Number(q.price) || 0
      if (q.status === 'sent') pending += v
      if (['signed', 'invoiced', 'paid'].includes(q.status)) closed += v
    }
    return { pending, closed }
  }, [quotes])

  const advance = async (q: Quote) => {
    const ns = nextStatus(q.status)
    if (!ns) return
    await updateQuote(q.id, { status: ns })
    setQuotes((prev) => prev.map((x) => (x.id === q.id ? { ...x, status: ns } : x)))
  }

  const onSaved = () => { setEditing(null); load(role, userId) }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', maxWidth: 1000, margin: '0 auto', padding: '8px 4px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Soumissions</h1>
        <span style={{ color: '#6B7280', fontSize: 13 }}>{quotes.length}</span>
        <button onClick={() => setEditing('new')} style={{ ...primaryBtn, marginLeft: 'auto' }}><Plus size={16} />Nouvelle</button>
      </div>

      {manager && <QuickBooksBar />}

      {/* résumé */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Stat label="En attente (envoyées)" value={money(summary.pending)} color="#92400E" />
        <Stat label="Concrétisées" value={money(summary.closed)} color="#047857" />
      </div>

      {/* filtres */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Toutes</Chip>
        {QUOTE_STATUSES.map((s) => (
          <Chip key={s.id} active={filter === s.id} onClick={() => setFilter(s.id)}>{s.label}</Chip>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '50px 0', color: '#9CA3AF' }}>
          <FileText size={26} />
          <span style={{ fontSize: 14 }}>Aucune soumission{filter !== 'all' ? ' dans ce statut' : ''}.</span>
        </div>
      ) : (
        <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((q, i) => {
            const st = STATUS_BY_ID[q.status]
            const ns = nextStatus(q.status)
            return (
              <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i ? '1px solid #F3F4F6' : 'none' }}>
                <button onClick={() => setEditing(q)} style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {q.client_name || 'Client —'}
                    {q.type === 'facture' && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#1E40AF', background: '#DBEAFE', padding: '1px 6px', borderRadius: 4 }}>FACTURE</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>
                    {q.service_type || (q.service_category && CATEGORY_LABELS[q.service_category]) || 'Service'}
                    {manager && q.rep_id ? ` · ${profileName[q.rep_id] ?? ''}` : ''} · {relDate(q.created_at)}
                  </div>
                </button>
                {q.price != null && <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>{money(Number(q.price))}</div>}
                <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: st?.bg, color: st?.color, whiteSpace: 'nowrap' }}>{st?.label ?? q.status}</span>
                {ns && (
                  <button onClick={() => advance(q)} title={`→ ${STATUS_BY_ID[ns].label}`} style={advanceBtn}>
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <QuoteModal
          quote={editing === 'new' ? null : editing}
          profiles={profiles}
          manager={manager}
          defaultRep={manager ? '' : userId ?? ''}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Barre de connexion QuickBooks (admin) — squelette OAuth2.
function QuickBooksBar() {
  const [state, setState] = useState<{ configured: boolean; connected: boolean; env: string } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/quickbooks/status').then((r) => r.json()).then(setState).catch(() => {})
    const qb = new URLSearchParams(window.location.search).get('qb')
    const messages: Record<string, string> = {
      connected: '✓ QuickBooks connecté.',
      error: 'Échec de la connexion QuickBooks.',
      state: 'Session de connexion expirée, réessaie.',
      unconfigured: 'QuickBooks pas encore configuré (credentials Intuit requis).',
    }
    if (qb && messages[qb]) setFlash(messages[qb])
  }, [])

  if (!state) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 12, marginBottom: 16, background: state.connected ? '#ECFDF5' : '#F9FAFB', border: `1px solid ${state.connected ? '#A7F3D0' : '#E5E7EB'}` }}>
      <FileText size={16} color={state.connected ? '#047857' : '#6B7280'} />
      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
        QuickBooks
        {state.connected ? <span style={{ color: '#047857' }}> · connecté ({state.env})</span> : ' · non connecté'}
      </span>
      <span style={{ flex: 1 }} />
      {flash && <span style={{ fontSize: 12, color: '#6B7280' }}>{flash}</span>}
      {!state.configured ? (
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>credentials Intuit requis (cf. DEPLOY.md)</span>
      ) : !state.connected ? (
        <a href="/api/quickbooks/connect" style={{ ...primaryBtn, textDecoration: 'none' }}>Connecter QuickBooks</a>
      ) : null}
    </div>
  )
}

// ----------------------------------------------------------------------------
function QuoteModal({
  quote, profiles, manager, defaultRep, onClose, onSaved,
}: {
  quote: Quote | null; profiles: Profile[]; manager: boolean; defaultRep: string
  onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!quote
  const [type, setType] = useState(quote?.type ?? 'devis')
  const [clientName, setClientName] = useState(quote?.client_name ?? '')
  const [serviceType, setServiceType] = useState(quote?.service_type ?? '')
  const [category, setCategory] = useState(quote?.service_category ?? '')
  const [plan, setPlan] = useState(quote?.plan ?? '')
  const [price, setPrice] = useState(quote?.price != null ? String(quote.price) : '')
  const [status, setStatus] = useState(quote?.status ?? 'draft')
  const [rep, setRep] = useState(quote?.rep_id ?? defaultRep)
  const [notes, setNotes] = useState(quote?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [qbSending, setQbSending] = useState(false)
  const [qbSent, setQbSent] = useState(!!quote?.quickbooks_id)
  const [qbMsg, setQbMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const sendToQb = async () => {
    if (!quote) return
    setQbSending(true); setQbMsg(null)
    try {
      const res = await fetch('/api/quickbooks/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.id }),
      })
      const j = await res.json()
      if (j.ok) {
        setQbSent(true)
        setQbMsg({ ok: true, text: `✓ ${j.entity === 'Invoice' ? 'Facture' : 'Devis'} créé dans QuickBooks${j.docNumber ? ` (#${j.docNumber})` : ''}.` })
      } else {
        if (j.already) setQbSent(true)
        setQbMsg({ ok: false, text: j.error || 'Échec de l’envoi.' })
      }
    } catch {
      setQbMsg({ ok: false, text: 'Erreur réseau.' })
    } finally {
      setQbSending(false)
    }
  }

  const save = async () => {
    if (!clientName.trim()) { setError('Nom du client requis.'); return }
    setSaving(true); setError('')
    const payload = {
      type, client_name: clientName.trim(), service_type: serviceType || null,
      service_category: category || null, plan: plan || null,
      price: price ? Number(price) : null, status, rep_id: rep || null, notes: notes || null,
    }
    const { error: e } = isEdit ? await updateQuote(quote!.id, payload) : await createQuote(payload)
    setSaving(false)
    if (e) { setError(e); return }
    onSaved()
  }

  const remove = async () => {
    if (!isEdit || !confirm('Supprimer cette soumission ?')) return
    setSaving(true)
    const { error: e } = await deleteQuote(quote!.id)
    setSaving(false)
    if (e) { setError(e); return }
    onSaved()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFF', borderRadius: 14, padding: 20, width: 'min(440px, 100%)', maxHeight: '90vh', overflowY: 'auto', fontFamily: 'Inter, sans-serif' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>{isEdit ? 'Modifier' : 'Nouvelle soumission'}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Type">
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ id: 'devis', l: 'Devis' }, { id: 'facture', l: 'Facture' }].map((t) => (
                <button key={t.id} onClick={() => setType(t.id)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: type === t.id ? '2px solid #69C9CA' : '1px solid #D1D5DB',
                  background: type === t.id ? '#69C9CA14' : '#FFF', color: '#374151',
                }}>{t.l}</button>
              ))}
            </div>
          </Field>
          <Field label="Client *"><input value={clientName} onChange={(e) => setClientName(e.target.value)} style={inp} autoFocus placeholder="Famille Tremblay" /></Field>
          <Field label="Service"><input value={serviceType} onChange={(e) => setServiceType(e.target.value)} style={inp} placeholder="Lavage fenêtres ext." /></Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Catégorie" flex>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={inp}>
                <option value="">—</option>
                <option value="fenetre">Fenêtres</option>
                <option value="paysagement">Paysagement</option>
                <option value="projet">Projet</option>
              </select>
            </Field>
            <Field label="Prix ($)" flex><input value={price} onChange={(e) => setPrice(e.target.value)} type="number" inputMode="decimal" style={inp} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Statut" flex>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inp}>
                {QUOTE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Plan" flex><input value={plan} onChange={(e) => setPlan(e.target.value)} style={inp} placeholder="1x / 2x / récurrent" /></Field>
          </div>
          {manager && (
            <Field label="Rep">
              <select value={rep} onChange={(e) => setRep(e.target.value)} style={inp}>
                <option value="">Non assigné</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? '—'}</option>)}
              </select>
            </Field>
          )}
          <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, minHeight: 54, resize: 'vertical' }} /></Field>
          {error && <div style={{ color: '#991B1B', fontSize: 13 }}>{error}</div>}
        </div>

        {manager && isEdit && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #F3F4F6' }}>
            {qbSent ? (
              <div style={{ fontSize: 13, fontWeight: 600, color: '#2CA01C' }}>✓ Envoyée dans QuickBooks</div>
            ) : (
              <button onClick={sendToQb} disabled={qbSending} style={{
                ...primaryBtn, width: '100%', justifyContent: 'center',
                background: '#2CA01C', color: '#FFF', opacity: qbSending ? 0.6 : 1,
              }}>{qbSending ? 'Envoi…' : 'Envoyer vers QuickBooks'}</button>
            )}
            {qbMsg && <div style={{ marginTop: 8, fontSize: 12, color: qbMsg.ok ? '#047857' : '#991B1B' }}>{qbMsg.text}</div>}
            {!qbSent && <div style={{ marginTop: 6, fontSize: 11, color: '#9CA3AF' }}>Envoie les valeurs enregistrées (enregistre d’abord tes modifications).</div>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
          {isEdit && (
            <button onClick={remove} disabled={saving} aria-label="Supprimer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}><Trash2 size={17} /></button>
          )}
          <button onClick={onClose} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1, justifyContent: 'center' }}>Annuler</button>
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : isEdit ? 'Enregistrer' : 'Créer'}</button>
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
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
      background: active ? '#111827' : '#F3F4F6', color: active ? '#FFF' : '#374151',
    }}>{children}</button>
  )
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
const advanceBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8,
  border: '1px solid #D1D5DB', background: '#FFF', cursor: 'pointer', color: '#374151', flexShrink: 0,
}
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, background: '#FFF', boxSizing: 'border-box' }
