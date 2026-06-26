import { supabase } from '@/lib/supabase'
import { TECH_RATE, repBonus, weekRangeISO, addWeeks, hoursBetween } from '@/lib/payes'

// ============================================================
// Requêtes Payes (Phase 5) — commissions (vente/fenêtres) + heures (paysagement).
// Lectures perso = RLS (self) ; calcul & marquage = session admin.
// ============================================================

export interface CommissionRow {
  id: string
  profile_id: string
  type: string
  week_of: string
  sales_amount: number
  rate: number
  commission_amount: number
  jobs_count: number
  deals_closed: number
  bonus: number
  paid: boolean
  paid_at: string | null
  profiles?: { full_name: string | null; role: string | null } | null
}

export interface TimesheetRow {
  id: string
  profile_id: string
  date: string
  clock_in: string | null
  clock_out: string | null
  hours: number
  job_note: string | null
  paid: boolean
  profiles?: { full_name: string | null; hourly_rate: number | null } | null
}

export interface EmployeeHours {
  profile_id: string
  name: string
  hourly_rate: number
  rows: TimesheetRow[]
  totalHours: number
  pay: number
  paid: boolean
}

// --- COMMISSIONS (admin) ---------------------------------------------------
export async function getCommissions(weekOf: string): Promise<CommissionRow[]> {
  const { data } = await supabase
    .from('commissions')
    .select('*, profiles(full_name, role)')
    .eq('week_of', weekOf)
    .order('commission_amount', { ascending: false })
  return (data as CommissionRow[]) ?? []
}

export async function markCommissionPaid(id: string, paid: boolean): Promise<void> {
  await supabase
    .from('commissions')
    .update({ paid, paid_at: paid ? new Date().toISOString() : null })
    .eq('id', id)
}

// Calcule (et upsert) les commissions de la semaine.
// Reps/leads : % (ou montant fixe × deals) sur les leads gagnés de la semaine.
// Techs : 18% du revenu des jobs fenêtres « done » (réparti si plusieurs assignés).
// Ne touche pas aux lignes déjà payées.
export async function computeCommissions(weekOf: string): Promise<{ reps: number; techs: number }> {
  const { startISO, endISO } = weekRangeISO(weekOf)

  const [{ data: profiles }, { data: wonLeads }, { data: jobs }, { data: existing }] = await Promise.all([
    supabase.from('profiles').select('id, role, commission_type, commission_value'),
    supabase.from('leads').select('rep_id, price').eq('stage', 'won').gte('updated_at', startISO).lt('updated_at', endISO),
    supabase.from('jobs').select('assigned_ids, price, type, status, start_at').eq('type', 'fenetre').eq('status', 'done').gte('start_at', startISO).lt('start_at', endISO),
    supabase.from('commissions').select('profile_id, type, paid').eq('week_of', weekOf),
  ])

  const paidSet = new Set((existing ?? []).filter((e) => e.paid).map((e) => `${e.profile_id}:${e.type}`))
  const profById = new Map((profiles ?? []).map((p) => [p.id, p]))

  // --- reps ---
  const repAgg = new Map<string, { base: number; deals: number }>()
  for (const l of wonLeads ?? []) {
    if (!l.rep_id) continue
    const a = repAgg.get(l.rep_id) ?? { base: 0, deals: 0 }
    a.base += Number(l.price) || 0
    a.deals += 1
    repAgg.set(l.rep_id, a)
  }

  const repUpserts: Record<string, unknown>[] = []
  for (const [profileId, agg] of repAgg) {
    if (paidSet.has(`${profileId}:rep`)) continue
    const p = profById.get(profileId)
    if (!p || !['rep', 'lead', 'vendeur'].includes(p.role)) continue
    const value = Number(p.commission_value) || 0
    const isPercent = (p.commission_type ?? 'percent') === 'percent'
    const commission = isPercent ? Math.round(agg.base * value / 100) : value * agg.deals
    const bonus = repBonus(agg.base)
    repUpserts.push({
      profile_id: profileId, type: 'rep', week_of: weekOf,
      sales_amount: agg.base, rate: value, commission_amount: commission,
      deals_closed: agg.deals, jobs_count: agg.deals, bonus,
    })
  }

  // --- techs (jobs fenêtres done) ---
  const techAgg = new Map<string, { base: number; jobs: number }>()
  for (const j of jobs ?? []) {
    const ids: string[] = j.assigned_ids ?? []
    if (!ids.length) continue
    const share = (Number(j.price) || 0) / ids.length
    for (const id of ids) {
      const a = techAgg.get(id) ?? { base: 0, jobs: 0 }
      a.base += share
      a.jobs += 1
      techAgg.set(id, a)
    }
  }
  const techUpserts: Record<string, unknown>[] = []
  for (const [profileId, agg] of techAgg) {
    if (paidSet.has(`${profileId}:tech`)) continue
    const p = profById.get(profileId)
    if (!p || p.role !== 'tech') continue
    techUpserts.push({
      profile_id: profileId, type: 'tech', week_of: weekOf,
      sales_amount: Math.round(agg.base), rate: TECH_RATE * 100,
      commission_amount: Math.round(agg.base * TECH_RATE), jobs_count: agg.jobs, deals_closed: agg.jobs, bonus: 0,
    })
  }

  const all = [...repUpserts, ...techUpserts]
  if (all.length) {
    await supabase.from('commissions').upsert(all, { onConflict: 'profile_id,week_of,type' })
  }
  return { reps: repUpserts.length, techs: techUpserts.length }
}

// --- TIMESHEETS / HEURES (admin) -------------------------------------------
export async function getTimesheetsWeek(weekOf: string): Promise<EmployeeHours[]> {
  const end = addWeeks(weekOf, 1)
  const { data } = await supabase
    .from('timesheets')
    .select('*, profiles(full_name, hourly_rate)')
    .gte('date', weekOf)
    .lt('date', end)
    .order('date', { ascending: true })

  const rows = (data as TimesheetRow[]) ?? []
  const byEmp = new Map<string, EmployeeHours>()
  for (const r of rows) {
    let e = byEmp.get(r.profile_id)
    if (!e) {
      e = {
        profile_id: r.profile_id,
        name: r.profiles?.full_name ?? '—',
        hourly_rate: Number(r.profiles?.hourly_rate) || 0,
        rows: [], totalHours: 0, pay: 0, paid: false,
      }
      byEmp.set(r.profile_id, e)
    }
    e.rows.push(r)
    e.totalHours += Number(r.hours) || 0
    if (r.paid) e.paid = true
  }
  for (const e of byEmp.values()) {
    e.totalHours = Math.round(e.totalHours * 100) / 100
    e.pay = Math.round(e.totalHours * e.hourly_rate * 100) / 100
  }
  return [...byEmp.values()]
}

export async function markTimesheetsPaid(profileId: string, weekOf: string, paid: boolean): Promise<void> {
  const end = addWeeks(weekOf, 1)
  await supabase
    .from('timesheets')
    .update({ paid, paid_at: paid ? new Date().toISOString() : null })
    .eq('profile_id', profileId)
    .gte('date', weekOf)
    .lt('date', end)
}

// --- PERSO -----------------------------------------------------------------
export async function getMyCommission(profileId: string, weekOf: string): Promise<CommissionRow[]> {
  const { data } = await supabase
    .from('commissions')
    .select('*')
    .eq('profile_id', profileId)
    .eq('week_of', weekOf)
  return (data as CommissionRow[]) ?? []
}

export async function getMyTimesheets(profileId: string, weekOf: string): Promise<TimesheetRow[]> {
  const end = addWeeks(weekOf, 1)
  const { data } = await supabase
    .from('timesheets')
    .select('*')
    .eq('profile_id', profileId)
    .gte('date', weekOf)
    .lt('date', end)
    .order('date', { ascending: true })
  return (data as TimesheetRow[]) ?? []
}

// --- CLOCK IN / OUT (self) -------------------------------------------------
export async function getOpenTimesheet(profileId: string): Promise<TimesheetRow | null> {
  const { data } = await supabase
    .from('timesheets')
    .select('*')
    .eq('profile_id', profileId)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as TimesheetRow) ?? null
}

export async function clockIn(profileId: string, note?: string): Promise<TimesheetRow | null> {
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const { data } = await supabase
    .from('timesheets')
    .insert({ profile_id: profileId, date, clock_in: now.toISOString(), job_note: note || null })
    .select()
    .single()
  return (data as TimesheetRow) ?? null
}

export async function clockOut(ts: TimesheetRow, note?: string): Promise<void> {
  const out = new Date().toISOString()
  const hours = hoursBetween(ts.clock_in, out)
  await supabase
    .from('timesheets')
    .update({ clock_out: out, hours, job_note: note ?? ts.job_note })
    .eq('id', ts.id)
}
