'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { STAGES, sourceLabel, stageColor, stageLabel, type Lead } from '@/lib/pipeline'
import { findClientForLead, getClientHistory, type Client, type ClientHistory } from '@/lib/queries/clients'
import { createJob } from '@/lib/queries/calendar'
import { X, Send, Phone, Tag, Trash2, CalendarPlus, MessageSquare, ClipboardList, StickyNote, CalendarDays } from 'lucide-react'

// Templates SMS rapides (repris du CRM vanille)
const SMS_TPL: { key: string; label: string; text: string }[] = [
  { key: 'eta',    label: 'En route',   text: "Bonjour! L'équipe MW Multiservices est en route, arrivée dans ~30 min. À bientôt!" },
  { key: 'arrive', label: 'Arrivée',    text: "Bonjour! L'équipe MW Multiservices est maintenant chez vous. Bonne journée!" },
  { key: 'rappel', label: 'Rappel RDV', text: "Rappel: votre rendez-vous MW Multiservices est demain. Questions? 438-391-8780" },
  { key: 'review', label: 'Avis Google',text: "Merci pour votre confiance! Votre avis nous aide: https://share.google/CrlBX54OzZ2hFcsqS ⭐" },
]

// Types de job bookables → calendrier correspondant
const BOOK_TYPES: { id: string; label: string; cal: string; calHref: string }[] = [
  { id: 'fenetre', label: 'Vitres / Fenêtres',            cal: 'Fenêtres',    calHref: '/calendrier/fenetres' },
  { id: 'gazon',   label: 'Gazon (ouverture–fermeture)',  cal: 'Paysagement', calHref: '/calendrier/paysagement' },
  { id: 'projet',  label: 'Projet',                       cal: 'Paysagement', calHref: '/calendrier/paysagement' },
]
const bookType = (id: string) => BOOK_TYPES.find((t) => t.id === id) ?? BOOK_TYPES[0]
// catégorie du lead → type de job par défaut
const CATEGORY_TO_TYPE: Record<string, string> = { fenetre: 'fenetre', paysagement: 'gazon', projet: 'projet' }

interface SmsMessage {
  id: string
  direction: string
  message: string
  status: string | null
  created_at: string
}

interface LeadNote {
  id: string
  author_id: string | null
  author_name: string | null
  body: string
  created_at: string
}

interface LeadJob {
  id: string
  type: string
  team: string | null
  start_at: string | null
  status: string
  address: string | null
}

interface Props {
  lead: Lead
  repName: string | null
  manager: boolean
  userId: string | null
  userName: string | null
  onClose: () => void
  onStageChange: (leadId: string, stage: string) => void
  onRead?: (leadId: string) => void
}

type Tab = 'chat' | 'details' | 'notes' | 'booking'

const money = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

// « Aujourd'hui » / « Hier » / date longue, pour les séparateurs du fil SMS
function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = new Date(d); day.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000)
  if (diff === 0) return "Aujourd'hui"
  if (diff === 1) return 'Hier'
  return d.toLocaleDateString('fr-CA', {
    weekday: 'short', day: 'numeric', month: 'long',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : null),
  })
}

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString()

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const shortDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export default function LeadDrawer({ lead, repName, manager, userId, userName, onClose, onStageChange, onRead }: Props) {
  const [tab, setTab] = useState<Tab>('chat')
  const [thread, setThread] = useState<SmsMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [stage, setStage] = useState(lead.stage)
  const [toast, setToast] = useState<string | null>(null)
  const [notes, setNotes] = useState<LeadNote[]>([])
  const [notesError, setNotesError] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  // (re)charge le fil SMS + efface la pastille « a répondu »
  const loadThread = useCallback(async () => {
    const { data } = await supabase
      .from('sms_messages')
      .select('id, direction, message, status, created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: true })
    setThread(data ?? [])
    // conversation ouverte = réponse vue (best-effort si migration pas appliquée)
    supabase.from('leads').update({ unread_sms: false }).eq('id', lead.id).eq('unread_sms', true)
      .then(() => onRead?.(lead.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  const loadNotes = useCallback(async () => {
    const { data, error } = await supabase
      .from('lead_notes')
      .select('id, author_id, author_name, body, created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
    if (error) { setNotesError(error.message); return }
    setNotesError(null)
    setNotes((data as LeadNote[]) ?? [])
  }, [lead.id])

  useEffect(() => {
    setStage(lead.stage)
    setTab('chat')
    loadThread()
    loadNotes()
    // realtime : tout insert sur ce lead recharge le fil (idempotent → pas de doublon)
    const channel = supabase
      .channel(`sms-${lead.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sms_messages', filter: `lead_id=eq.${lead.id}` },
        loadThread
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  // auto-scroll en bas
  useEffect(() => {
    if (tab === 'chat' && threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [thread, tab])

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, message: msg, phone: lead.phone }),
      })
      const data = await res.json()
      if (!res.ok) { setToast(data?.error || 'Erreur envoi'); return }
      if (!data.twilioConfigured) setToast('Enregistré (Twilio non branché)')
      setInput('')
      await loadThread()
    } catch {
      setToast('Erreur réseau')
    } finally {
      setSending(false)
      setTimeout(() => setToast(null), 2500)
    }
  }

  const changeStage = async (newStage: string) => {
    const prev = stage
    setStage(newStage)
    // route serveur : met à jour le stage + déclenche les automatisations (SMS RDV/avis…)
    const res = await fetch('/api/leads/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: lead.id, stage: newStage }),
    })
    if (!res.ok) { setStage(prev); flash('Erreur changement de stage'); return }
    const data = await res.json().catch(() => ({}))
    onStageChange(lead.id, newStage)
    if (data.autoSms) { await loadThread(); flash('SMS automatique envoyé') }
  }

  const addNote = async (body: string) => {
    const { error } = await supabase.from('lead_notes').insert({
      lead_id: lead.id, author_id: userId, author_name: userName, body,
    })
    if (error) { flash(error.message); return }
    await loadNotes()
  }

  const deleteNote = async (id: string) => {
    await supabase.from('lead_notes').delete().eq('id', id)
    await loadNotes()
  }

  const TABS: { id: Tab; label: string; Icon: typeof MessageSquare; badge?: number }[] = [
    { id: 'chat',    label: 'Texto',   Icon: MessageSquare },
    { id: 'details', label: 'Détails', Icon: ClipboardList },
    { id: 'notes',   label: 'Notes',   Icon: StickyNote, badge: notes.length || undefined },
    { id: 'booking', label: 'Booking', Icon: CalendarDays },
  ]

  return (
    <>
      {/* backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 40 }} />
      {/* panneau */}
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100vw)',
        background: '#FFFFFF', zIndex: 50, display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', fontFamily: 'Inter, sans-serif',
      }}>
        {/* en-tête */}
        <div style={{ padding: '16px 16px 0', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{lead.name}</div>
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
                {lead.service || 'Service —'}{lead.price ? ` · ${money(Number(lead.price))}` : ''}
              </div>
            </div>
            <button onClick={onClose} aria-label="Fermer" style={iconBtn}><X size={18} /></button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <span style={chip}><Tag size={12} />{sourceLabel(lead.source)}</span>
            {lead.phone && <span style={chip}><Phone size={12} />{lead.phone}</span>}
            {repName && <span style={chip}>{repName}</span>}
          </div>

          {lead.needs_follow_up && (
            <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#FEF3C7', color: '#92400E', fontSize: 13, fontWeight: 600 }}>
              ⏰ À relancer — sans nouvelles depuis quelques jours. Écrivez un SMS ou changez le stage pour retirer le rappel.
            </div>
          )}

          {/* changement de stage */}
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stage</label>
            <select
              value={stage}
              onChange={(e) => changeStage(e.target.value)}
              style={{
                display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8,
                border: '1px solid #D1D5DB', fontSize: 14, fontWeight: 600, color: '#111827',
                borderLeft: `4px solid ${stageColor(stage)}`, background: '#FFF',
              }}
            >
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          {/* onglets */}
          <div style={{ display: 'flex', marginTop: 12 }}>
            {TABS.map(({ id, label, Icon, badge }) => {
              const active = tab === id
              return (
                <button key={id} onClick={() => setTab(id)} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  padding: '9px 4px', border: 'none', background: 'transparent', cursor: 'pointer',
                  borderBottom: active ? '2px solid #69C9CA' : '2px solid transparent',
                  color: active ? '#0F766E' : '#6B7280', fontSize: 12.5, fontWeight: active ? 700 : 600,
                }}>
                  <Icon size={14} />{label}
                  {badge ? <span style={{ fontSize: 10, fontWeight: 700, background: '#E5E7EB', color: '#374151', borderRadius: 999, padding: '0 6px' }}>{badge}</span> : null}
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── Onglet Texto ─── */}
        {tab === 'chat' && (
          <>
            <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#F9FAFB' }}>
              {thread.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, paddingTop: 24 }}>
                  Aucun message. Envoyez un SMS pour démarrer la conversation.
                </div>
              ) : (
                thread.map((m, i) => {
                  const out = m.direction === 'out'
                  const showDay = i === 0 || !sameDay(m.created_at, thread[i - 1].created_at)
                  return (
                    <div key={m.id}>
                      {showDay && (
                        <div style={{ display: 'flex', justifyContent: 'center', margin: i === 0 ? '0 0 12px' : '14px 0 12px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#E5E7EB', padding: '3px 12px', borderRadius: 999 }}>
                            {dayLabel(m.created_at)}
                          </span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                      <div style={{
                        maxWidth: '78%', padding: '8px 12px', borderRadius: 14, fontSize: 14, lineHeight: 1.35,
                        background: out ? '#69C9CA' : '#FFFFFF', color: out ? '#06363B' : '#111827',
                        border: out ? 'none' : '1px solid #E5E7EB',
                        borderBottomRightRadius: out ? 4 : 14, borderBottomLeftRadius: out ? 14 : 4,
                      }}>
                        {m.message}
                        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3, textAlign: 'right' }}>
                          {new Date(m.created_at).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}
                          {m.status === 'stub' ? ' · non envoyé' : ''}
                        </div>
                      </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* templates rapides */}
            <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderTop: '1px solid #E5E7EB', flexWrap: 'wrap' }}>
              {SMS_TPL.map((t) => (
                <button key={t.key} onClick={() => send(t.text)} disabled={sending} style={tplBtn}>{t.label}</button>
              ))}
            </div>

            {/* composer */}
            <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #E5E7EB' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send(input) }}
                placeholder={lead.phone ? 'Écrire un SMS…' : 'Aucun numéro pour ce lead'}
                disabled={!lead.phone}
                style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #D1D5DB', fontSize: 14 }}
              />
              <button onClick={() => send(input)} disabled={sending || !input.trim()} style={{
                ...iconBtn, background: '#69C9CA', color: '#06363B', width: 44, height: 'auto',
                opacity: sending || !input.trim() ? 0.5 : 1,
              }} aria-label="Envoyer"><Send size={18} /></button>
            </div>
          </>
        )}

        {/* ─── Onglet Détails ─── */}
        {tab === 'details' && <DetailsTab lead={lead} repName={repName} />}

        {/* ─── Onglet Notes ─── */}
        {tab === 'notes' && (
          <NotesTab
            notes={notes}
            error={notesError}
            manager={manager}
            userId={userId}
            onAdd={addNote}
            onDelete={deleteNote}
          />
        )}

        {/* ─── Onglet Booking ─── */}
        {tab === 'booking' && <BookingTab lead={lead} manager={manager} flash={flash} />}

        {toast && (
          <div style={{ position: 'absolute', bottom: 76, left: 12, right: 12, background: '#111827', color: '#FFF', padding: '8px 12px', borderRadius: 8, fontSize: 12, textAlign: 'center', zIndex: 5 }}>
            {toast}
          </div>
        )}
      </aside>
    </>
  )
}

// ----------------------------------------------------------------------------
// Onglet Détails — formulaire/demande du client + historique du client
// ----------------------------------------------------------------------------
function DetailsTab({ lead, repName }: { lead: Lead; repName: string | null }) {
  const [client, setClient] = useState<Client | null>(null)
  const [history, setHistory] = useState<ClientHistory | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const c = await findClientForLead(lead.client_id, lead.phone)
      if (cancelled) return
      setClient(c)
      if (c) {
        const h = await getClientHistory(c.id)
        if (!cancelled) setHistory(h)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [lead.id, lead.client_id, lead.phone])

  const CAT_LABELS: Record<string, string> = { fenetre: 'Fenêtres', paysagement: 'Paysagement', projet: 'Projet' }
  const pastLeads = (history?.leads ?? []).filter((l) => l.id !== lead.id)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#F9FAFB' }}>
      {/* détails de la job */}
      <SectionTitle>Détails de la job</SectionTitle>
      <div style={card}>
        <Row k="Service" v={lead.service || '—'} />
        <Row k="Catégorie" v={lead.service_category ? (CAT_LABELS[lead.service_category] ?? lead.service_category) : '—'} />
        <Row k="Prix" v={lead.price ? money(Number(lead.price)) : '—'} />
        <Row k="Source" v={sourceLabel(lead.source)} />
        <Row k="Téléphone" v={lead.phone ? <a href={`tel:${lead.phone}`} style={{ color: '#0F766E' }}>{lead.phone}</a> : '—'} />
        <Row k="Courriel" v={lead.email ? <a href={`mailto:${lead.email}`} style={{ color: '#0F766E' }}>{lead.email}</a> : '—'} />
        <Row k="Reçu le" v={shortDateTime(lead.created_at)} />
        <Row k="Assigné à" v={repName ?? 'Non assigné'} last />
      </div>

      {lead.notes && (
        <>
          <SectionTitle>Demande du client (formulaire)</SectionTitle>
          <div style={{ ...card, fontSize: 13.5, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
            {lead.notes}
          </div>
        </>
      )}

      {/* historique du client */}
      <SectionTitle>Historique du client</SectionTitle>
      {loading ? (
        <div style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</div>
      ) : !client ? (
        <div style={{ ...card, fontSize: 13, color: '#6B7280' }}>
          Aucun client existant trouvé (par numéro de téléphone) — c&apos;est probablement un nouveau client.
        </div>
      ) : (
        <>
          <div style={{ ...card, fontSize: 13, color: '#374151' }}>
            <div style={{ fontWeight: 700, color: '#111827' }}>{client.name}</div>
            {(client.address || client.city) && (
              <div style={{ marginTop: 2 }}>{[client.address, client.city].filter(Boolean).join(', ')}</div>
            )}
            {(client.services ?? []).length > 0 && (
              <div style={{ marginTop: 4, color: '#6B7280' }}>Services : {(client.services ?? []).join(', ')}</div>
            )}
          </div>

          {history && history.jobs.length > 0 && (
            <>
              <SubTitle>Jobs faites ({history.jobs.length})</SubTitle>
              {history.jobs.map((j) => (
                <div key={j.id} style={histRow}>
                  <span style={{ fontWeight: 600, color: '#111827' }}>{j.title || bookType(j.type).label}</span>
                  <span style={{ color: '#6B7280' }}>{bookType(j.type).label} · {shortDate(j.start_at)} · {j.status === 'done' ? 'faite' : j.status === 'canceled' ? 'annulée' : 'cédulée'}</span>
                </div>
              ))}
            </>
          )}
          {history && history.quotes.length > 0 && (
            <>
              <SubTitle>Soumissions ({history.quotes.length})</SubTitle>
              {history.quotes.map((q) => (
                <div key={q.id} style={histRow}>
                  <span style={{ fontWeight: 600, color: '#111827' }}>{q.service_type || 'Soumission'}{q.price ? ` · ${money(Number(q.price))}` : ''}</span>
                  <span style={{ color: '#6B7280' }}>{q.status} · {shortDate(q.created_at)}</span>
                </div>
              ))}
            </>
          )}
          {pastLeads.length > 0 && (
            <>
              <SubTitle>Leads antérieurs ({pastLeads.length})</SubTitle>
              {pastLeads.map((l) => (
                <div key={l.id} style={histRow}>
                  <span style={{ fontWeight: 600, color: '#111827' }}>{l.name}{l.price ? ` · ${money(Number(l.price))}` : ''}</span>
                  <span style={{ color: '#6B7280' }}>{stageLabel(l.stage)} · {shortDate(l.created_at)}</span>
                </div>
              ))}
            </>
          )}
          {history && history.jobs.length === 0 && history.quotes.length === 0 && pastLeads.length === 0 && (
            <div style={{ fontSize: 13, color: '#6B7280' }}>Client connu, mais aucun service dans l&apos;historique.</div>
          )}
        </>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Onglet Notes — notes rattachées à CE lead (la job du pipeline), pas au client
// ----------------------------------------------------------------------------
function NotesTab({ notes, error, manager, userId, onAdd, onDelete }: {
  notes: LeadNote[]; error: string | null; manager: boolean; userId: string | null
  onAdd: (body: string) => Promise<void>; onDelete: (id: string) => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const body = draft.trim()
    if (!body || saving) return
    setSaving(true)
    await onAdd(body)
    setSaving(false)
    setDraft('')
  }

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#F9FAFB' }}>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>
          Notes de cette job (ex. lors de l&apos;appel). Elles suivent le lead du pipeline, pas la fiche client.
        </div>
        {error ? (
          <div style={{ ...card, fontSize: 13, color: '#991B1B' }}>
            Notes indisponibles — la migration <code>migration_crm_pipeline_inbox.sql</code> n&apos;est pas encore appliquée.
          </div>
        ) : notes.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, paddingTop: 24 }}>Aucune note pour cette job.</div>
        ) : (
          notes.map((n) => (
            <div key={n.id} style={{ ...card, position: 'relative' }}>
              <div style={{ fontSize: 13.5, color: '#111827', whiteSpace: 'pre-wrap', lineHeight: 1.45, paddingRight: 26 }}>{n.body}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                {n.author_name ?? '—'} · {shortDateTime(n.created_at)}
              </div>
              {(manager || n.author_id === userId) && (
                <button onClick={() => onDelete(n.id)} title="Supprimer" style={{
                  position: 'absolute', top: 8, right: 8, border: 'none', background: 'transparent',
                  color: '#9CA3AF', cursor: 'pointer', padding: 4,
                }}><Trash2 size={14} /></button>
              )}
            </div>
          ))
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #E5E7EB' }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ajouter une note (appel, détails, suivi…)"
          rows={2}
          disabled={!!error}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #D1D5DB', fontSize: 14, resize: 'none', fontFamily: 'inherit' }}
        />
        <button onClick={submit} disabled={saving || !draft.trim() || !!error} style={{
          ...iconBtn, background: '#69C9CA', color: '#06363B', width: 44, height: 'auto',
          opacity: saving || !draft.trim() || !!error ? 0.5 : 1,
        }} aria-label="Ajouter la note"><Send size={18} /></button>
      </div>
    </>
  )
}

// ----------------------------------------------------------------------------
// Onglet Booking — placer la job dans le bon calendrier (Vitres / Gazon / Projet).
// Plusieurs services dans la soumission → on peut booker plusieurs fois,
// une job par calendrier.
// ----------------------------------------------------------------------------
function BookingTab({ lead, manager, flash }: { lead: Lead; manager: boolean; flash: (m: string) => void }) {
  const [jobs, setJobs] = useState<LeadJob[]>([])
  const [type, setType] = useState(CATEGORY_TO_TYPE[lead.service_category ?? ''] ?? 'fenetre')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('10:00')
  const [team, setTeam] = useState('equipe1')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [clientId, setClientId] = useState<string | null>(lead.client_id ?? null)

  const loadJobs = useCallback(async () => {
    const { data } = await supabase
      .from('jobs')
      .select('id, type, team, start_at, status, address')
      .eq('lead_id', lead.id)
      .order('start_at', { ascending: true })
    setJobs((data as LeadJob[]) ?? [])
  }, [lead.id])

  useEffect(() => {
    loadJobs()
    // préremplit l'adresse depuis la fiche client si on la connaît
    findClientForLead(lead.client_id, lead.phone).then((c) => {
      if (!c) return
      setClientId((prev) => prev ?? c.id)
      setAddress((prev) => prev || [c.address, c.city].filter(Boolean).join(', '))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  const book = async () => {
    if (!date) { setError('Date requise.'); return }
    setSaving(true); setError('')
    const t = bookType(type)
    const { error: e } = await createJob({
      title: lead.name,
      service: lead.service || t.label,
      type,
      team,
      address: address.trim() || null,
      start_at: date && start ? new Date(`${date}T${start}`).toISOString() : null,
      end_at: date && end ? new Date(`${date}T${end}`).toISOString() : null,
      price: lead.price != null ? Number(lead.price) : null,
      lead_id: lead.id,
      client_id: clientId,
    })
    setSaving(false)
    if (e) { setError(e); return }
    flash(`Ajouté au calendrier ${t.cal} ✓`)
    setDate('')
    await loadJobs()
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#F9FAFB' }}>
      {/* jobs déjà bookées pour ce lead */}
      <SectionTitle>À l&apos;horaire pour ce client</SectionTitle>
      {jobs.length === 0 ? (
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 4 }}>Rien de booké pour cette job.</div>
      ) : (
        jobs.map((j) => {
          const t = bookType(j.type)
          return (
            <a key={j.id} href={t.calHref} style={{ ...card, display: 'block', textDecoration: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 700, color: '#111827', fontSize: 13.5 }}>{t.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: j.status === 'canceled' ? '#991B1B' : '#0F766E' }}>
                  {j.status === 'done' ? 'Faite' : j.status === 'canceled' ? 'Annulée' : 'Cédulée'}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: '#6B7280', marginTop: 3 }}>
                {shortDateTime(j.start_at)} · {j.team === 'equipe2' ? 'Équipe 2' : 'Équipe 1'} · cal. {t.cal}
              </div>
            </a>
          )
        })
      )}

      {/* formulaire de booking */}
      {manager ? (
        <>
          <SectionTitle style={{ marginTop: 18 }}>Placer à l&apos;horaire</SectionTitle>
          <div style={card}>
            <BField label="Service / calendrier">
              <select value={type} onChange={(e) => setType(e.target.value)} style={inp}>
                {BOOK_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label} — cal. {t.cal}</option>)}
              </select>
            </BField>
            <div style={{ display: 'flex', gap: 8 }}>
              <BField label="Date" flex><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} /></BField>
              <BField label="Début" flex><input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={inp} /></BField>
              <BField label="Fin" flex><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={inp} /></BField>
            </div>
            <BField label="Équipe">
              <div style={{ display: 'flex', gap: 6 }}>
                {(['equipe1', 'equipe2'] as const).map((id) => (
                  <button key={id} onClick={() => setTeam(id)} style={{
                    flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${team === id ? '#69C9CA' : '#D1D5DB'}`,
                    background: team === id ? 'rgba(105,201,202,0.12)' : '#FFF',
                    color: team === id ? '#0F766E' : '#374151',
                  }}>{id === 'equipe1' ? 'Équipe 1' : 'Équipe 2'}</button>
                ))}
              </div>
            </BField>
            <BField label="Adresse"><input value={address} onChange={(e) => setAddress(e.target.value)} style={inp} placeholder="123 rue Principale, Gatineau" /></BField>
            {error && <div style={{ color: '#991B1B', fontSize: 13, marginBottom: 8 }}>{error}</div>}
            <button onClick={book} disabled={saving} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
              padding: '10px 0', borderRadius: 10, border: 'none', background: '#69C9CA', color: '#06363B',
              fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1,
            }}><CalendarPlus size={16} />{saving ? 'Ajout…' : 'Booker cette job'}</button>
            <div style={{ fontSize: 11.5, color: '#9CA3AF', marginTop: 8 }}>
              Plusieurs services dans la soumission ? Bookez une fois par service — chaque job va dans son calendrier.
            </div>
          </div>
        </>
      ) : (
        <div style={{ ...card, fontSize: 13, color: '#6B7280', marginTop: 14 }}>
          Seuls les admins peuvent céduler. Demande à ton lead de placer la job à l&apos;horaire.
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Petits helpers d'UI
// ----------------------------------------------------------------------------
function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px', ...style }}>
      {children}
    </div>
  )
}
function SubTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: '12px 0 6px' }}>{children}</div>
}
function Row({ k, v, last }: { k: string; v: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderBottom: last ? 'none' : '1px solid #F3F4F6', fontSize: 13 }}>
      <span style={{ color: '#6B7280', flexShrink: 0 }}>{k}</span>
      <span style={{ color: '#111827', fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span>
    </div>
  )
}
function BField({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <label style={{ display: 'block', flex: flex ? 1 : undefined, marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  )
}

const iconBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32,
  borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFF', cursor: 'pointer', color: '#374151',
}
const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999,
  background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 600,
}
const tplBtn: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 999, border: '1px solid #D1D5DB', background: '#FFF',
  color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const card: React.CSSProperties = {
  background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 10, padding: 12, marginBottom: 10,
}
const histRow: React.CSSProperties = {
  ...card, padding: '8px 12px', marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12.5,
}
const inp: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, background: '#FFF',
}
