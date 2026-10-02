import { supabase } from '@/lib/supabase'
import { addWeeks } from '@/lib/payes'
import { findRoute } from '@/lib/gazon-routes'

// ============================================================
// Requêtes Calendrier (Phase 4) — table jobs (rendez-vous / créneaux).
// type : fenetre | gazon | projet | fermeture · team : equipe1 | equipe2
// ============================================================

export interface Job {
  id: string
  client_id: string | null
  lead_id: string | null
  title: string | null
  service: string | null
  type: string
  team: string | null
  assigned_ids: string[]
  route_name: string | null
  address: string | null
  client_phone?: string | null
  client_email?: string | null
  start_at: string | null
  end_at: string | null
  all_day: boolean
  status: string // cf. lib/job-status.ts (confirmed | pending | dispo | done | canceled ; 'scheduled' = legacy)
  price: number | null
  pay_mode?: string | null // null = déduit (cf. autoPayMode dans lib/payes)
  /** temps de la job en heures — modes horaires (copro/commercial, paysagement).
   *  Colonne récente : migration_crm_job_heures.sql */
  pay_hours?: number | null
  sold_by?: string | null  // vendeur (« closer ») — commission de vente
  /** soumission signée rattachée (projets) — migration_crm_job_heures.sql */
  quote_id?: string | null
  notes: string | null
  clients?: { name: string } | { name: string }[] | null
}

export interface AssignProfile {
  id: string
  full_name: string | null
  color: string | null
  role: string | null
}

// '*' (et pas une liste de colonnes) pour tolérer les colonnes récentes
// (client_phone/client_email) tant que migration_crm_gazon_paye.sql n'est pas appliquée.
const JOB_COLS = '*, clients(name)'

// Jobs d'une semaine pour un ou plusieurs types. weekStart = lundi (YYYY-MM-DD).
export async function getJobsWeek(types: string[], weekStart: string): Promise<Job[]> {
  const startISO = new Date(weekStart + 'T00:00:00').toISOString()
  const endISO = new Date(addWeeks(weekStart, 1) + 'T00:00:00').toISOString()
  const { data } = await supabase
    .from('jobs')
    .select(JOB_COLS)
    .in('type', types)
    .gte('start_at', startISO)
    .lt('start_at', endISO)
    .order('start_at', { ascending: true })
  return (data as Job[]) ?? []
}

// Jobs d'UNE journée assignées à un employé (pointage : il choisit sa job
// dans son horaire au lieu de la taper). dayISO = YYYY-MM-DD.
export async function getMyJobsForDay(profileId: string, dayISO: string): Promise<Job[]> {
  const startISO = new Date(dayISO + 'T00:00:00').toISOString()
  const end = new Date(dayISO + 'T00:00:00')
  end.setDate(end.getDate() + 1)
  const { data } = await supabase
    .from('jobs')
    .select(JOB_COLS)
    .contains('assigned_ids', [profileId])
    .gte('start_at', startISO)
    .lt('start_at', end.toISOString())
    .neq('status', 'canceled')
    .order('start_at', { ascending: true })
  return (data as Job[]) ?? []
}

/** Libellé court d'une job pour le pointage : « 🌿 Route Longueuil » / « Famille Tremblay — Lavage ext. » */
export function jobLabel(job: Job): string {
  const route = job.type === 'gazon' ? findRoute(job.route_name) : null
  if (route) return `🌿 ${route.label}`
  if (job.type === 'fermeture' && job.route_name) return `🍂 Fermeture ${job.route_name}`
  const base = clientName(job) || job.title || job.service || 'Job'
  return job.service && base !== job.service ? `${base} — ${job.service}` : base
}

export function clientName(job: Job): string | null {
  const c = job.clients
  if (!c) return null
  return Array.isArray(c) ? (c[0]?.name ?? null) : c.name
}

export interface JobInput {
  title?: string | null
  service?: string | null
  type: string
  team?: string | null
  assigned_ids?: string[]
  route_name?: string | null
  address?: string | null
  client_phone?: string | null
  client_email?: string | null
  start_at?: string | null
  end_at?: string | null
  status?: string
  price?: number | null
  pay_mode?: string | null
  pay_hours?: number | null
  sold_by?: string | null
  quote_id?: string | null
  notes?: string | null
  client_id?: string | null
  lead_id?: string | null
}

// Colonne réclamée par PostgREST quand elle n'existe pas encore en base :
// « Could not find the 'pay_hours' column of 'jobs' in the schema cache ».
export function missingColumn(message: string): string | null {
  return /Could not find the '([a-z_]+)' column/.exec(message)?.[1] ?? null
}

// La colonne existe-t-elle déjà ? Sert à AVERTIR dans un modal quand une
// saisie serait jetée (migration pas appliquée). Une erreur réseau ou autre
// ≠ colonne absente → true (pas de fausse alerte). Mémorisé pour la session :
// une migration appliquée entre-temps est vue au prochain chargement de page.
const columnProbe = new Map<string, Promise<boolean>>()
export function tableHasColumn(table: string, col: string): Promise<boolean> {
  const key = `${table}.${col}`
  let probe = columnProbe.get(key)
  if (!probe) {
    probe = Promise.resolve(supabase.from(table).select(col).limit(1))
      .then(({ error }) => !(error && /does not exist|Could not find/i.test(error.message)))
      .catch(() => true)
    columnProbe.set(key, probe)
  }
  return probe
}
export const jobsHasColumn = (col: string): Promise<boolean> => tableHasColumn('jobs', col)

// Enregistre en retirant les colonnes que la base ne connaît pas encore
// (migration pas appliquée) : on préfère sauver la job sans ce champ plutôt
// que de perdre toute la saisie. Max 4 passes = 4 colonnes récentes.
async function saveJob(
  input: Partial<JobInput>,
  run: (payload: Partial<JobInput>) => Promise<{ error: { message: string } | null }>,
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = { ...input }
  for (let i = 0; i < 4; i++) {
    const { error } = await run(payload as Partial<JobInput>)
    if (!error) return { error: null }
    const col = missingColumn(error.message)
    if (!col || !(col in payload)) return { error: error.message }
    delete payload[col]
  }
  return { error: 'Enregistrement impossible : colonnes manquantes en base.' }
}

export async function createJob(input: JobInput): Promise<{ error: string | null }> {
  return saveJob(input, async (p) => await supabase.from('jobs').insert(p))
}

export async function updateJob(id: string, input: Partial<JobInput>): Promise<{ error: string | null }> {
  return saveJob(input, async (p) => await supabase.from('jobs').update(p).eq('id', id))
}

export async function deleteJob(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('jobs').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// Lien Google Maps « itinéraire » vers l'adresse du job (ouvre l'app GPS du tél).
// Aligné sur directionsUrl() de lib/queries/clients.ts.
export function jobDirectionsUrl(job: Pick<Job, 'address'>): string | null {
  const dest = (job.address ?? '').trim()
  if (!dest) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`
}

// ============================================================
// Photos de job (projets pavé/taillage…) — table job_photos
// (migration_crm_gazon_paye.sql). error non-null = migration absente.
// Les dépenses (job_expenses) = factures : lib/queries/factures.ts.
// ============================================================

export interface JobPhoto {
  id: string
  job_id: string
  path: string
  caption: string | null
  author_id: string | null
  created_at: string
  profiles?: { full_name: string | null } | null
}

export async function getJobPhotos(jobId: string): Promise<{ photos: JobPhoto[]; error: string | null }> {
  const { data, error } = await supabase
    .from('job_photos')
    .select('*, profiles(full_name)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
  return { photos: (data as JobPhoto[]) ?? [], error: error?.message ?? null }
}

export async function addJobPhoto(jobId: string, path: string, authorId: string | null): Promise<{ error: string | null }> {
  const { error } = await supabase.from('job_photos').insert({ job_id: jobId, path, author_id: authorId })
  return { error: error?.message ?? null }
}

export async function deleteJobPhoto(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('job_photos').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// ============================================================
// Notes du jour d'une job — table job_notes (migration_crm_job_notes.sql).
// Les techniciens notent ce qu'ils voient sur place, comme les notes de
// terrain de la Run gazon (gazon_notes). error non-null = migration absente.
// ============================================================

export interface JobNote {
  id: string
  job_id: string
  note: string
  author_id: string | null
  created_at: string
  profiles?: { full_name: string | null } | null
}

export async function getJobNotes(jobId: string): Promise<{ notes: JobNote[]; error: string | null }> {
  const { data, error } = await supabase
    .from('job_notes')
    .select('*, profiles(full_name)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
  return { notes: (data as JobNote[]) ?? [], error: error?.message ?? null }
}

export async function addJobNote(jobId: string, note: string, authorId: string | null): Promise<{ error: string | null }> {
  const { error } = await supabase.from('job_notes').insert({ job_id: jobId, note, author_id: authorId })
  return { error: error?.message ?? null }
}

export async function deleteJobNote(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('job_notes').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// Nb de notes par job (pastille 💬 du calendrier). Table absente → {}.
export async function getJobNoteCounts(jobIds: string[]): Promise<Record<string, number>> {
  if (jobIds.length === 0) return {}
  const { data } = await supabase.from('job_notes').select('job_id').in('job_id', jobIds)
  const counts: Record<string, number> = {}
  for (const r of (data as { job_id: string }[] | null) ?? []) counts[r.job_id] = (counts[r.job_id] ?? 0) + 1
  return counts
}

// Toute l'équipe (menu « payé par » d'une dépense de job).
export async function getTeamProfiles(): Promise<AssignProfile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, color, role')
    .order('full_name')
  return (data as AssignProfile[]) ?? []
}

// Employés assignables à un job, selon les rôles voulus (techs / terrain).
export async function getAssignableProfiles(roles: string[]): Promise<AssignProfile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, color, role')
    .in('role', roles)
    .order('full_name')
  return (data as AssignProfile[]) ?? []
}

// ============================================================
// Upsells de job — service vendu PENDANT la job (migration_crm_vitres_upsell).
// Le vendeur crédité (sold_by) touche sa commission de vente ; le montant
// s'ajoute au prix de la job pour le % des techniciens (cf. lib/payes.ts,
// UPSELL_COUNTS_IN_JOB_BASE). error non-null = migration absente.
// Les noms d'employés sont résolus côté client (getTeamProfiles) : deux FK
// vers profiles (sold_by / created_by) rendraient l'embed PostgREST ambigu.
// ============================================================

export interface JobUpsell {
  id: string
  job_id: string
  service: string
  price: number
  sold_by: string | null
  /** vendeurs crédités quand la vente est à plusieurs (split égal).
   *  Colonne récente : migration_crm_upsell_vendeurs.sql */
  sold_by_ids?: string[] | null
  created_by: string | null
  notes: string | null
  created_at: string
}

export async function getJobUpsells(jobId: string): Promise<{ upsells: JobUpsell[]; error: string | null }> {
  const { data, error } = await supabase
    .from('job_upsells')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
  return { upsells: (data as JobUpsell[]) ?? [], error: error?.message ?? null }
}

export async function addJobUpsell(input: {
  job_id: string; service: string; price: number; sold_by: string | null
  sold_by_ids?: string[]; created_by: string | null; notes?: string | null
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('job_upsells').insert(input)
  if (error && input.sold_by_ids) {
    // colonne sold_by_ids absente (migration_crm_upsell_vendeurs pas appliquée)
    // → on enregistre au moins la vente, créditée au 1er vendeur choisi
    const { sold_by_ids: _ignored, ...legacy } = input
    const retry = await supabase.from('job_upsells').insert(legacy)
    return { error: retry.error?.message ?? null }
  }
  return { error: error?.message ?? null }
}

export async function deleteJobUpsell(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('job_upsells').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// Profils AVEC leur grille de paye (rate_*/pct_*) — pour afficher ce qu'une
// job rapporte à chaque assigné. '*' : les colonnes de paye n'existent que
// si migration_crm_salaires.sql est appliquée (payRatesOf tolère l'absence).
export async function getProfilesWithRates(ids: string[]): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return []
  const { data } = await supabase.from('profiles').select('*').in('id', ids)
  return (data as Record<string, unknown>[]) ?? []
}
