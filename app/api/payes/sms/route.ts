import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendSms } from '@/lib/sms'
import { payRatesOf, hourlyRateFor } from '@/lib/payes'

// ============================================================
// POST /api/payes/sms — envoie la liste des salaires de la semaine
// (ou de la période de 2 semaines) par texto au demandeur.
// Body: { profile_id, week_of (lundi YYYY-MM-DD), weeks: 1 | 2 }
// Gating UI côté client (bouton admin) — même pattern que les autres routes.
// ============================================================

const money = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n || 0)

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function POST(request: Request) {
  let body: { profile_id?: string; week_of?: string; weeks?: number }
  try { body = await request.json() } catch { return Response.json({ error: 'JSON invalide' }, { status: 400 }) }

  const { profile_id, week_of } = body
  const weeks = body.weeks === 2 ? 2 : 1
  if (!profile_id || !week_of) return Response.json({ error: 'profile_id et week_of requis' }, { status: 400 })

  const { data: me } = await supabaseAdmin.from('profiles').select('phone, full_name').eq('id', profile_id).single()
  if (!me?.phone) return Response.json({ error: 'Aucun téléphone sur ton profil — ajoute-le dans Profil.' }, { status: 400 })

  const weekList = weeks === 2 ? [week_of, addDays(week_of, 7)] : [week_of]
  const endDate = addDays(week_of, weeks * 7) // exclusif

  const [{ data: comms }, { data: ts }] = await Promise.all([
    supabaseAdmin.from('commissions').select('commission_amount, bonus, paid, type, profiles(full_name)').in('week_of', weekList),
    supabaseAdmin.from('timesheets').select('hours, paid, work_type, profiles(*)').gte('date', week_of).lt('date', endDate),
  ])

  // agrège par nom
  const lines = new Map<string, { amount: number; paid: boolean; detail: string[] }>()
  const nameOf = (p: unknown): string => {
    const prof = Array.isArray(p) ? p[0] : p
    return (prof as { full_name?: string } | null)?.full_name ?? '—'
  }
  for (const c of comms ?? []) {
    const name = nameOf(c.profiles)
    const amt = (Number(c.commission_amount) || 0) + (Number(c.bonus) || 0)
    const e = lines.get(name) ?? { amount: 0, paid: true, detail: [] }
    e.amount += amt
    e.paid = e.paid && !!c.paid
    e.detail.push(
      c.type === 'vitres' || c.type === 'tech' ? 'vitres'
        : c.type === 'override' ? 'override'
        : 'ventes'
    )
    lines.set(name, e)
  }
  // chaque feuille de temps est payée à SON taux (paysagement vs commercial)
  const hoursByName = new Map<string, { hours: number; pay: number; paid: boolean }>()
  for (const t of ts ?? []) {
    const prof = (Array.isArray(t.profiles) ? t.profiles[0] : t.profiles) as Record<string, unknown> | null
    const name = (prof?.full_name as string) ?? '—'
    const rate = hourlyRateFor(t.work_type as string | null, payRatesOf(prof))
    const e = hoursByName.get(name) ?? { hours: 0, pay: 0, paid: true }
    const h = Number(t.hours) || 0
    e.hours += h
    e.pay += h * rate
    e.paid = e.paid && !!t.paid
    hoursByName.set(name, e)
  }
  for (const [name, h] of hoursByName) {
    const amt = Math.round(h.pay * 100) / 100
    const e = lines.get(name) ?? { amount: 0, paid: true, detail: [] }
    e.amount += amt
    e.paid = e.paid && h.paid
    e.detail.push(`${h.hours.toFixed(1)}h`)
    lines.set(name, e)
  }

  if (!lines.size) return Response.json({ error: 'Aucune paye sur cette période (recalculer d’abord ?).' }, { status: 400 })

  const endLabel = addDays(week_of, weeks * 7 - 1)
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })
  const rows = [...lines.entries()].sort((a, b) => b[1].amount - a[1].amount)
  const total = rows.reduce((s, [, e]) => s + e.amount, 0)
  const msg = [
    `MW — Payes du ${fmt(week_of)} au ${fmt(endLabel)}`,
    ...rows.map(([name, e]) => `• ${name}: ${money(e.amount)} (${e.detail.join(' + ')})${e.paid ? ' ✓payé' : ''}`),
    `TOTAL: ${money(total)}`,
  ].join('\n')

  const result = await sendSms({ message: msg, phone: me.phone })
  if (!result.ok) return Response.json({ error: result.error ?? 'Envoi impossible' }, { status: 500 })
  return Response.json({ ok: true, twilioConfigured: result.twilioConfigured })
}
