import { supabase } from '@/lib/supabase'

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
  frequency: string | null
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
  photos?: string[]
  a_eviter?: boolean
  active?: boolean
}

export async function createTerrain(input: GazonTerrainInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('gazon_terrains').insert(input)
  return { error: error?.message ?? null }
}

export async function updateTerrain(id: string, patch: Partial<GazonTerrainInput>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('gazon_terrains').update(patch).eq('id', id)
  return { error: error?.message ?? null }
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

// Shop MW Multiservices — point d'ARRIVÉE de tous les itinéraires de gazon.
export const SHOP_ADDRESS = '6350 Ch. de la Savane, Saint-Hubert, QC J3Y 0Z9'

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
