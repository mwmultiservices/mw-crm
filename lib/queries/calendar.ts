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
  start_at: string | null
  end_at: string | null
  all_day: boolean
  status: string
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

const JOB_COLS =
  'id, client_id, lead_id, title, service, type, team, assigned_ids, route_name, start_at, end_at, all_day, status, price, notes, clients(name)'

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

// Employés assignables à un job, selon les rôles voulus (techs / terrain).
export async function getAssignableProfiles(roles: string[]): Promise<AssignProfile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, color, role')
    .in('role', roles)
    .order('full_name')
  return (data as AssignProfile[]) ?? []
}
