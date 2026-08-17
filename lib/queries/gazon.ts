import { supabase } from '@/lib/supabase'
import { SHOP_ADDRESS } from '@/lib/gazon-routes'

// ============================================================
// Run de gazon — terrains par secteur + suivi hebdo FAIT / À ÉVITER.
// Tables : gazon_terrains / gazon_passages (migration_crm_gazon_paye.sql).
// position = ordre de passage GLOBAL (croissant à travers tous les secteurs),
// ce qui préserve l'ordre du fichier du client.
// ============================================================

export interface GazonTerrain {
  id: string
  secteur: string
  position: number
  name: string
  address: string | null
  phone: string | null
  superficie_pi2: number | null
  notes: string | null
  frequency: string | null       // texte libre : période / jour préféré
  frequency_type: string | null  // hebdo | bi-hebdo | one-shot (migration_crm_gazon_v2)
  photos: string[]
  a_eviter: boolean
  active: boolean
  client_id: string | null
}

export interface GazonPassage {
  id: string
  terrain_id: string
  week_of: string
  status: string // fait | evite
  note: string | null
  done_by: string | null
  done_at: string | null
  profiles?: { full_name: string | null } | null
  gazon_terrains?: { name: string; secteur: string } | null // embed du rapport du jour
}

// error non-null typiquement = migration_crm_gazon_paye.sql pas encore appliquée.
export async function getTerrains(): Promise<{ terrains: GazonTerrain[]; error: string | null }> {
  const { data, error } = await supabase
    .from('gazon_terrains')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  return { terrains: (data as GazonTerrain[]) ?? [], error: error?.message ?? null }
}

export async function getPassagesWeek(weekOf: string): Promise<GazonPassage[]> {
  const { data } = await supabase
    .from('gazon_passages')
    .select('*, profiles(full_name)')
    .eq('week_of', weekOf)
  return (data as GazonPassage[]) ?? []
}

// Passages sur une plage de semaines [fromWeek, toWeek] inclus (datasheet).
export async function getPassagesRange(fromWeek: string, toWeek: string): Promise<GazonPassage[]> {
  const { data } = await supabase
    .from('gazon_passages')
    .select('*')
    .gte('week_of', fromWeek)
    .lte('week_of', toWeek)
  return (data as GazonPassage[]) ?? []
}

// Coche FAIT ou À ÉVITER pour la semaine (1 ligne par terrain/semaine).
export async function setPassage(
  terrainId: string, weekOf: string, status: 'fait' | 'evite', doneBy: string | null, note?: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('gazon_passages').upsert(
    { terrain_id: terrainId, week_of: weekOf, status, done_by: doneBy, done_at: new Date().toISOString(), note: note ?? null },
    { onConflict: 'terrain_id,week_of' },
  )
  return { error: error?.message ?? null }
}

// Décoche (retire le statut de la semaine).
export async function clearPassage(terrainId: string, weekOf: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('gazon_passages').delete().eq('terrain_id', terrainId).eq('week_of', weekOf)
  return { error: error?.message ?? null }
}

export interface GazonTerrainInput {
  secteur: string
  name: string
  position?: number
  address?: string | null
  phone?: string | null
  superficie_pi2?: number | null
  notes?: string | null
  frequency?: string | null
  frequency_type?: string | null
  photos?: string[]
  a_eviter?: boolean
  active?: boolean
}

// migration_crm_gazon_v2.sql pas encore appliquée → PostgREST refuse la colonne.
// On retire le champ et on réessaie plutôt que de bloquer l'enregistrement.
const missingFreqType = (msg?: string) => !!msg && msg.includes('frequency_type')

export async function createTerrain(input: GazonTerrainInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('gazon_terrains').insert(input)
  if (error && missingFreqType(error.message)) {
    const { frequency_type: _drop, ...rest } = input
    const retry = await supabase.from('gazon_terrains').insert(rest)
    return { error: retry.error?.message ?? null }
  }
  return { error: error?.message ?? null }
}

export async function updateTerrain(id: string, patch: Partial<GazonTerrainInput>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('gazon_terrains').update(patch).eq('id', id)
  if (error && missingFreqType(error.message)) {
    const { frequency_type: _drop, ...rest } = patch
    const retry = await supabase.from('gazon_terrains').update(rest).eq('id', id)
    return { error: retry.error?.message ?? null }
  }
  return { error: error?.message ?? null }
}

// Réordonnancement (mode Édition admin) : n'écrit QUE `position`, et seulement
// pour les terrains qui bougent réellement.
export async function reorderTerrains(updates: { id: string; position: number }[]): Promise<{ error: string | null }> {
  const results = await Promise.all(
    updates.map((u) => supabase.from('gazon_terrains').update({ position: u.position }).eq('id', u.id)),
  )
  const failed = results.find((r) => r.error)
  return { error: failed?.error?.message ?? null }
}

// Terrains ayant AU MOINS un passage « fait » (pour les one shot déjà réalisés).
// Restreint aux ids fournis : la liste des one shot est courte.
export async function getFaitEverIds(terrainIds: string[]): Promise<Set<string>> {
  if (!terrainIds.length) return new Set()
  const { data } = await supabase
    .from('gazon_passages')
    .select('terrain_id')
    .in('terrain_id', terrainIds)
    .eq('status', 'fait')
  return new Set(((data as { terrain_id: string }[]) ?? []).map((p) => p.terrain_id))
}

export async function deleteTerrain(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('gazon_terrains').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// GPS vers un terrain (même forme que directionsUrl de clients.ts).
export function terrainDirectionsUrl(t: Pick<GazonTerrain, 'address'>): string | null {
  const dest = (t.address ?? '').trim()
  if (!dest) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`
}

// Shop MW Multiservices — défini dans lib/gazon-routes (module sans dépendance,
// utilisable côté serveur) et ré-exporté ici pour les imports existants.
export { SHOP_ADDRESS }

// Itinéraire multi-arrêts d'un secteur, dans l'ordre de passage, qui se
// TERMINE toujours au shop. L'URL Google Maps accepte ~9 waypoints + 1
// destination : la destination est le shop, donc au plus 9 terrains
// (filtrer AVANT : restants à faire).
export function gazonRouteUrl(terrains: Pick<GazonTerrain, 'address'>[]): string | null {
  const stops = terrains.map((t) => (t.address ?? '').trim()).filter(Boolean).slice(0, 9)
  if (!stops.length) return null
  let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(SHOP_ADDRESS)}&travelmode=driving`
  url += `&waypoints=${stops.map((a) => encodeURIComponent(a)).join('%7C')}`
  return url
}

// ============================================================
// Notes du jour — gazon_notes (migration_crm_gazon_v2.sql).
// Plusieurs notes possibles par terrain et par jour ; alimente le
// « Rapport du jour » de l'admin.
// ============================================================

export interface GazonNote {
  id: string
  terrain_id: string
  note_date: string // YYYY-MM-DD
  note: string
  author_id: string | null
  created_at: string
  profiles?: { full_name: string | null } | null
  gazon_terrains?: { name: string; secteur: string } | null
}

// error non-null = table absente (migration_crm_gazon_v2.sql pas appliquée).
export async function getNotesForDate(day: string): Promise<{ notes: GazonNote[]; error: string | null }> {
  const { data, error } = await supabase
    .from('gazon_notes')
    .select('*, profiles(full_name), gazon_terrains(name, secteur)')
    .eq('note_date', day)
    .order('created_at', { ascending: true })
  return { notes: (data as GazonNote[]) ?? [], error: error?.message ?? null }
}

export async function addNote(terrainId: string, day: string, note: string, authorId: string | null): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('gazon_notes')
    .insert({ terrain_id: terrainId, note_date: day, note, author_id: authorId })
  return { error: error?.message ?? null }
}

export async function deleteNote(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('gazon_notes').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// Passages effectués pendant la journée locale `day` (rapport admin).
// done_at est un timestamptz → on borne sur la journée locale.
export async function getPassagesDay(day: string): Promise<GazonPassage[]> {
  const start = new Date(day + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const { data } = await supabase
    .from('gazon_passages')
    .select('*, profiles(full_name), gazon_terrains(name, secteur)')
    .gte('done_at', start.toISOString())
    .lt('done_at', end.toISOString())
    .order('done_at', { ascending: true })
  return (data as GazonPassage[]) ?? []
}

// ============================================================
// Optimisation d'itinéraire (Google Routes API, via /api/gazon/optimize).
// Renvoie l'ordre optimisé des ids ; `configured:false` = clé Google absente.
// ============================================================

export interface OptimizeResult {
  order: string[]           // ids de terrains, dans l'ordre optimisé
  distanceMeters: number
  durationSeconds: number
  chunks: number            // > 1 = optimisé par blocs (limite Google de 25 arrêts)
  configured: boolean
  error: string | null
}

export async function optimizeRoute(
  stops: { id: string; address: string }[],
  origin?: string,
): Promise<OptimizeResult> {
  const empty = { order: [], distanceMeters: 0, durationSeconds: 0, chunks: 0 }
  try {
    const res = await fetch('/api/gazon/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops, origin }),
    })
    const json = await res.json()
    if (!res.ok) {
      return { ...empty, configured: json?.configured !== false, error: json?.error ?? `Erreur ${res.status}` }
    }
    return {
      order: json.order ?? [],
      distanceMeters: json.distanceMeters ?? 0,
      durationSeconds: json.durationSeconds ?? 0,
      chunks: json.chunks ?? 1,
      configured: true,
      error: null,
    }
  } catch (e) {
    return { ...empty, configured: true, error: e instanceof Error ? e.message : 'Réseau indisponible' }
  }
}
