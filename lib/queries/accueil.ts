import { supabase } from '@/lib/supabase'

// ============================================================
// Requêtes de l'Accueil (Phase 2)
// Revenus par service · demandes pipeline · jobs du jour · soumissions en attente
// ============================================================

export type ServiceRevenue = {
  fenetre: number
  paysagement: number
  projet: number
  total: number
}

export type PipelineStat = { stage: string; count: number }

export type JobToday = {
  id: string
  title: string | null
  service: string | null
  type: string
  team: string | null
  start_at: string | null
  end_at: string | null
  status: string | null
  assigned_ids: string[]
  client_name: string | null
}

export type PendingQuote = {
  id: string
  service_type: string | null
  service_category: string | null
  price: number | null
  created_at: string
  client_name: string | null
}

export type AccueilData = {
  revenue: ServiceRevenue
  pipeline: PipelineStat[]
  leadsTotal: number
  leadsToday: number
  jobsToday: JobToday[]
  pendingQuotes: PendingQuote[]
}

// --- bornes de dates (heure locale) ---------------------------------------
function startOfTodayISO(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString()
}
function endOfTodayISO(): string {
  const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString()
}
function startOfMonthISO(): string {
  const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1).toISOString()
}

// Catégorisation fenetre | paysagement | projet.
// Tolère le texte libre (service_type des portes D2D) en plus des valeurs
// normalisées de quotes.service_category. Doit rester alignée sur la fonction
// SQL mw_service_category() (migration_crm_d2d_link.sql).
function categoryOf(raw: string | null | undefined): keyof ServiceRevenue | null {
  const s = (raw || '')
    .toLowerCase()
    .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a')
    .replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o').replace(/[ûüù]/g, 'u')
  if (!s) return null
  if (/fenetre|vitre/.test(s)) return 'fenetre'
  if (/gazon|pelouse|paysag|tonte|haie/.test(s)) return 'paysagement'
  if (/projet|pave|amenag|muret/.test(s)) return 'projet'
  return null
}

export async function getAccueilData(): Promise<AccueilData> {
  const monthStart = startOfMonthISO()
  const todayStart = startOfTodayISO()
  const todayEnd = endOfTodayISO()

  const [revenueRes, d2dRes, leadsRes, leadsTodayRes, jobsRes, quotesRes] = await Promise.all([
    // 1a. Revenus par service — devis concrétisés ce mois-ci
    supabase
      .from('quotes')
      .select('price, service_category, status')
      .in('status', ['signed', 'invoiced', 'paid'])
      .gte('created_at', monthStart),

    // 1b. Revenus D2D — portes vendues ce mois-ci (service_type en texte libre)
    supabase
      .from('doors')
      .select('contract_value, service_type')
      .eq('status', 'vendu')
      .not('contract_value', 'is', null)
      .gte('created_at', monthStart),

    // 2a. Pipeline — tous les leads (on agrège les stages côté client)
    supabase.from('leads').select('stage'),

    // 2b. Leads entrants aujourd'hui
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd),

    // 3. Jobs du jour
    supabase
      .from('jobs')
      .select('id, title, service, type, team, start_at, end_at, status, assigned_ids, clients(name)')
      .gte('start_at', todayStart)
      .lte('start_at', todayEnd)
      .order('start_at', { ascending: true }),

    // 4. Soumissions envoyées en attente (non signées)
    supabase
      .from('quotes')
      .select('id, service_type, service_category, price, created_at, client_name, clients(name)')
      .eq('status', 'sent')
      .order('created_at', { ascending: true }),
  ])

  // --- revenus (devis concrétisés + ventes D2D) ---
  const revenue: ServiceRevenue = { fenetre: 0, paysagement: 0, projet: 0, total: 0 }
  for (const r of revenueRes.data ?? []) {
    const cat = categoryOf((r as { service_category: string | null }).service_category)
    const val = Number((r as { price: number | null }).price) || 0
    if (cat) revenue[cat] += val
    revenue.total += val
  }
  for (const d of d2dRes.data ?? []) {
    const cat = categoryOf((d as { service_type: string | null }).service_type)
    const val = Number((d as { contract_value: number | null }).contract_value) || 0
    if (cat) revenue[cat] += val
    revenue.total += val
  }

  // --- pipeline par stage ---
  const stageMap: Record<string, number> = {}
  for (const l of leadsRes.data ?? []) {
    const stage = (l as { stage: string | null }).stage || 'new'
    stageMap[stage] = (stageMap[stage] || 0) + 1
  }
  const pipeline: PipelineStat[] = Object.entries(stageMap).map(([stage, count]) => ({ stage, count }))
  const leadsTotal = (leadsRes.data ?? []).length

  // --- jobs du jour ---
  const jobsToday: JobToday[] = (jobsRes.data ?? []).map((j) => {
    const job = j as Record<string, unknown>
    const clients = job.clients as { name: string } | { name: string }[] | null
    const client_name = Array.isArray(clients) ? (clients[0]?.name ?? null) : (clients?.name ?? null)
    return {
      id: job.id as string,
      title: (job.title as string) ?? null,
      service: (job.service as string) ?? null,
      type: (job.type as string) ?? 'fenetre',
      team: (job.team as string) ?? null,
      start_at: (job.start_at as string) ?? null,
      end_at: (job.end_at as string) ?? null,
      status: (job.status as string) ?? null,
      assigned_ids: (job.assigned_ids as string[]) ?? [],
      client_name,
    }
  })

  // --- soumissions en attente ---
  const pendingQuotes: PendingQuote[] = (quotesRes.data ?? []).map((q) => {
    const quote = q as Record<string, unknown>
    const clients = quote.clients as { name: string } | { name: string }[] | null
    const joined = Array.isArray(clients) ? (clients[0]?.name ?? null) : (clients?.name ?? null)
    return {
      id: quote.id as string,
      service_type: (quote.service_type as string) ?? null,
      service_category: (quote.service_category as string) ?? null,
      price: (quote.price as number) ?? null,
      created_at: quote.created_at as string,
      client_name: joined ?? ((quote.client_name as string) ?? null),
    }
  })

  return {
    revenue,
    pipeline,
    leadsTotal,
    leadsToday: leadsTodayRes.count ?? 0,
    jobsToday,
    pendingQuotes,
  }
}
