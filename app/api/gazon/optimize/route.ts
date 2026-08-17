import { SHOP_ADDRESS } from '@/lib/gazon-routes'

// ============================================================
// POST /api/gazon/optimize — ordre de passage optimisé par Google.
//
// Body : { stops: [{ id, address }], origin?: string }
//   origin = point de départ (adresse OU "lat,lng" de la position du camion).
//            Défaut : le shop. L'arrivée est TOUJOURS le shop.
// Réponse : { order: string[], distanceMeters, durationSeconds, chunks }
//
// Utilise la Routes API v2 (computeRoutes + optimizeWaypointOrder).
// Clé serveur uniquement : GOOGLE_MAPS_API_KEY (jamais exposée au client).
// Sans clé → 503 + { configured: false } : l'UI retombe sur l'ordre manuel.
// ============================================================

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'

// Google plafonne à 25 arrêts intermédiaires par requête. Au-delà (la route
// LONGUEUIL compte 31 terrains), on découpe en blocs enchaînés : le dernier
// arrêt d'un bloc — dans l'ordre manuel — sert de destination à ce bloc et de
// départ au suivant. Ça garde des distances cohérentes bout à bout, mais ce
// n'est plus un optimum global (les blocs suivent le découpage manuel), d'où
// `chunks` renvoyé au client.
const MAX_STOPS_PER_CALL = 24

interface Stop { id: string; address: string }

// "45.53,-73.51" → waypoint GPS ; sinon adresse texte.
function waypoint(value: string) {
  const m = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (m) return { location: { latLng: { latitude: Number(m[1]), longitude: Number(m[2]) } } }
  return { address: value.trim() }
}

async function optimizeChunk(
  apiKey: string, origin: string, destination: string, stops: Stop[],
): Promise<{ order: Stop[]; distanceMeters: number; durationSeconds: number }> {
  // rien à optimiser (bloc réduit à sa seule ancre) — pas d'appel Google
  if (!stops.length) return { order: [], distanceMeters: 0, durationSeconds: 0 }

  const res = await fetch(ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify({
      origin: waypoint(origin),
      destination: waypoint(destination),
      intermediates: stops.map((s) => waypoint(s.address)),
      travelMode: 'DRIVE',
      optimizeWaypointOrder: true,
      languageCode: 'fr-CA',
      units: 'METRIC',
    }),
    signal: AbortSignal.timeout(15000),
  })

  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`
    throw new Error(msg)
  }

  const route = json?.routes?.[0]
  if (!route) throw new Error('Aucun itinéraire trouvé pour ces adresses.')

  // optimizedIntermediateWaypointIndex[i] = index d'origine du i-ème arrêt visité.
  const idx: number[] = route.optimizedIntermediateWaypointIndex ?? stops.map((_, i) => i)
  const order = idx.map((i) => stops[i]).filter(Boolean)
  // duration = "1234s"
  const durationSeconds = Number(String(route.duration ?? '0').replace('s', '')) || 0
  return { order, distanceMeters: route.distanceMeters ?? 0, durationSeconds }
}

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return Response.json(
      { configured: false, error: 'Clé Google absente — ajouter GOOGLE_MAPS_API_KEY (Routes API) dans Vercel.' },
      { status: 503 },
    )
  }

  let body: { stops?: Stop[]; origin?: string }
  try { body = await request.json() } catch { return Response.json({ error: 'JSON invalide' }, { status: 400 }) }

  const stops = (body.stops ?? []).filter((s) => s?.id && (s.address ?? '').trim())
  if (stops.length < 2) {
    // 0 ou 1 arrêt : rien à optimiser, on renvoie l'ordre reçu.
    return Response.json({ order: stops.map((s) => s.id), distanceMeters: 0, durationSeconds: 0, chunks: 0 })
  }

  try {
    const out: Stop[] = []
    let distanceMeters = 0
    let durationSeconds = 0
    let cursor = (body.origin ?? '').trim() || SHOP_ADDRESS
    const chunks = Math.ceil(stops.length / MAX_STOPS_PER_CALL)

    for (let i = 0; i < stops.length; i += MAX_STOPS_PER_CALL) {
      const chunk = stops.slice(i, i + MAX_STOPS_PER_CALL)
      const isLast = i + MAX_STOPS_PER_CALL >= stops.length
      // bloc intermédiaire : son dernier arrêt (ordre manuel) devient la
      // destination, donc le point de départ du bloc suivant.
      const anchor = isLast ? null : chunk[chunk.length - 1]
      const middle = anchor ? chunk.slice(0, -1) : chunk

      const r = await optimizeChunk(apiKey, cursor, anchor ? anchor.address : SHOP_ADDRESS, middle)
      out.push(...r.order)
      if (anchor) out.push(anchor)
      distanceMeters += r.distanceMeters
      durationSeconds += r.durationSeconds
      cursor = anchor ? anchor.address : cursor
    }

    return Response.json({ order: out.map((s) => s.id), distanceMeters, durationSeconds, chunks })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Optimisation impossible'
    console.error('[gazon/optimize]', msg)
    return Response.json({ error: msg }, { status: 502 })
  }
}
