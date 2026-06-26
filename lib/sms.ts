import { supabaseAdmin } from './supabaseAdmin'

// ============================================================
// Helper d'envoi SMS — UNIQUEMENT côté serveur (routes API).
// Insère toujours dans sms_messages ; n'appelle Twilio que si les
// variables TWILIO_* sont présentes (sinon status 'stub' / 'auto-stub').
// ============================================================

export interface SendSmsInput {
  lead_id?: string | null
  message: string
  phone?: string | null
  auto?: boolean // true = déclenché par une automatisation (statut distinct)
}

export interface SendSmsResult {
  ok: boolean
  twilioConfigured: boolean
  error?: string
  data?: unknown
}

export function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  )
}

export async function sendSms({ lead_id, message, phone, auto = false }: SendSmsInput): Promise<SendSmsResult> {
  const msg = (message || '').trim()
  if (!msg) return { ok: false, twilioConfigured: false, error: 'Message vide' }

  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER
  const configured = twilioConfigured()

  let twilioSid: string | null = null
  let status = configured ? 'sent' : auto ? 'auto-stub' : 'stub'

  if (configured && phone) {
    try {
      const params = new URLSearchParams({ To: phone, From: from!, Body: msg })
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, twilioConfigured: true, error: data?.message || 'Erreur Twilio' }
      twilioSid = data.sid ?? null
      status = data.status ?? 'sent'
    } catch (e) {
      console.error('[SMS] Twilio:', e)
      return { ok: false, twilioConfigured: true, error: 'Envoi Twilio impossible' }
    }
  }

  const { data, error } = await supabaseAdmin
    .from('sms_messages')
    .insert({ lead_id: lead_id ?? null, direction: 'out', message: msg, phone: phone ?? null, twilio_sid: twilioSid, status })
    .select()
    .single()

  if (error) return { ok: false, twilioConfigured: configured, error: error.message }
  return { ok: true, twilioConfigured: configured, data }
}
