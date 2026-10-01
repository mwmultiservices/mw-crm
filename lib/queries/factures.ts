import { supabase } from '@/lib/supabase'
import { deletePhoto } from '@/lib/storage'
import type { Job } from '@/lib/queries/calendar'

// ============================================================
// Factures — les reçus des dépenses entrées dans les jobs (gaz, matériel…).
// Table job_expenses (migration_crm_gazon_paye.sql) : une ligne = une dépense
// + la photo du reçu (bucket mw-photos). profile_id = qui a payé (à rembourser).
// job_id NULL = dépense générale sans job : demande
// migration_crm_fermeture_factures.sql (job_id facultatif).
// Page admin /factures : toutes les factures, par date et heure d'entrée.
// ============================================================

export interface Facture {
  id: string
  job_id: string | null
  profile_id: string | null
  label: string
  amount: number
  photo_path: string | null
  created_at: string
  profiles?: { full_name: string | null } | null
  jobs?: Pick<Job, 'id' | 'title' | 'service' | 'type' | 'route_name' | 'start_at' | 'clients'> | null
}

const COLS = '*, profiles(full_name), jobs(id, title, service, type, route_name, start_at, clients(name))'

// from/to : bornes ISO [from, to[ sur la date d'entrée (created_at).
export async function getFactures(opts: {
  from?: string | null
  to?: string | null
  profileId?: string | null
  limit?: number
} = {}): Promise<{ factures: Facture[]; error: string | null }> {
  let q = supabase.from('job_expenses').select(COLS)
  if (opts.from) q = q.gte('created_at', opts.from)
  if (opts.to) q = q.lt('created_at', opts.to)
  if (opts.profileId) q = q.eq('profile_id', opts.profileId)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(opts.limit ?? 1000)
  const factures = ((data as Facture[]) ?? []).map((f) => ({ ...f, amount: Number(f.amount) || 0 }))
  return { factures, error: error?.message ?? null }
}

export async function getJobFactures(jobId: string): Promise<{ factures: Facture[]; error: string | null }> {
  const { data, error } = await supabase
    .from('job_expenses')
    .select('*, profiles(full_name)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
  const factures = ((data as Facture[]) ?? []).map((f) => ({ ...f, amount: Number(f.amount) || 0 }))
  return { factures, error: error?.message ?? null }
}

export const NO_JOB_MIGRATION =
  'Choisis une job : une facture sans job demande la migration migration_crm_fermeture_factures.sql.'

export async function addFacture(input: {
  job_id: string | null
  profile_id: string | null
  label: string
  amount: number
  photo_path: string | null
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('job_expenses').insert(input)
  // 23502 = NOT NULL : job_id encore obligatoire (migration pas appliquée)
  if (error && input.job_id === null && (error.code === '23502' || /job_id/.test(error.message))) {
    return { error: NO_JOB_MIGRATION }
  }
  return { error: error?.message ?? null }
}

export async function deleteFacture(f: Pick<Facture, 'id' | 'photo_path'>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('job_expenses').delete().eq('id', f.id)
  if (error) return { error: error.message }
  if (f.photo_path) deletePhoto(f.photo_path)
  return { error: null }
}

// Jobs proposées dans « Entrée de facture » : de 7 jours avant à demain,
// celles de l'employé (toutes pour un admin), annulées exclues.
export async function getJobsForFacture(profileId: string | null, all: boolean): Promise<Job[]> {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)
  let q = supabase
    .from('jobs')
    .select('*, clients(name)')
    .gte('start_at', from.toISOString())
    .lt('start_at', to.toISOString())
    .neq('status', 'canceled')
  if (!all && profileId) q = q.contains('assigned_ids', [profileId])
  const { data } = await q.order('start_at', { ascending: false }).limit(80)
  return (data as Job[]) ?? []
}

// Job à pré-choisir : celle en cours, sinon la prochaine d'aujourd'hui, sinon
// la dernière d'aujourd'hui. Aucune aujourd'hui → null (« sans job »).
export function currentJobOf(jobs: Job[], now = Date.now()): Job | null {
  const today = new Date(now).toDateString()
  const todays = jobs
    .filter((j) => j.start_at && new Date(j.start_at).toDateString() === today)
    .sort((a, b) => a.start_at!.localeCompare(b.start_at!))
  if (!todays.length) return null
  const inProgress = todays.find((j) => {
    const s = new Date(j.start_at!).getTime()
    const e = j.end_at ? new Date(j.end_at).getTime() : s + 2 * 3600000
    return now >= s && now <= e
  })
  return inProgress ?? todays.find((j) => new Date(j.start_at!).getTime() > now) ?? todays[todays.length - 1]
}

// ------------------------------------------------------------
// Nom du fichier téléchargé : ASCII seulement (en-tête Content-Disposition),
// parlant dans QuickBooks — « facture-2026-09-30-gaz-45.00-fermeture-longueuil-1.jpg »
// ------------------------------------------------------------
const slug = (s: string | null | undefined, max = 40) =>
  (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, max).replace(/-+$/, '')

export function factureFileName(
  f: Pick<Facture, 'label' | 'amount' | 'created_at' | 'photo_path'>,
  jobTitle?: string | null,
): string {
  const d = new Date(f.created_at)
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const ext = (f.photo_path?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const parts = ['facture', day, slug(f.label, 30), (Number(f.amount) || 0).toFixed(2), slug(jobTitle)]
  return `${parts.filter(Boolean).join('-')}.${ext}`
}
