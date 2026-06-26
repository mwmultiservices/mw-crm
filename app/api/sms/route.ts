import { sendSms } from '@/lib/sms'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// ============================================================
// POST /api/sms — envoi d'un SMS sortant (manuel, depuis le drawer).
// Insère toujours en DB ; Twilio seulement si configuré (cf. lib/sms).
// Écrire au lead lève aussi son drapeau « à relancer ».
// Body : { lead_id, message, phone }
// ============================================================

export async function POST(request: Request) {
  let body: { lead_id?: string; message?: string; phone?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const result = await sendSms({ lead_id: body.lead_id, message: body.message ?? '', phone: body.phone })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.twilioConfigured ? 502 : 500 })
  }

  // contacter le lead = relance traitée
  if (body.lead_id) {
    await supabaseAdmin.from('leads').update({ needs_follow_up: false }).eq('id', body.lead_id)
  }

  return Response.json({ ok: true, twilioConfigured: result.twilioConfigured, message: result.data })
}
