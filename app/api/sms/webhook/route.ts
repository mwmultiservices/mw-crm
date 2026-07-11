import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendPushToTeam } from '@/lib/push'

// ============================================================
// POST /api/sms/webhook — SMS ENTRANT depuis Twilio.
// Twilio envoie du form-urlencoded (From, To, Body, MessageSid).
// On rattache au lead par numéro (10 derniers chiffres) puis on insère
// le message (direction 'in'). Réponse = TwiML vide (Twilio l'exige).
// À configurer dans Twilio : Messaging → webhook entrant → cette URL.
//
// En plus : lève leads.unread_sms (pastille « a répondu » sur le Kanban)
// et notifie par Web Push les managers + le rep assigné.
// ============================================================

const TWIML_EMPTY =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

function last10(phone: string | null | undefined): string {
  return (phone || '').replace(/\D/g, '').slice(-10)
}

export async function POST(request: Request) {
  let from = ''
  let bodyText = ''
  let sid: string | null = null

  try {
    const form = await request.formData()
    from = String(form.get('From') ?? '')
    bodyText = String(form.get('Body') ?? '')
    sid = form.get('MessageSid') ? String(form.get('MessageSid')) : null
  } catch {
    return new Response(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } })
  }

  if (!bodyText.trim()) {
    return new Response(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } })
  }

  // Rattachement au lead par numéro (match sur les 10 derniers chiffres).
  let lead: { id: string; name: string; rep_id: string | null } | null = null
  const fromKey = last10(from)
  if (fromKey) {
    const { data: leads } = await supabaseAdmin
      .from('leads')
      .select('id, name, rep_id, phone, created_at')
      .not('phone', 'is', null)
      .order('created_at', { ascending: false })
    lead = leads?.find((l) => last10(l.phone) === fromKey) ?? null
  }

  await supabaseAdmin.from('sms_messages').insert({
    lead_id: lead?.id ?? null,
    direction: 'in',
    message: bodyText,
    phone: from || null,
    twilio_sid: sid,
    status: 'received',
  })

  // Pastille « a répondu » sur le Kanban (best-effort si migration pas encore appliquée)
  if (lead) {
    await supabaseAdmin.from('leads').update({ unread_sms: true }).eq('id', lead.id)
  }

  // Notification push : managers + rep assigné
  await sendPushToTeam(
    {
      title: lead ? `💬 ${lead.name} a répondu` : `💬 SMS de ${from || 'inconnu'}`,
      body: bodyText.length > 120 ? bodyText.slice(0, 117) + '…' : bodyText,
      url: '/pipeline',
    },
    lead?.rep_id
  ).catch((e) => console.error('[webhook] push:', e))

  return new Response(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } })
}
