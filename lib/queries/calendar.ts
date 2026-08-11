import { supabase } from '@/lib/supabase'
import { addWeeks } from '@/lib/payes'

// ============================================================
// Requêtes Calendrier (Phase 4) — table jobs (rendez-vous / créneaux).
// type : fenetre | gazon | projet · team : equipe1 | equipe2
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
  status: string // scheduled | done | canceled | dispo (slot mauve à vendre)
  price: number | null
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
  notes?: string | null
  client_id?: string | null
  lead_id?: string | null
}

export async function createJob(input: JobInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('jobs').insert(input)
  return { error: error?.message ?? null }
}

export async function updateJob(id: string, input: Partial<JobInput>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('jobs').update(input).eq('id', id)
  return { error: error?.message ?? null }
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
// Photos & dépenses de job (projets pavé/taillage…) — tables job_photos /
// job_expenses (migration_crm_gazon_paye.sql). error non-null = migration absente.
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

export interface JobExpense {
  id: string
  job_id: string
  profile_id: string | null
  label: string
  amount: number
  photo_path: string | null
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

export async function getJobExpenses(jobId: string): Promise<{ expenses: JobExpense[]; error: string | null }> {
  const { data, error } = await supabase
    .from('job_expenses')
    .select('*, profiles(full_name)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
  return { expenses: (data as JobExpense[]) ?? [], error: error?.message ?? null }
}

export async function addJobExpense(input: { job_id: string; profile_id: string | null; label: string; amount: number; photo_path?: string | null }): Promise<{ error: string | null }> {
  const { error } = await supabase.from('job_expenses').insert(input)
  return { error: error?.message ?? null }
}

export async function deleteJobExpense(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('job_expenses').delete().eq('id', id)
  return { error: error?.message ?? null }
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
