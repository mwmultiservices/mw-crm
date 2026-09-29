import { supabase } from '@/lib/supabase'
import { runLabel, compareVilles, type VilleDef } from '@/lib/fermeture'
import type { Job } from '@/lib/queries/calendar'

// ============================================================
// Run fermeture — clients de la saison de fermeture, classés par ville
// (code postal) et répartis en journées (« Longueuil #1 »…) planifiées au
// calendrier Paysagement (jobs.type = 'fermeture', route_name = la journée).
// Tables : fermeture_clients / fermeture_villes (migration_crm_fermeture.sql).
// Contrairement au gazon (suivi hebdo), un client de fermeture n'a qu'UN
// statut pour la saison : fait / évité, porté par sa propre ligne.
// ============================================================

export interface FermetureClient {
  id: string
  client_id: string | null      // fiche de la base clients, si rattachée
  name: string
  address: string | null
  city: string | null           // ville de l'adresse (fiche)
  postal_code: string | null
  phone: string | null
  email: string | null
  ville: string                 // groupe de la run : classé auto selon le code postal ('' = sans ville)
  journee: number | null        // n° de journée dans la ville (#1, #2…) ; null = à planifier
  position: number              // ordre de passage (croissant) à l'intérieur d'une journée
  superficie_pi2: number | null
  notes: string | null
  photos: string[]
  a_eviter: boolean             // admin : à ne pas faire
  status: string | null         // null | fait | evite
  status_note: string | null    // raison d'un « À éviter »
  done_by: string | null
  done_at: string | null
  created_at: string
}

export interface FermetureVille extends VilleDef {
  id: string
}

export type FermetureClientInput = Partial<Omit<FermetureClient, 'id' | 'created_at'>>

// error non-null typiquement = migration_crm_fermeture.sql pas encore appliquée.
export async function getFermetureClients(): Promise<{ clients: FermetureClient[]; error: string | null }> {
  const { data, error } = await supabase
    .from('fermeture_clients')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  const clients = ((data as FermetureClient[]) ?? []).map((c) => ({ ...c, ville: c.ville ?? '', photos: c.photos ?? [] }))
  return { clients, error: error?.message ?? null }
}

export async function createFermetureClient(input: FermetureClientInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('fermeture_clients').insert(input)
  return { error: error?.message ?? null }
}

export async function updateFermetureClient(id: string, patch: FermetureClientInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('fermeture_clients').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteFermetureClient(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('fermeture_clients').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// FAIT / À ÉVITER — null = décoché.
export async function setFermetureStatus(
  id: string, status: 'fait' | 'evite' | null, userId: string | null,
): Promise<{ error: string | null }> {
  return updateFermetureClient(id, status
    ? { status, done_by: userId, done_at: new Date().toISOString(), status_note: null }
    : { status: null, done_by: null, done_at: null, status_note: null })
}

// Plan (Réorganiser, Diviser, Optimiser → Confirmer) : n'écrit que les lignes
// qui changent, par paquets pour ne pas saturer le réseau du téléphone.
export async function saveFermeturePlan(
  updates: { id: string; ville?: string; journee?: number | null; position?: number }[],
): Promise<{ error: string | null }> {
  for (let i = 0; i < updates.length; i += 20) {
    const results = await Promise.all(
      updates.slice(i, i + 20).map(({ id, ...patch }) => supabase.from('fermeture_clients').update(patch).eq('id', id)),
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) return { error: failed.error.message }
  }
  return { error: null }
}

// Villes ajoutées par l'admin (avec leurs préfixes de code postal). Table
// absente → liste vide : seul le classement de référence s'applique.
export async function getFermetureVilles(): Promise<FermetureVille[]> {
  const { data, error } = await supabase.from('fermeture_villes').select('id, name, prefixes').order('name')
  if (error) return []
  return ((data as FermetureVille[]) ?? []).map((v) => ({ ...v, prefixes: v.prefixes ?? [] }))
}

export async function createFermetureVille(v: VilleDef): Promise<{ error: string | null }> {
  const { error } = await supabase.from('fermeture_villes').insert({ name: v.name, prefixes: v.prefixes })
  return { error: error?.message ?? null }
}

export async function deleteFermetureVille(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('fermeture_villes').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// Jobs du calendrier qui planifient une journée de fermeture.
export async function getFermetureJobs(): Promise<Job[]> {
  const { data } = await supabase
    .from('jobs')
    .select('*, clients(name)')
    .eq('type', 'fermeture')
    .order('start_at', { ascending: true })
  return (data as Job[]) ?? []
}

// Journées existantes (« Longueuil #1 »…) — menu du JobModal. Table absente → [].
export async function getFermetureRunLabels(): Promise<string[]> {
  const { data, error } = await supabase
    .from('fermeture_clients')
    .select('ville, journee')
    .not('journee', 'is', null)
  if (error || !data) return []
  const runs = new Map<string, { ville: string; journee: number }>()
  for (const r of data as { ville: string | null; journee: number }[]) {
    const ville = r.ville ?? ''
    runs.set(runLabel(ville, r.journee), { ville, journee: r.journee })
  }
  return [...runs.entries()]
    .sort(([, a], [, b]) => compareVilles(a.ville, b.ville) || a.journee - b.journee)
    .map(([label]) => label)
}
