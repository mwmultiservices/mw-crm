// ============================================================
// Catalogue des services de lavage de vitres.
// >>> Ajouter / renommer un service ICI <<<
//
// Sert à DEUX endroits :
//   1. le menu déroulant « Service » du calendrier Fenêtres (JobModal)
//   2. le menu déroulant des upsells vendus pendant une job (JobUpsells)
//
// On stocke le LABEL (et non l'id) dans jobs.service / job_upsells.service :
//   - les anciennes valeurs saisies à la main restent lisibles ;
//   - le texte part tel quel dans les SMS, QuickBooks et les rapports.
//
// PLUSIEURS services par job : les libellés sont joints par SERVICE_SEP
// (« Lavage de vitres extérieur + Nettoyage de gouttières »). Aucun libellé
// ne contient « + », donc la valeur se relit sans ambiguïté — et reste du
// texte propre pour QuickBooks. Pas de migration : jobs.service reste TEXT.
// ============================================================
import type { PayMode } from './payes'

export interface ServiceOption {
  id: string
  label: string
  short: string
  /** Mode de paye quand c'est LE service de la job (équipe de 2 ; le solo
   *  reste prioritaire, cf. autoPayMode dans lib/payes.ts). */
  payMode: Extract<PayMode, 'ext_equipe' | 'int_ext_equipe'>
}

export const WINDOW_SERVICES: ServiceOption[] = [
  { id: 'vitres_ext',     label: 'Lavage de vitres extérieur',              short: 'Vitres ext.',     payMode: 'ext_equipe' },
  { id: 'vitres_int_ext', label: 'Lavage de vitres intérieur / extérieur',  short: 'Vitres int/ext',  payMode: 'int_ext_equipe' },
  { id: 'gouttieres',     label: 'Nettoyage de gouttières',                 short: 'Gouttières',      payMode: 'ext_equipe' },
]

// Les upsells vendus sur le chantier piochent dans le même catalogue.
export const UPSELL_SERVICES: ServiceOption[] = WINDOW_SERVICES

/** Séparateur des services multiples dans jobs.service. */
export const SERVICE_SEP = ' + '

/** Retrouve un service par son libellé exact (valeur stockée en DB). */
export function serviceByLabel(label: string | null | undefined): ServiceOption | null {
  if (!label) return null
  const l = label.trim().toLowerCase()
  return WINDOW_SERVICES.find((s) => s.label.toLowerCase() === l) ?? null
}

/** Découpe une valeur DB en morceaux de texte (catalogue ou saisie libre). */
export function splitServiceValue(value: string | null | undefined): string[] {
  if (!value) return []
  return value.split('+').map((s) => s.trim()).filter(Boolean)
}

/** Les services du CATALOGUE présents dans une valeur DB. */
export function servicesFromValue(value: string | null | undefined): ServiceOption[] {
  const out: ServiceOption[] = []
  for (const part of splitServiceValue(value)) {
    const s = serviceByLabel(part)
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

/** Les morceaux HORS catalogue (ancienne saisie libre, « Autre service »). */
export function freeServiceText(value: string | null | undefined): string {
  return splitServiceValue(value).filter((p) => !serviceByLabel(p)).join(SERVICE_SEP)
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
  const known = servicesFromValue(value)
  const free = freeServiceText(value)
  const parts = known.map((s) => s.short)
  if (free) parts.push(free)
  return parts.join(SERVICE_SEP) || (value ?? '')
}

/**
 * Mode de paye déduit des services d'une job (équipe de 2).
 * Plusieurs services → le plus payant l'emporte : dès qu'un intérieur/extérieur
 * est inclus, l'équipe est payée au taux int/ext.
 */
export function payModeForServiceValue(
  value: string | null | undefined,
): Extract<PayMode, 'ext_equipe' | 'int_ext_equipe'> | null {
  const list = servicesFromValue(value)
  if (list.length === 0) return null
  return list.some((s) => s.payMode === 'int_ext_equipe') ? 'int_ext_equipe' : 'ext_equipe'
}

export const SERVICE_LABELS = WINDOW_SERVICES.map((s) => s.label)
