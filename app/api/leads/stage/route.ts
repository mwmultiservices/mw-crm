import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendSms } from '@/lib/sms'
import { stageMessageFor } from '@/lib/automations'
import { STAGE_IDS } from '@/lib/pipeline'

// ============================================================
// POST /api/leads/stage — change le stage d'un lead + automatisations.
// 1. met à jour leads.stage et lève le drapeau de relance
// 2. envoie le SMS auto associé au stage cible (scheduled, won…) si défini
// Body : { lead_id, stage }
// ============================================================

export async function POST(request: Request) {
  let body: { lead_id?: string; stage?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const { lead_id, stage } = body
  if (!lead_id || !stage) return Response.json({ error: 'lead_id et stage requis' }, { status: 400 })
  if (!STAGE_IDS.includes(stage)) return Response.json({ error: 'Stage inconnu' }, { status: 400 })

  // changer de stage = activité → on retire le drapeau « à relancer »
  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .update({ stage, needs_follow_up: false })
    .eq('id', lead_id)
    .select('id, phone')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // SMS automatique lié au stage (confirmation RDV, avis Google…)
  let autoSms = false
  const tpl = stageMessageFor(stage)
  if (tpl && lead?.phone) {
    const res = await sendSms({ lead_id, message: tpl, phone: lead.phone, auto: true })
    autoSms = res.ok
  }

  return Response.json({ ok: true, autoSms })
}
