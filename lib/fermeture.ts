// ============================================================
// Run fermeture — logique pure (aucun import : testable seule).
// Source unique pour :
//   • le classement AUTOMATIQUE d'un client dans une ville selon son code
//     postal (préfixe « J4K »), avec repli sur la ville saisie ;
//   • les journées d'une ville : « Longueuil #1 », « Longueuil #2 »… Ce
//     libellé est stocké dans jobs.route_name (type 'fermeture') et sert de
//     clé à /fermeture?run=… (vue employé verrouillée sur SA journée) ;
//   • l'adresse complète envoyée à Google (optimisation, navigation).
// Tables : fermeture_clients / fermeture_villes (migration_crm_fermeture.sql).
// ============================================================

export interface VilleDef {
  name: string
  prefixes: string[] // débuts de code postal, sans espace : « J4K », « J4L1 »
}

interface VilleRef extends VilleDef {
  aliases?: string[] // autres graphies acceptées dans le champ « ville »
}

// Rive-Sud — préfixes vérifiés sur la base clients (2026-09-28).
// Un préfixe peut couvrir deux villes (J3L = Carignan ET Chambly) : la ville
// saisie sur la fiche tranche alors (cf. villeAuto).
// Les villes ajoutées par l'admin (table fermeture_villes) passent AVANT.
export const VILLES_REFERENCE: VilleRef[] = [
  { name: 'Longueuil', prefixes: ['J4G', 'J4H', 'J4J', 'J4K', 'J4L', 'J4M', 'J4N'], aliases: ['Vieux-Longueuil', 'LeMoyne'] },
  { name: 'Saint-Hubert', prefixes: ['J3Y', 'J4T'] },
  { name: 'Greenfield Park', prefixes: ['J4V'] },
  { name: 'Saint-Lambert', prefixes: ['J4P', 'J4R'] },
  { name: 'Boucherville', prefixes: ['J4B'] },
  { name: 'Brossard', prefixes: ['J4W', 'J4X', 'J4Y', 'J4Z'] },
  { name: 'Saint-Bruno', prefixes: ['J3V'], aliases: ['Saint-Bruno-de-Montarville'] },
  { name: 'Carignan', prefixes: ['J3L'] },
  { name: 'Chambly', prefixes: ['J3L'] },
  { name: 'Sainte-Julie', prefixes: ['J3E'] },
  { name: 'Varennes', prefixes: ['J3X'] },
  { name: 'Saint-Basile-le-Grand', prefixes: ['J3N'] },
  { name: 'Mont-Saint-Hilaire', prefixes: ['J3H'], aliases: ['Saint-Hilaire'] },
  { name: 'Beloeil', prefixes: ['J3G'] },
  { name: 'La Prairie', prefixes: ['J5R'] },
  { name: 'Candiac', prefixes: ['J5R'] },
]

// Couleur de la fermeture (bouton « Démarrer », calendrier, accueil).
export const FERMETURE_COLOR = '#C2410C'

// ville '' = client qu'on n'a pas pu classer (ni code postal ni ville)
export const SANS_VILLE = 'Sans ville'
export const villeLabel = (ville: string): string => ville || SANS_VILLE

// ------------------------------------------------------------
// Normalisation
// ------------------------------------------------------------

const deburr = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE')

const POSTAL_RE = /\b([A-Z]\d[A-Z])[\s-]?(\d[A-Z]\d)\b/i

// Code postal (sans espace) trouvé dans un texte. `partial` : le champ ne
// contient peut-être que le préfixe (« J4K ») — accepté pour le code postal
// saisi, jamais pour une adresse libre.
export function extractPostal(text: string | null | undefined, partial = false): string | null {
  const t = (text ?? '').toUpperCase()
  const m = t.match(POSTAL_RE)
  if (m) return m[1] + m[2]
  if (partial) {
    const f = t.replace(/[\s-]/g, '').match(/^([A-Z]\d[A-Z])/)
    if (f) return f[1]
  }
  return null
}

// « J4K1A1 » → « J4K 1A1 » (tel quel si ce n'est pas un code complet)
export function formatPostal(p: string | null | undefined): string {
  const s = (p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(s) ? `${s.slice(0, 3)} ${s.slice(3)}` : (p ?? '').trim()
}

// Ville saisie débarrassée du code postal, de la province, des parenthèses.
function cleanCity(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(new RegExp(POSTAL_RE.source, 'gi'), ' ')
    .replace(/[(),]/g, ' ')
    .replace(/(^|\s)(qc|p\.?\s?q\.?|qu[ée]bec|canada)(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[àa]\s+/i, '') // « à Longueuil »
}

const expandSaint = (s: string) =>
  s.replace(/(^|[\s-])ste[\s.-]+/gi, '$1Sainte-').replace(/(^|[\s-])st[\s.-]+/gi, '$1Saint-')

// Clé de comparaison : « St-Hubert », « ST HUBERT », « Saint-Hubert » → « saint-hubert »
export function cityKey(raw: string | null | undefined): string {
  return deburr(expandSaint(cleanCity(raw)))
    .toLowerCase()
    .replace(/[\s.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const SMALL_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'sur', 'en', 'aux', 'et'])
function titleCase(s: string): string {
  let first = true
  return s.toLowerCase().replace(/[^\s-]+/g, (w) => {
    const out = !first && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    first = false
    return out
  })
}

const keysOf = (r: VilleRef) => [r.name, ...(r.aliases ?? [])].map(cityKey)

// Ville écrite dans l'adresse elle-même : « 824 rue X, Mont-Saint-Hilaire, J3H 5E5 »
function cityFromAddress(address: string | null | undefined): string {
  for (const part of (address ?? '').split(',').slice(1)) {
    const c = cleanCity(part)
    if (c && !/\d/.test(c)) return c
  }
  return ''
}

// Nom canonique d'une ville saisie : ville ajoutée par l'admin, ville de
// référence (alias compris), ville déjà présente dans la liste — sinon la
// saisie mise en forme (« ST-AMABLE » → « Saint-Amable »).
export function canonicalCity(raw: string | null | undefined, custom: VilleDef[] = [], existing: string[] = []): string {
  const cleaned = cleanCity(raw)
  const k = cityKey(cleaned)
  if (!k) return ''
  return (
    custom.find((v) => cityKey(v.name) === k)?.name ??
    VILLES_REFERENCE.find((r) => keysOf(r).includes(k))?.name ??
    existing.find((v) => cityKey(v) === k) ??
    titleCase(expandSaint(cleaned))
  )
}

// Définitions dont un préfixe est le plus long début du code postal.
function prefixMatches<T extends VilleDef>(postal: string, defs: T[]): T[] {
  let best = 0
  let out: T[] = []
  for (const d of defs) {
    for (const raw of d.prefixes) {
      const p = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (p.length < 2 || !postal.startsWith(p)) continue
      if (p.length > best) { best = p.length; out = [d] }
      else if (p.length === best && !out.includes(d)) out.push(d)
    }
  }
  return out
}

// ------------------------------------------------------------
// Classement automatique
// ------------------------------------------------------------

export interface Locatable {
  address?: string | null
  city?: string | null
  postal_code?: string | null
}

// Ville (groupe de la run) d'un client, déduite de son code postal :
//   1. ville ajoutée par l'admin dont un préfixe correspond ;
//   2. ville de référence (préfixe partagé → la ville saisie tranche) ;
//   3. sinon la ville saisie (ou écrite dans l'adresse), mise en forme.
// '' = impossible à classer (« Sans ville »).
export function villeAuto(c: Locatable, custom: VilleDef[] = [], existing: string[] = []): string {
  const postal = extractPostal(c.postal_code, true) ?? extractPostal(c.address) ?? extractPostal(c.city)
  const typed = cleanCity(c.city) || cityFromAddress(c.address)
  if (postal) {
    const own = prefixMatches(postal, custom)
    if (own.length) return own[0].name
    const refs = prefixMatches(postal, VILLES_REFERENCE)
    if (refs.length) {
      const k = cityKey(typed)
      return (refs.find((r) => keysOf(r).includes(k)) ?? refs[0]).name
    }
  }
  return typed ? canonicalCity(typed, custom, existing) : ''
}

// Préfixes connus d'une ville de référence (pré-remplissage de « + Ville »).
export function referencePrefixes(name: string): string[] {
  const k = cityKey(name)
  return VILLES_REFERENCE.filter((r) => keysOf(r).includes(k)).flatMap((r) => r.prefixes)
}

// « J4L, j4m 1a1 ; J4N » → ['J4L', 'J4M1A1', 'J4N'] — invalides ignorés.
export function parsePrefixes(text: string): string[] {
  const out: string[] = []
  for (const piece of text.toUpperCase().split(/[,;\n]+/)) {
    const tokens = /^\s*[A-Z]\d[A-Z]\s+\d[A-Z]\d\s*$/.test(piece) ? [piece] : piece.split(/\s+/)
    for (const tok of tokens) {
      const t = tok.replace(/[^A-Z0-9]/g, '')
      if (/^[A-Z]\d[A-Z](\d([A-Z]\d?)?)?$/.test(t) && !out.includes(t)) out.push(t)
    }
  }
  return out
}

// Tri des villes : alphabétique, « Sans ville » en dernier.
export function compareVilles(a: string, b: string): number {
  if (!a !== !b) return a ? -1 : 1
  return a.localeCompare(b, 'fr', { sensitivity: 'base' })
}

// ------------------------------------------------------------
// Journées : « Longueuil #1 »
// ------------------------------------------------------------

export const runLabel = (ville: string, journee: number): string => `${villeLabel(ville)} #${journee}`

export function parseRunLabel(label: string | null | undefined): { ville: string; journee: number } | null {
  const m = /^(.*\S)\s+#(\d+)$/.exec((label ?? '').trim())
  if (!m) return null
  return { ville: m[1] === SANS_VILLE ? '' : m[1], journee: Number(m[2]) }
}

// 25 clients en 3 journées → [9, 8, 8] (les premières journées prennent le reste).
export function splitSizes(count: number, days: number): number[] {
  const d = Math.max(1, Math.min(Math.floor(days) || 1, Math.max(count, 1)))
  const base = Math.floor(count / d)
  const extra = count % d
  return Array.from({ length: d }, (_, i) => base + (i < extra ? 1 : 0))
}

// Positions à redistribuer dans un nouvel ordre : les mêmes valeurs, triées,
// rendues strictement croissantes (deux clients créés en même temps peuvent
// partager une position).
export function reassignSlots(positions: number[]): number[] {
  const slots = [...positions].sort((a, b) => a - b)
  for (let i = 1; i < slots.length; i++) if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 1
  return slots
}

// ------------------------------------------------------------
// Adresse complète (Google) et liens Maps
// ------------------------------------------------------------

// « 123 rue Principale » + Longueuil + J4K1A1 → « 123 rue Principale, Longueuil, QC J4K 1A1, Canada ».
// `ville` (groupe de la run) complète la ville quand la fiche n'en a pas et
// qu'il s'agit d'une vraie ville de référence. '' = rien à géocoder.
export function fullClientAddress(c: Locatable, ville = ''): string {
  let a = (c.address ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').replace(/[,\s]+$/, '').trim()
  if (!a) return ''
  const city = cleanCity(c.city) || (VILLES_REFERENCE.some((r) => r.name === ville) ? ville : '')
  const tail = cityKey(a.split(',').slice(1).join(' ')) // la ville, si l'adresse la porte déjà
  if (city && !tail.includes(cityKey(city))) a += `, ${city}`
  if (!/(^|[\s,])(qc|quebec)(?=[\s,]|$)/i.test(deburr(a))) a += ', QC'
  const postal = extractPostal(c.postal_code)
  if (postal && !extractPostal(a)) a += ` ${formatPostal(postal)}`
  if (!/canada/i.test(a)) a += ', Canada'
  return a
}

// Itinéraire Google Maps vers le client. `navigate` : lance la navigation
// (bouton « Prochain client »), comme nextStopUrl de la run de gazon.
export function directionsUrl(c: Locatable, ville = '', navigate = false): string | null {
  const dest = fullClientAddress(c, ville)
  if (!dest) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}` +
    (navigate ? '&travelmode=driving&dir_action=navigate' : '')
}
