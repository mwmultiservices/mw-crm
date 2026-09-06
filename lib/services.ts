// ============================================================
// Catalogues de services (menus déroulants du calendrier).
// >>> Ajouter / renommer un service ICI <<<
//
// Deux catalogues :
//   - WINDOW_SERVICES  : lavage de vitres (calendrier Fenêtres + upsells)
//   - PROJECT_SERVICES : projets de paysagement (calendrier Paysagement)
//
// On stocke le LABEL (et non l'id) dans jobs.service / job_upsells.service :
//   - les anciennes valeurs saisies à la main restent lisibles ;
//   - le texte part tel quel dans les SMS, QuickBooks et les rapports.
//
// PLUSIEURS services par job : les libellés sont joints par SERVICE_SEP
// (« Lavage de vitres extérieur + Nettoyage de gouttières »). Aucun libellé
// ne contient « + », donc la valeur se relit sans ambiguïté — et reste du
// texte propre pour QuickBooks. Pas de migration : jobs.service reste TEXT.
//
// IMPORTANT : les helpers prennent un CATALOGUE. Une job de fenêtres ne doit
// pas « reconnaître » un service de paysagement (il n'est pas dans son menu
// déroulant : le libellé serait coché sans être affiché, puis perdu au save).
// ============================================================
import type { PayMode } from './payes'

export interface ServiceOption {
  id: string
  label: string
  short: string
  /** Mode de paye quand c'est LE service de la job (équipe de 2 ; le solo
   *  reste prioritaire, cf. autoPayMode dans lib/payes.ts).
   *  Absent pour les projets de paysagement : ils sont payés à l'heure. */
  payMode?: Extract<PayMode, 'ext_equipe' | 'int_ext_equipe'>
}

export const WINDOW_SERVICES: ServiceOption[] = [
  { id: 'vitres_ext',     label: 'Lavage de vitres extérieur',              short: 'Vitres ext.',     payMode: 'ext_equipe' },
  { id: 'vitres_int_ext', label: 'Lavage de vitres intérieur / extérieur',  short: 'Vitres int/ext',  payMode: 'int_ext_equipe' },
  { id: 'gouttieres',     label: 'Nettoyage de gouttières',                 short: 'Gouttières',      payMode: 'ext_equipe' },
]

// Projets de paysagement — payés à l'heure (aucun payMode).
export const PROJECT_SERVICES: ServiceOption[] = [
  { id: 'pave_niveau',    label: 'Mise à niveau de pavé',        short: 'Niveau pavé' },
  { id: 'pave_pose',      label: 'Pose de pavé',                 short: 'Pose pavé' },
  { id: 'haies',          label: 'Taillage de haies',            short: 'Haies' },
  { id: 'plate_bandes',   label: 'Plate-bandes',                 short: 'Plate-bandes' },
  { id: 'paillis',        label: 'Paillis',                      short: 'Paillis' },
  { id: 'plantation',     label: 'Plantation',                   short: 'Plantation' },
  { id: 'tourbe',         label: 'Pose de tourbe',               short: 'Tourbe' },
  { id: 'nettoyage',      label: 'Nettoyage de terrain',         short: 'Nettoyage' },
]

// Les upsells vendus sur le chantier piochent dans le catalogue des vitres.
export const UPSELL_SERVICES: ServiceOption[] = WINDOW_SERVICES

// Tous catalogues confondus — pour l'AFFICHAGE seulement (carte du calendrier),
// où le libellé doit être raccourci quel que soit le type de la job.
export const ALL_SERVICES: ServiceOption[] = [...WINDOW_SERVICES, ...PROJECT_SERVICES]

/** Catalogue du menu déroulant selon le type de job (gazon = pas de service). */
export function serviceCatalogFor(type: string | null | undefined): ServiceOption[] {
  if (type === 'fenetre') return WINDOW_SERVICES
  if (type === 'projet') return PROJECT_SERVICES
  return []
}

/** Séparateur des services multiples dans jobs.service. */
export const SERVICE_SEP = ' + '

/** Retrouve un service par son libellé exact (valeur stockée en DB). */
export function serviceByLabel(
  label: string | null | undefined,
  catalog: ServiceOption[] = WINDOW_SERVICES,
): ServiceOption | null {
  if (!label) return null
  const l = label.trim().toLowerCase()
  return catalog.find((s) => s.label.toLowerCase() === l) ?? null
}

/** Découpe une valeur DB en morceaux de texte (catalogue ou saisie libre). */
export function splitServiceValue(value: string | null | undefined): string[] {
  if (!value) return []
  return value.split('+').map((s) => s.trim()).filter(Boolean)
}

/** Les services du CATALOGUE présents dans une valeur DB. */
export function servicesFromValue(
  value: string | null | undefined,
  catalog: ServiceOption[] = WINDOW_SERVICES,
): ServiceOption[] {
  const out: ServiceOption[] = []
  for (const part of splitServiceValue(value)) {
    const s = serviceByLabel(part, catalog)
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

/** Les morceaux HORS catalogue (ancienne saisie libre, « Autre service »). */
export function freeServiceText(
  value: string | null | undefined,
  catalog: ServiceOption[] = WINDOW_SERVICES,
): string {
  return splitServiceValue(value).filter((p) => !serviceByLabel(p, catalog)).join(SERVICE_SEP)
}

/** Recompose la valeur stockée : services cochés + texte libre éventuel. */
export function joinServiceValue(labels: string[], free?: string): string {
  const parts = [...labels]
  const extra = (free ?? '').trim()
  if (extra) parts.push(extra)
  return parts.filter(Boolean).join(SERVICE_SEP)
}

/** Libellé court pour la carte du calendrier (« Vitres ext. + Gouttières »). */
export function serviceShortLabel(value: string | null | undefined): string {
  const known = servicesFromValue(value, ALL_SERVICES)
  const free = freeServiceText(value, ALL_SERVICES)
  const parts = known.map((s) => s.short)
  if (free) parts.push(free)
  return parts.join(SERVICE_SEP) || (value ?? '')
}

/**
 * Mode de paye déduit des services d'une job de VITRES (équipe de 2).
 * Plusieurs services → le plus payant l'emporte : dès qu'un intérieur/extérieur
 * est inclus, l'équipe est payée au taux int/ext.
 */
export function payModeForServiceValue(
  value: string | null | undefined,
): Extract<PayMode, 'ext_equipe' | 'int_ext_equipe'> | null {
  const list = servicesFromValue(value, WINDOW_SERVICES)
  if (list.length === 0) return null
  return list.some((s) => s.payMode === 'int_ext_equipe') ? 'int_ext_equipe' : 'ext_equipe'
}

export const SERVICE_LABELS = WINDOW_SERVICES.map((s) => s.label)
