import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendSms } from '@/lib/sms'
import { AUTOMATIONS } from '@/lib/automations'

// ============================================================
// POST /api/leads — intake de leads entrants (site web, Meta Ads, etc.)
// Body JSON souple : { name, phone, email, source, service,
//                      service_category, price, notes }
// Insère un lead au stage 'new'. Protégé par un secret optionnel
// (header x-webhook-secret == LEADS_WEBHOOK_SECRET) si la variable est définie.
//
// Automatisation : SMS de bienvenue auto si la source est dans
// AUTOMATIONS.welcome.sources (cf. lib/automations.ts).
// ============================================================

const ALLOWED_CATEGORIES = ['fenetre', 'paysagement', 'projet']

export async function POST(request: Request) {
  // Garde optionnelle
  const secret = process.env.LEADS_WEBHOOK_SECRET
  if (secret && request.headers.get('x-webhook-secret') !== secret) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const name = (body.name ?? body.full_name ?? '') as string
  if (!name || !String(name).trim()) {
    return Response.json({ error: 'Nom requis' }, { status: 400 })
  }

  const category = body.service_category as string | undefined
  const lead = {
    name: String(name).trim(),
    phone: (body.phone as string) ?? null,
    email: (body.email as string) ?? null,
    source: (body.source as string) ?? 'site_web',
    service: (body.service as string) ?? null,
    service_category: category && ALLOWED_CATEGORIES.includes(category) ? category : null,
    price: body.price != null ? Number(body.price) : null,
    notes: (body.notes as string) ?? null,
    stage: 'new',
  }

  const { data, error } = await supabaseAdmin.from('leads').insert(lead).select().single()
  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Automatisation : SMS de bienvenue sur leads entrants (web/Meta) avec numéro.
  let welcomeSent = false
  if (
    AUTOMATIONS.welcome.enabled &&
    AUTOMATIONS.welcome.sources.includes(lead.source) &&
    lead.phone
  ) {
    const res = await sendSms({ lead_id: data.id, message: AUTOMATIONS.welcome.text, phone: lead.phone, auto: true })
    welcomeSent = res.ok
  }

  return Response.json({ ok: true, lead: data, welcomeSent }, { status: 201 })
}
