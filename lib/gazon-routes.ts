// ============================================================
// Routes de gazon — source unique (décision client, 2026-08-13).
// 4 routes qui regroupent les secteurs importés du fichier du client
// (gazon_terrains.secteur). Le calendrier stocke l'`id` de la route dans
// jobs.route_name ; la page /gazon peut être verrouillée sur une route
// via ?route=<id> (l'employé ne voit QUE sa route).
// ============================================================

// Shop MW Multiservices — point d'ARRIVÉE de tous les itinéraires de gazon.
// Vit ici (module sans dépendance) pour être utilisable côté serveur aussi.
export const SHOP_ADDRESS = '6350 Ch. de la Savane, Saint-Hubert, QC J3Y 0Z9'

export interface GazonRoute {
  id: string
  label: string
  secteurs: string[] // valeurs telles qu'importées dans gazon_terrains.secteur
}

export const GAZON_ROUTES: GazonRoute[] = [
  { id: 'st-lambert-vieux-longueuil', label: 'St-Lambert / Vieux-Longueuil', secteurs: ['ST-LAMBERT', 'VIEUX LONGUEUIL'] },
  { id: 'longueuil',                  label: 'Longueuil',                    secteurs: ['LONGUEUIL'] },
  { id: 'st-bruno-st-hubert-carignan',label: 'Saint-Bruno / Saint-Hubert / Carignan', secteurs: ['SAINT-HUBERT', 'CARIGNAN/ST-BRUNO'] },
  { id: 'boucherville',               label: 'Boucherville',                 secteurs: ['BOUCHERVILLE'] },
]

const norm = (s: string) => s.trim().toUpperCase()

// Retrouve une route par id, par libellé ou par nom de secteur.
// Tolère les anciennes valeurs texte libre de jobs.route_name.
export function findRoute(value: string | null | undefined): GazonRoute | null {
  if (!value) return null
  const v = norm(value)
  return (
    GAZON_ROUTES.find((r) => norm(r.id) === v) ??
    GAZON_ROUTES.find((r) => norm(r.label) === v) ??
    GAZON_ROUTES.find((r) => r.secteurs.some((s) => norm(s) === v)) ??
    null
  )
}

// Libellé affichable : la route si reconnue, sinon la valeur brute.
export function routeLabel(value: string | null | undefined): string {
  return findRoute(value)?.label ?? (value ?? '')
}

// Route à laquelle appartient un secteur (null si secteur ajouté à la main).
export function routeOfSecteur(secteur: string): GazonRoute | null {
  const s = norm(secteur)
  return GAZON_ROUTES.find((r) => r.secteurs.some((x) => norm(x) === s)) ?? null
}

// Clé de regroupement d'un terrain : la route si connue, sinon son secteur brut.
export function groupKeyOfSecteur(secteur: string): string {
  return routeOfSecteur(secteur)?.id ?? secteur
}

// ============================================================
// Normalisation des adresses de terrains.
//
// Les adresses importées du fichier du client sont partielles (« 1665 av
// Victoria », sans ville ni province) et parfois bruitées (« 2855 Rue Gélineau
// (FACTURE) », plages de numéros « 3101-3133-3201 rue du granit »). Google les
// géocode alors n'importe où sur la planète — et UNE seule adresse irrésoluble
// fait échouer TOUT l'appel d'optimisation. On complète donc la ville à partir
// du secteur avant tout envoi à Google (optimisation ET liens Maps).
// ============================================================

// Ville à ajouter quand l'adresse n'en contient aucune. Chaîne vide = secteur
// qui couvre plusieurs villes : on ne devine pas (l'adresse doit la porter).
export const CITY_BY_SECTEUR: Record<string, string> = {
  'ST-LAMBERT': 'Saint-Lambert',
  'VIEUX LONGUEUIL': 'Longueuil',
  'LONGUEUIL': 'Longueuil',
  'SAINT-HUBERT': 'Saint-Hubert',
  'CARIGNAN/ST-BRUNO': '',
  'BOUCHERVILLE': 'Boucherville',
}

// Villes reconnues comme « déjà présentes » dans une adresse saisie à la main.
const KNOWN_CITIES = [
  'saint-lambert', 'st-lambert', 'longueuil', 'saint-hubert', 'st-hubert',
  'boucherville', 'carignan', 'saint-bruno', 'st-bruno', 'montarville',
]

const deburr = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Adresse complète et géocodable d'un terrain. Retourne '' si rien à géocoder.
export function fullTerrainAddress(
  address: string | null | undefined,
  secteur: string | null | undefined,
): string {
  let a = (address ?? '').trim()
  if (!a) return ''
  a = a.replace(/\([^)]*\)/g, ' ')                 // « (FACTURE) », « (bloc) »…
  a = a.replace(/\s+/g, ' ').replace(/[,\s]+$/, '').trim()
  a = a.replace(/^(\d+)(?:\s*-\s*\d+)+\b/, '$1')   // « 3101-3133-3201 rue X » → « 3101 rue X »
  if (!a) return ''

  const flat = deburr(a)
  const city = CITY_BY_SECTEUR[(secteur ?? '').trim().toUpperCase()] ?? ''
  if (city && !KNOWN_CITIES.some((c) => flat.includes(c))) a += `, ${city}`
  if (!/\b(qc|quebec|québec)\b/i.test(a)) a += ', QC'
  if (!/canada/i.test(a)) a += ', Canada'
  return a
}
