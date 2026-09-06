import { supabase } from '@/lib/supabase'
import {
  repBonus, weekRangeISO, addWeeks, hoursBetween,
  payRatesOf, jobPayFor, hourlyRateFor, PAY_MODE_BY_ID, UPSELL_COUNTS_IN_JOB_BASE, autoPayMode,
  upsellSellers, upsellShare,
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
  job_id?: string | null
  // job pointée (embed PostgREST) — sert à savoir si ces heures sont payées
  // à l'heure ou déjà couvertes par un % de commission
  jobs?: { type: string | null; service: string | null; price: number | null; pay_mode: string | null; assigned_ids: string[] | null } | null
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

// Ce qu'une ligne de pointage vaut en dollars. Les heures faites sur une job
// payée au POURCENTAGE (vitres résidentielles) ne sont PAS payées à l'heure :
// elles sont déjà couvertes par la commission de la job — on les garde
// seulement pour le suivi du temps.
export function timesheetIsHourly(r: TimesheetRow): boolean {
  const j = r.jobs
  if (!j) return true
  const mode = (j.pay_mode as PayMode | null) || autoPayMode(j.type, j.service, j.assigned_ids?.length ?? 0)
  return PAY_MODE_BY_ID[mode]?.kind !== 'percent'
}

export function timesheetPay(r: TimesheetRow, rates: PayRates): number {
  if (!timesheetIsHourly(r)) return 0
  return (Number(r.hours) || 0) * hourlyRateFor(r.work_type, rates)
}

// --- UPSELLS (ventes additionnelles faites sur une job) ---------------------
export interface WeekUpsell {
  id: string
  job_id: string
  service: string
  price: number
  sold_by: string | null
  // vendeurs multiples (migration_crm_upsell_vendeurs) — vente splittée
  sold_by_ids?: string[] | null
  jobs?: { start_at: string | null; status: string | null } | null
}

// Upsells rattachés à une job de la période (hors jobs annulées).
// Table absente (migration_crm_vitres_upsell pas appliquée) → [].
// `*` plutôt qu'une liste de colonnes : sold_by_ids n'existe qu'une fois
// migration_crm_upsell_vendeurs appliquée.
export async function getUpsellsWeek(weekOf: string, weeks = 1): Promise<WeekUpsell[]> {
  const { startISO } = weekRangeISO(weekOf)
  const { endISO } = weekRangeISO(addWeeks(weekOf, weeks - 1))
  const { data } = await supabase
    .from('job_upsells')
    .select('*, jobs!inner(start_at, status)')
    .gte('jobs.start_at', startISO)
    .lt('jobs.start_at', endISO)
    .neq('jobs.status', 'canceled')
  return (data as unknown as WeekUpsell[]) ?? []
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

  const [{ data: profiles }, { data: wonLeads }, { data: jobs }, { data: existing }, upsells] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('leads').select('rep_id, price').eq('stage', 'won').gte('updated_at', startISO).lt('updated_at', endISO),
    // fenêtres ET projets : les fenêtres paient un % aux techniciens, les deux
    // peuvent porter un vendeur (jobs.sold_by) à commissionner.
    supabase.from('jobs').select('*').in('type', ['fenetre', 'projet']).eq('status', 'done').gte('start_at', startISO).lt('start_at', endISO),
    supabase.from('commissions').select('profile_id, type, paid').eq('week_of', weekOf),
    getUpsellsWeek(weekOf),
  ])

  // Upsells : montant par job (base du % des techniciens) et par vendeur
  // (commission de vente, exactement comme un lead gagné).
  const upsellByJob = new Map<string, number>()
  for (const u of upsells) {
    upsellByJob.set(u.job_id, (upsellByJob.get(u.job_id) ?? 0) + (Number(u.price) || 0))
  }

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

  // un upsell vendu sur le chantier compte comme une vente du/des vendeur(s)
  // désigné(s) — à plusieurs, le montant est splitté également entre eux
  for (const u of upsells) {
    const sellers = upsellSellers(u)
    if (!sellers.length) continue
    const share = upsellShare(u.price, sellers)
    for (const s of sellers) {
      const a = repAgg.get(s) ?? { base: 0, deals: 0 }
      a.base += share
      a.deals += 1
      repAgg.set(s, a)
    }
  }

  // vendeur (« closer ») désigné sur une job complétée (vitres ou projet) :
  // le prix de la job entre dans SES ventes de la semaine.
  // Job issue d'un lead (lead_id) → ignorée : la commission a déjà été versée
  // sur le lead gagné, on ne paie pas deux fois la même vente.
  for (const j of jobs ?? []) {
    const seller = (j as { sold_by?: string | null }).sold_by
    if (!seller || j.lead_id) continue
    const a = repAgg.get(seller) ?? { base: 0, deals: 0 }
    a.base += Number(j.price) || 0
    a.deals += 1
    repAgg.set(seller, a)
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
      const extra = UPSELL_COUNTS_IN_JOB_BASE ? (upsellByJob.get(j.id) ?? 0) : 0
      const jobBase = { ...j, price: (Number(j.price) || 0) + extra }
      const { mode, amount } = jobPayFor(jobBase, rates)
      if (PAY_MODE_BY_ID[mode]?.kind !== 'percent') continue // horaire → feuilles de temps
      const a = techAgg.get(id) ?? { base: 0, jobs: 0, pay: 0, modes: new Set<PayMode>() }
      a.base += jobBase.price
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
  pay_hours?: number | null // temps de la job (migration_crm_job_heures)
  sold_by?: string | null // vendeur crédité (migration_crm_job_vendeur)
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

// --- MES JOBS DE LA SEMAINE (vue employé, sans attendre le calcul admin) ---
// « Les jobs assignées aux gars vont direct dans leur catégorie de paye » :
// dès qu'une job est assignée (ou vendue) par un employé, elle apparaît chez
// lui, classée dans la bonne catégorie — commission de vitres, commission de
// vente, ou heures (payées au pointage). Le calcul admin (computeCommissions)
// reste la source officielle : ici on montre la MÊME règle, en direct.
export interface MyJobEarning {
  key: string
  job_id: string
  title: string | null
  service: string | null
  type: string | null
  start_at: string | null
  done: boolean
  /** à quel titre l'employé est payé sur cette ligne */
  as: 'technicien' | 'vendeur'
  category: 'commission' | 'heures'
  mode: PayMode
  /** % du prix (modes commission) ou $/h (modes horaires) */
  rate: number
  base: number
  /** montant versé : % du prix, ou heures de la job × taux horaire.
   *  0 sur une ligne horaire dont le temps n'a pas été saisi (→ pointage). */
  amount: number
  /** heures payées quand la job est en mode horaire (jobs.pay_hours) */
  hours: number
}

export interface MyJobEarnings {
  lines: MyJobEarning[]
  /** commissions des jobs déjà « done » (ce qui est acquis) */
  doneTotal: number
  /** commissions des jobs de la semaine pas encore « done » */
  upcomingTotal: number
  /** nb de jobs payées à l'heure */
  hourlyJobs: number
  /** total des jobs horaires dont le temps a été saisi (hors commissions) */
  hourlyTotal: number
}

export async function getMyJobEarnings(
  profileId: string, weekOf: string, rates: PayRates, weeks = 1,
): Promise<MyJobEarnings> {
  const { startISO } = weekRangeISO(weekOf)
  const { endISO } = weekRangeISO(addWeeks(weekOf, weeks - 1))
  const inWeek = () => supabase
    .from('jobs').select('*')
    .gte('start_at', startISO).lt('start_at', endISO).neq('status', 'canceled')

  const [assignedRes, soldRes, upsells] = await Promise.all([
    inWeek().contains('assigned_ids', [profileId]),
    // jobs.sold_by : colonne récente — absente = requête en erreur, on l'ignore
    inWeek().eq('sold_by', profileId),
    getUpsellsWeek(weekOf, weeks),
  ])

  type Row = {
    id: string; title: string | null; service: string | null; type: string | null
    start_at: string | null; status: string | null; price: number | null
    pay_mode?: string | null; assigned_ids?: string[] | null
    sold_by?: string | null; lead_id?: string | null
  }
  const assigned = (assignedRes.data as Row[]) ?? []
  const sold = (soldRes.data as Row[]) ?? []

  const upsellByJob = new Map<string, number>()
  for (const u of upsells) {
    upsellByJob.set(u.job_id, (upsellByJob.get(u.job_id) ?? 0) + (Number(u.price) || 0))
  }

  const lines: MyJobEarning[] = []

  // 1. comme technicien assigné
  for (const j of assigned) {
    const extra = UPSELL_COUNTS_IN_JOB_BASE ? (upsellByJob.get(j.id) ?? 0) : 0
    const base = (Number(j.price) || 0) + extra
    const { mode, amount, rate, hours } = jobPayFor({ ...j, price: base }, rates)
    const hourly = PAY_MODE_BY_ID[mode]?.kind !== 'percent'
    lines.push({
      key: `job:${j.id}`, job_id: j.id, title: j.title, service: j.service, type: j.type,
      start_at: j.start_at, done: j.status === 'done', as: 'technicien',
      category: hourly ? 'heures' : 'commission',
      // horaire : le montant vient du temps de la job (0 si pas saisi → pointage)
      mode, rate, base: hourly ? 0 : base, amount, hours,
    })
  }

  // 2. comme vendeur (« closer ») de la job — même règle que computeCommissions :
  //    une job issue d'un lead gagné est déjà payée sur le lead, on l'ignore
  for (const j of sold) {
    if (j.lead_id) continue
    const base = Number(j.price) || 0
    lines.push({
      key: `sold:${j.id}`, job_id: j.id, title: j.title, service: j.service, type: j.type,
      start_at: j.start_at, done: j.status === 'done', as: 'vendeur',
      category: 'commission', mode: 'solo', rate: rates.pct_vente, base,
      amount: Math.round(base * rates.pct_vente) / 100, hours: 0,
    })
  }

  // 3. upsells vendus par lui (splittés s'ils ont plusieurs vendeurs)
  const jobById = new Map<string, Row>([...assigned, ...sold].map((j) => [j.id, j]))
  for (const u of upsells) {
    const sellers = upsellSellers(u)
    if (!sellers.includes(profileId)) continue
    const share = upsellShare(u.price, sellers)
    const j = jobById.get(u.job_id)
    lines.push({
      key: `upsell:${u.id}`, job_id: u.job_id, title: u.service, service: u.service,
      type: j?.type ?? null, start_at: j?.start_at ?? u.jobs?.start_at ?? null,
      done: (j?.status ?? u.jobs?.status) === 'done', as: 'vendeur',
      category: 'commission', mode: 'solo', rate: rates.pct_vente, base: share,
      amount: Math.round(share * rates.pct_vente) / 100, hours: 0,
    })
  }

  lines.sort((a, b) => (a.start_at ?? '').localeCompare(b.start_at ?? ''))
  const sum = (f: (l: MyJobEarning) => boolean) =>
    Math.round(lines.filter(f).reduce((s, l) => s + l.amount, 0) * 100) / 100

  return {
    lines,
    doneTotal: sum((l) => l.done && l.category === 'commission'),
    upcomingTotal: sum((l) => !l.done && l.category === 'commission'),
    hourlyJobs: lines.filter((l) => l.category === 'heures').length,
    hourlyTotal: sum((l) => l.category === 'heures'),
  }
}

// --- TIMESHEETS / HEURES (admin) -------------------------------------------
// Embed de la job pointée : n'existe qu'une fois timesheets.job_id créé
// (migration_crm_vitres_upsell). On retente sans, sinon la page casserait.
const TS_JOB_EMBED = 'jobs(type, service, price, pay_mode, assigned_ids)'

export async function getTimesheetsWeek(weekOf: string): Promise<EmployeeHours[]> {
  const end = addWeeks(weekOf, 1)
  const run = (sel: string) => supabase
    .from('timesheets').select(sel)
    .gte('date', weekOf).lt('date', end)
    .order('date', { ascending: true })
  let res = await run(`*, profiles(*), ${TS_JOB_EMBED}`)
  if (res.error) res = await run('*, profiles(*)')

  const rows = (res.data as unknown as TimesheetRow[]) ?? []
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
    e.totalHours += Number(r.hours) || 0
    // chaque ligne est payée à SON taux (paysagement 20-24 $/h vs commercial
    // 22 $/h) — sauf les heures faites sur une job payée au % (déjà en commission)
    e.pay += timesheetPay(r, e.rates)
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
  const run = (sel: string) => supabase
    .from('timesheets').select(sel)
    .eq('profile_id', profileId).gte('date', weekOf).lt('date', end)
    .order('date', { ascending: true })
  let res = await run(`*, ${TS_JOB_EMBED}`)
  if (res.error) res = await run('*')
  return (res.data as unknown as TimesheetRow[]) ?? []
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

export async function clockIn(
  profileId: string, note?: string, workType?: string, jobId?: string | null,
): Promise<TimesheetRow | null> {
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const row: Record<string, unknown> = {
    profile_id: profileId, date, clock_in: now.toISOString(), job_note: note || null,
  }
  // colonnes récentes : work_type (migration_crm_salaires), job_id
  // (migration_crm_vitres_upsell). Si l'une manque, on retente sans elles
  // plutôt que de perdre le poinçon.
  if (workType) row.work_type = workType
  if (jobId) row.job_id = jobId
  let { data } = await supabase.from('timesheets').insert(row).select().single()
  if (!data && (workType || jobId)) {
    delete row.work_type
    delete row.job_id
    ;({ data } = await supabase.from('timesheets').insert(row).select().single())
  }
  return (data as TimesheetRow) ?? null
}

export async function clockOut(ts: TimesheetRow, note?: string, jobId?: string | null): Promise<void> {
  const out = new Date().toISOString()
  const hours = hoursBetween(ts.clock_in, out)
  const patch: Record<string, unknown> = { clock_out: out, hours, job_note: note ?? ts.job_note }
  // la job peut avoir été précisée/changée pendant le quart
  if (jobId !== undefined && jobId !== ts.job_id) patch.job_id = jobId
  const { error } = await supabase.from('timesheets').update(patch).eq('id', ts.id)
  if (error && patch.job_id !== undefined) {
    // colonne job_id absente → on sauve au moins les heures
    delete patch.job_id
    await supabase.from('timesheets').update(patch).eq('id', ts.id)
  }
}
