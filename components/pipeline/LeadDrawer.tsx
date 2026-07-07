'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { STAGES, sourceLabel, stageColor, type Lead } from '@/lib/pipeline'
import { X, Send, Phone, Tag } from 'lucide-react'

// Templates SMS rapides (repris du CRM vanille)
const SMS_TPL: { key: string; label: string; text: string }[] = [
  { key: 'eta',    label: 'En route',   text: "Bonjour! L'équipe MW Multiservices est en route, arrivée dans ~30 min. À bientôt!" },
  { key: 'arrive', label: 'Arrivée',    text: "Bonjour! L'équipe MW Multiservices est maintenant chez vous. Bonne journée!" },
  { key: 'rappel', label: 'Rappel RDV', text: "Rappel: votre rendez-vous MW Multiservices est demain. Questions? 438-391-8780" },
  { key: 'review', label: 'Avis Google',text: "Merci pour votre confiance! Votre avis nous aide: https://share.google/CrlBX54OzZ2hFcsqS ⭐" },
]

interface SmsMessage {
  id: string
  direction: string
  message: string
  status: string | null
  created_at: string
}

interface Props {
  lead: Lead
  repName: string | null
  onClose: () => void
  onStageChange: (leadId: string, stage: string) => void
}

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

export default function LeadDrawer({ lead, repName, onClose, onStageChange }: Props) {
  const [thread, setThread] = useState<SmsMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [stage, setStage] = useState(lead.stage)
  const [toast, setToast] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  // (re)charge le fil SMS
  const loadThread = async () => {
    const { data } = await supabase
      .from('sms_messages')
      .select('id, direction, message, status, created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: true })
    setThread(data ?? [])
  }

  useEffect(() => {
    setStage(lead.stage)
    loadThread()
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
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [thread])

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
    if (!res.ok) { setStage(prev); setToast('Erreur changement de stage'); setTimeout(() => setToast(null), 2500); return }
    const data = await res.json().catch(() => ({}))
    onStageChange(lead.id, newStage)
    if (data.autoSms) { await loadThread(); setToast('SMS automatique envoyé'); setTimeout(() => setToast(null), 2500) }
  }

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
        <div style={{ padding: 16, borderBottom: '1px solid #E5E7EB' }}>
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
        </div>

        {/* fil SMS */}
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

        {toast && (
          <div style={{ position: 'absolute', bottom: 76, left: 12, right: 12, background: '#111827', color: '#FFF', padding: '8px 12px', borderRadius: 8, fontSize: 12, textAlign: 'center' }}>
            {toast}
          </div>
        )}
      </aside>
    </>
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
