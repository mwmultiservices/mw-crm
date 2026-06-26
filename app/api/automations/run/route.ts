import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendSms } from '@/lib/sms'
import { AUTOMATIONS } from '@/lib/automations'

// ============================================================
// POST/GET /api/automations/run — relances d'inactivité.
// Marque « à relancer » les leads d'un stage actif sans mouvement depuis
// AUTOMATIONS.followUp.delayDays. Selon l'action : flag in-app et/ou SMS client.
//
// À appeler par un CRON (Vercel Cron en Phase 7). Protégé par CRON_SECRET
// (header x-cron-secret) si la variable est définie.
// ============================================================

async function run() {
  const fu = AUTOMATIONS.followUp
  if (!fu.enabled) return { ok: true, disabled: true, flagged: 0, smsSent: 0 }

  const cutoff = new Date(Date.now() - fu.delayDays * 86400000).toISOString()

  // leads actifs, sans mouvement depuis le délai, pas déjà signalés
  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .update({ needs_follow_up: true, follow_up_at: new Date().toISOString() })
    .in('stage', fu.activeStages)
    .eq('needs_follow_up', false)
    .lt('updated_at', cutoff)
    .select('id, phone')

  if (error) return { ok: false, error: error.message }

  let smsSent = 0
  if (fu.action === 'sms_client' || fu.action === 'both') {
    for (const l of leads ?? []) {
      if (l.phone) {
        const res = await sendSms({ lead_id: l.id, message: fu.smsText, phone: l.phone, auto: true })
        if (res.ok) smsSent++
      }
    }
  }

  return { ok: true, flagged: leads?.length ?? 0, smsSent, action: fu.action }
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // pas de secret défini → ouvert (dev)
  // Vercel Cron envoie « Authorization: Bearer <CRON_SECRET> » ;
  // on accepte aussi un header x-cron-secret pour les appels manuels.
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}` || request.headers.get('x-cron-secret') === secret
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Non autorisé' }, { status: 401 })
  return Response.json(await run())
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Non autorisé' }, { status: 401 })
  return Response.json(await run())
}
