import { supabase } from '@/lib/supabase'
import {
  repBonus, weekRangeISO, addWeeks, hoursBetween,
  payRatesOf, jobPayFor, hourlyRateFor, PAY_MODE_BY_ID,
  type PayRates, type PayMode,
} from '@/lib/payes'

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
  work_type?: string | null
  paid: boolean
  profiles?: { full_name: string | null; hourly_rate: number | null } | null
}

export interface EmployeeHours {
  profile_id: string
  name: string
  hourly_rate: number          // taux paysagement (affichage)
  rates: PayRates
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

// Calcule (et upsert) les commissions de la semaine à partir de la grille
// salariale de chaque profil (colonnes rate_*/pct_*, cf. lib/payes.ts).
//   type 'rep'      → % sur ses propres ventes (leads « won ») + bonus paliers
//   type 'vitres'   → % par technicien sur les jobs de vitres « done »
//   type 'override' → % du directeur des ventes sur les ventes de TOUS les reps
// Les heures (paysagement / commercial) sont payées via les feuilles de temps.
// Ne touche pas aux lignes déjà payées.
export async function computeCommissions(weekOf: string): Promise<{ reps: number; techs: number; overrides: number }> {
  const { startISO, endISO } = weekRangeISO(weekOf)

  const [{ data: profiles }, { data: wonLeads }, { data: jobs }, { data: existing }] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('leads').select('rep_id, price').eq('stage', 'won').gte('updated_at', startISO).lt('updated_at', endISO),
    supabase.from('jobs').select('*').eq('type', 'fenetre').eq('status', 'done').gte('start_at', startISO).lt('start_at', endISO),
    supabase.from('commissions').select('profile_id, type, paid').eq('week_of', weekOf),
  ])

  const paidSet = new Set((existing ?? []).filter((e) => e.paid).map((e) => `${e.profile_id}:${e.type}`))
  const profById = new Map((profiles ?? []).map((p) => [p.id as string, p]))
  const ratesById = new Map<string, PayRates>((profiles ?? []).map((p) => [p.id as string, payRatesOf(p)]))

  // --- ventes personnelles (tous rôles : un gars de paysagement peut vendre) ---
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
    if (!p) continue
    const rates = ratesById.get(profileId)!
    // % de la grille ; repli sur l'ancien commission_type/value (montant fixe).
    const isFixed = rates.pct_vente === 0 && p.commission_type === 'fixed'
    const value = isFixed ? Number(p.commission_value) || 0 : rates.pct_vente
    if (value <= 0) continue
    const commission = isFixed ? value * agg.deals : Math.round(agg.base * value / 100)
    repUpserts.push({
      profile_id: profileId, type: 'rep', week_of: weekOf,
      sales_amount: agg.base, rate: value, commission_amount: commission,
      deals_closed: agg.deals, jobs_count: agg.deals, bonus: repBonus(agg.base),
    })
  }

  // --- jobs de vitres « done » : % PAR technicien sur le prix complet ---
  const techAgg = new Map<string, { base: number; jobs: number; pay: number; modes: Set<PayMode> }>()
  for (const j of jobs ?? []) {
    const ids: string[] = j.assigned_ids ?? []
    if (!ids.length) continue
    for (const id of ids) {
      const rates = ratesById.get(id)
      if (!rates) continue
      const { mode, amount } = jobPayFor(j, rates)
      if (PAY_MODE_BY_ID[mode]?.kind !== 'percent') continue // horaire → feuilles de temps
      const a = techAgg.get(id) ?? { base: 0, jobs: 0, pay: 0, modes: new Set<PayMode>() }
      a.base += Number(j.price) || 0
      a.jobs += 1
      a.pay += amount
      a.modes.add(mode)
      techAgg.set(id, a)
    }
  }
  const techUpserts: Record<string, unknown>[] = []
  for (const [profileId, agg] of techAgg) {
    if (paidSet.has(`${profileId}:vitres`)) continue
    if (agg.pay <= 0) continue
    // Taux affiché : le taux effectif moyen sur la période.
    const effective = agg.base > 0 ? Math.round((agg.pay / agg.base) * 1000) / 10 : 0
    techUpserts.push({
      profile_id: profileId, type: 'vitres', week_of: weekOf,
      sales_amount: Math.round(agg.base), rate: effective,
      commission_amount: Math.round(agg.pay), jobs_count: agg.jobs, deals_closed: agg.jobs, bonus: 0,
    })
  }

  // --- override directeur des ventes : % sur les ventes de CHAQUE vendeur ---
  const overrideUpserts: Record<string, unknown>[] = []
  for (const [profileId, rates] of ratesById) {
    if (rates.pct_override <= 0) continue
    if (paidSet.has(`${profileId}:override`)) continue
    // Ventes de tous les AUTRES vendeurs (pas les siennes : déjà payées en 'rep').
    let base = 0
    let deals = 0
    for (const [repId, agg] of repAgg) {
      if (repId === profileId) continue
      base += agg.base
      deals += agg.deals
    }
    if (base <= 0) continue
    overrideUpserts.push({
      profile_id: profileId, type: 'override', week_of: weekOf,
      sales_amount: base, rate: rates.pct_override,
      commission_amount: Math.round(base * rates.pct_override / 100),
      deals_closed: deals, jobs_count: deals, bonus: 0,
    })
  }

  const all = [...repUpserts, ...techUpserts, ...overrideUpserts]
  if (all.length) {
    await supabase.from('commissions').upsert(all, { onConflict: 'profile_id,week_of,type' })
  }
  return { reps: repUpserts.length, techs: techUpserts.length, overrides: overrideUpserts.length }
}

// --- JOBS FAITS (datasheet « ce que je dois payer ») ------------------------
export interface DoneJobRow {
  id: string
  title: string | null
  service: string | null
  type: string
  start_at: string | null
  price: number | null
  assigned_ids: string[]
  pay_mode?: string | null
}

// Jobs complétés (« done ») sur `weeks` semaine(s) à partir de weekOf — tous
// types confondus ; le détail par employé se filtre via assigned_ids.
export async function getDoneJobs(weekOf: string, weeks = 1): Promise<DoneJobRow[]> {
  const { startISO } = weekRangeISO(weekOf)
  const { endISO } = weekRangeISO(addWeeks(weekOf, weeks - 1))
  const { data } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'done')
    .gte('start_at', startISO)
    .lt('start_at', endISO)
    .order('start_at', { ascending: true })
  return (data as DoneJobRow[]) ?? []
}

// --- TIMESHEETS / HEURES (admin) -------------------------------------------
export async function getTimesheetsWeek(weekOf: string): Promise<EmployeeHours[]> {
  const end = addWeeks(weekOf, 1)
  const { data } = await supabase
    .from('timesheets')
    .select('*, profiles(*)')
    .gte('date', weekOf)
    .lt('date', end)
    .order('date', { ascending: true })

  const rows = (data as TimesheetRow[]) ?? []
  const byEmp = new Map<string, EmployeeHours>()
  for (const r of rows) {
    let e = byEmp.get(r.profile_id)
    if (!e) {
      const rates = payRatesOf(r.profiles as Record<string, unknown> | null)
      e = {
        profile_id: r.profile_id,
        name: r.profiles?.full_name ?? '—',
        hourly_rate: rates.rate_paysagement,
        rates,
        rows: [], totalHours: 0, pay: 0, paid: false,
      }
      byEmp.set(r.profile_id, e)
    }
    e.rows.push(r)
    const h = Number(r.hours) || 0
    e.totalHours += h
    // chaque ligne est payée à SON taux (paysagement 20-24 $/h vs commercial 22 $/h)
    e.pay += h * hourlyRateFor(r.work_type, e.rates)
    if (r.paid) e.paid = true
  }
  for (const e of byEmp.values()) {
    e.totalHours = Math.round(e.totalHours * 100) / 100
    e.pay = Math.round(e.pay * 100) / 100
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

export async function clockIn(profileId: string, note?: string, workType?: string): Promise<TimesheetRow | null> {
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const row: Record<string, unknown> = {
    profile_id: profileId, date, clock_in: now.toISOString(), job_note: note || null,
  }
  if (workType) row.work_type = workType
  let { data } = await supabase.from('timesheets').insert(row).select().single()
  if (!data && workType) {
    // colonne work_type absente (migration pas encore appliquée) → repli
    delete row.work_type
    ;({ data } = await supabase.from('timesheets').insert(row).select().single())
  }
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
