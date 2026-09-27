import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fullTerrainAddress } from '@/lib/gazon-routes'

// ============================================================
// POST /api/gazon/geocode — coordonnées GPS des terrains (« Prochain client »).
//
// Body : { ids: string[] }
// Réponse : { updated, failed, remaining }
//
// Géocode (Geocoding API Google) les terrains dont les coordonnées sont
// absentes ou périmées, puis les écrit dans gazon_terrains.lat/lng/
// geocoded_address (migration_crm_gazon_coords.sql). L'adresse est relue
// EN BASE et complétée ici (fullTerrainAddress) : on ne géocode jamais un
// texte envoyé par le client. Un terrain à jour est ignoré → rappeler la
// route ne coûte rien.
//
// Clé serveur : GOOGLE_MAPS_API_KEY (la même que /api/gazon/optimize ;
// la Geocoding API doit être activée sur le projet Google Cloud).
// ============================================================

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'

// Par appel : borne la durée de la route (le client rappelle si `remaining`).
const MAX_PER_CALL = 50
const PARALLEL = 8

// Précision exigée pour naviguer : un point au centre de la rue ou de la
// ville enverrait le camion au mauvais endroit. Moins précis → on garde
// l'adresse texte, que l'app Maps résout elle-même.
const PRECISE = new Set(['ROOFTOP', 'RANGE_INTERPOLATED'])

// Erreur qui concerne la clé ou le quota, pas l'adresse : on arrête tout et
// on ne marque rien comme « essayé ».
class GeocodeConfigError extends Error {}

async function geocode(apiKey: string, address: string): Promise<{ lat: number; lng: number } | null> {
  const url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&components=country:CA&region=ca&language=fr&key=${apiKey}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  const json = await res.json().catch(() => null)
  const status: string = json?.status ?? `HTTP ${res.status}`
  if (status === 'ZERO_RESULTS') return null
  if (status !== 'OK') throw new GeocodeConfigError(json?.error_message ? `${status} — ${json.error_message}` : status)

  const r = json.results?.[0]
  if (!r || r.partial_match || !PRECISE.has(r.geometry?.location_type)) return null
  const { lat, lng } = r.geometry.location
  return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null
}

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return Response.json(
      { configured: false, error: 'Clé Google absente — ajouter GOOGLE_MAPS_API_KEY dans Vercel.' },
      { status: 503 },
    )
  }

  let body: { ids?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'JSON invalide' }, { status: 400 }) }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : []
  if (!ids.length) return Response.json({ updated: 0, failed: 0, remaining: 0 })

  const { data, error } = await supabaseAdmin
    .from('gazon_terrains')
    .select('id, address, secteur, lat, lng, geocoded_address')
    .in('id', ids.slice(0, 500))
  if (error) {
    // colonnes absentes = migration_crm_gazon_coords.sql pas appliquée
    return Response.json({ migrated: false, error: error.message }, { status: 503 })
  }

  const stale = (data ?? [])
    .map((t) => ({ id: t.id as string, full: fullTerrainAddress(t.address, t.secteur), done: t.geocoded_address as string | null }))
    .filter((t) => t.full && t.full !== t.done)
  const batch = stale.slice(0, MAX_PER_CALL)

  let updated = 0
  let failed = 0
  try {
    for (let i = 0; i < batch.length; i += PARALLEL) {
      await Promise.all(batch.slice(i, i + PARALLEL).map(async (t) => {
        const pos = await geocode(apiKey, t.full)
        const { error: upErr } = await supabaseAdmin
          .from('gazon_terrains')
          .update({ lat: pos?.lat ?? null, lng: pos?.lng ?? null, geocoded_address: t.full })
          .eq('id', t.id)
        if (upErr) throw new Error(upErr.message)
        if (pos) updated++
        else failed++
      }))
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Géocodage impossible'
    console.error('[gazon/geocode]', msg)
    return Response.json({ error: msg, updated, failed }, { status: 502 })
  }

  return Response.json({ updated, failed, remaining: stale.length - batch.length })
}
