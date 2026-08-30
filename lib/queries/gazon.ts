import { supabase } from '@/lib/supabase'
import { SHOP_ADDRESS, fullTerrainAddress } from '@/lib/gazon-routes'

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
// L'adresse est complétée (ville/province) — brute, « 1665 av Victoria »
// enverrait le camion n'importe où.
export function terrainDirectionsUrl(t: Pick<GazonTerrain, 'address' | 'secteur'>): string | null {
  const dest = fullTerrainAddress(t.address, t.secteur)
  if (!dest) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`
}

// Shop MW Multiservices — défini dans lib/gazon-routes (module sans dépendance,
// utilisable côté serveur) et ré-exporté ici pour les imports existants.
export { SHOP_ADDRESS }

// Itinéraire multi-arrêts, dans l'ordre de passage, qui TERMINE au shop.
//
// ATTENTION — deux plafonds Google DIFFÉRENTS, ne pas confondre :
//   • Routes API v2 (/api/gazon/optimize) = 25 arrêts intermédiaires/appel ;
//   • ce deep link grand public (maps/dir/?api=1) = 9 waypoints + 1
//     destination = 10 arrêts, point final. Monter la limite ne marche PAS,
//     Google tronque silencieusement.
// On découpe donc la run en SEGMENTS de 10 arrêts : la destination d'un
// segment intermédiaire est son 10e terrain — soit exactement là où le gars
// se trouve quand il ouvre le segment suivant — et le dernier rentre au shop.
//
// Les segments sont recalculés à partir des terrains RESTANTS : dès que les
// 10 premiers sont cochés FAIT, le segment 1 devient les 10 suivants. Le
// travailleur n'a donc qu'à reprendre le même bouton.
const MAPS_MAX_WAYPOINTS = 9

export interface GazonRouteSegment {
  url: string
  from: number // n° du 1er terrain du segment (1-based) ; 0 = segment « retour au shop » seul
  to: number
  endsAtShop: boolean
}

export function gazonRouteSegments(
  terrains: Pick<GazonTerrain, 'address' | 'secteur'>[],
): GazonRouteSegment[] {
  const stops = terrains
    .map((t) => fullTerrainAddress(t.address, t.secteur))
    .filter((a) => a.length > 0)
  if (!stops.length) return []

  const link = (dest: string, wp: string[]) =>
    `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(dest)}` +
    (wp.length ? `&waypoints=${wp.map((a) => encodeURIComponent(a)).join('%7C')}` : '')

  const segments: GazonRouteSegment[] = []
  let i = 0
  while (i < stops.length) {
    const wp = stops.slice(i, i + MAPS_MAX_WAYPOINTS)
    const next = stops[i + MAPS_MAX_WAYPOINTS] // 10e arrêt du lien, s'il existe
    const take = wp.length + (next ? 1 : 0)
    segments.push({ url: link(next ?? SHOP_ADDRESS, wp), from: i + 1, to: i + take, endsAtShop: !next })
    i += take
  }
  // Total multiple de 10 : le dernier segment finit sur un terrain et non au
  // shop → on ajoute le retour comme segment distinct.
  if (!segments[segments.length - 1].endsAtShop) {
    segments.push({ url: link(SHOP_ADDRESS, []), from: 0, to: 0, endsAtShop: true })
  }
  return segments
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
  skipped: string[]         // adresses que Google n'a pas su géocoder (laissées en place)
  configured: boolean
  error: string | null
}

export async function optimizeRoute(
  stops: { id: string; address: string }[],
  origin?: string,
): Promise<OptimizeResult> {
  const empty = { order: [], distanceMeters: 0, durationSeconds: 0, chunks: 0, skipped: [] }
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
      skipped: json.skipped ?? [],
      configured: true,
      error: null,
    }
  } catch (e) {
    return { ...empty, configured: true, error: e instanceof Error ? e.message : 'Réseau indisponible' }
  }
}
