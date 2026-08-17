import { SHOP_ADDRESS } from '@/lib/gazon-routes'

// ============================================================
// POST /api/gazon/optimize — ordre de passage optimisé par Google.
//
// Body : { stops: [{ id, address }], origin?: string }
//   origin = point de départ (adresse OU "lat,lng" de la position du camion).
//            Défaut : le shop. L'arrivée est TOUJOURS le shop.
// Réponse : { order: string[], distanceMeters, durationSeconds, chunks, skipped }
//   skipped = ids des arrêts que Google n'arrive pas à géocoder (adresse
//             incomplète) ; ils restent à leur position manuelle côté UI.
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

// Google échoue en bloc (« pas d'itinéraire ») dès qu'UN arrêt n'est pas
// géocodable, sans dire lequel : on le retrouve par dichotomie.
class NoRouteError extends Error {}

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
  if (!route) throw new NoRouteError('Aucun itinéraire trouvé pour ces adresses.')

  // optimizedIntermediateWaypointIndex[i] = index d'origine du i-ème arrêt visité.
  const idx: number[] = route.optimizedIntermediateWaypointIndex ?? stops.map((_, i) => i)
  const order = idx.map((i) => stops[i]).filter(Boolean)
  // duration = "1234s"
  const durationSeconds = Number(String(route.duration ?? '0').replace('s', '')) || 0
  return { order, distanceMeters: route.distanceMeters ?? 0, durationSeconds }
}

// Trouve par dichotomie les arrêts que Google n'arrive pas à géocoder.
// Appelé UNIQUEMENT quand un bloc a échoué, donc jamais en temps normal :
// ~2·log2(n) appels pour un fautif, et on s'arrête à MAX_PROBES pour borner
// la facture si les adresses sont massivement mauvaises.
const MAX_PROBES = 24

async function findBadStops(
  apiKey: string, origin: string, destination: string, stops: Stop[],
): Promise<Set<string>> {
  const bad = new Set<string>()
  let probes = 0

  const probe = async (group: Stop[]): Promise<void> => {
    if (!group.length || probes >= MAX_PROBES) return
    probes++
    try {
      await optimizeChunk(apiKey, origin, destination, group)
      return // ce sous-groupe passe : rien à écarter dedans
    } catch (e) {
      if (!(e instanceof NoRouteError)) throw e // vraie panne (quota, réseau) : on remonte
    }
    if (group.length === 1) { bad.add(group[0].id); return }
    const mid = Math.ceil(group.length / 2)
    await probe(group.slice(0, mid))
    await probe(group.slice(mid))
  }

  await probe(stops)
  // Budget épuisé sans conclusion : on écarte tout le bloc plutôt que de
  // renvoyer un ordre partiel trompeur.
  if (probes >= MAX_PROBES && !bad.size) for (const s of stops) bad.add(s.id)
  return bad
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
    return Response.json({ order: stops.map((s) => s.id), distanceMeters: 0, durationSeconds: 0, chunks: 0, skipped: [] })
  }

  try {
    const out: Stop[] = []
    const skipped: string[] = []
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
      const destination = anchor ? anchor.address : SHOP_ADDRESS
      let middle = anchor ? chunk.slice(0, -1) : chunk

      let r: { order: Stop[]; distanceMeters: number; durationSeconds: number }
      try {
        r = await optimizeChunk(apiKey, cursor, destination, middle)
      } catch (e) {
        if (!(e instanceof NoRouteError)) throw e
        // Une adresse du bloc est introuvable : on l'isole et on repart sans
        // elle, plutôt que de faire échouer toute l'optimisation.
        const bad = await findBadStops(apiKey, cursor, destination, middle)
        const kept = middle.filter((s) => !bad.has(s.id))
        r = { order: [], distanceMeters: 0, durationSeconds: 0 }
        if (kept.length) {
          try {
            r = await optimizeChunk(apiKey, cursor, destination, kept)
          } catch (e2) {
            // Budget de sondes épuisé : il reste un fautif non identifié.
            // On abandonne l'optimisation de CE bloc (ordre manuel) au lieu
            // de faire échouer toute la requête.
            if (!(e2 instanceof NoRouteError)) throw e2
            for (const s of kept) bad.add(s.id)
          }
        }
        for (const s of middle) if (bad.has(s.id)) skipped.push(s.id)
      }

      out.push(...r.order)
      if (anchor) out.push(anchor)
      distanceMeters += r.distanceMeters
      durationSeconds += r.durationSeconds
      cursor = anchor ? anchor.address : cursor
    }

    return Response.json({ order: out.map((s) => s.id), distanceMeters, durationSeconds, chunks, skipped })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Optimisation impossible'
    console.error('[gazon/optimize]', msg)
    return Response.json({ error: msg }, { status: 502 })
  }
}
