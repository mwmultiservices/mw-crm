// ============================================================
// Routes de gazon — source unique (décision client, 2026-08-13).
// 4 routes qui regroupent les secteurs importés du fichier du client
// (gazon_terrains.secteur). Le calendrier stocke l'`id` de la route dans
// jobs.route_name ; la page /gazon peut être verrouillée sur une route
// via ?route=<id> (l'employé ne voit QUE sa route).
// ============================================================

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
