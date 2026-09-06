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

/** Retrouve un service par son libellé exact (valeur stockée en DB). */
export function serviceByLabel(label: string | null | undefined): ServiceOption | null {
  if (!label) return null
  const l = label.trim().toLowerCase()
  return WINDOW_SERVICES.find((s) => s.label.toLowerCase() === l) ?? null
}

export const SERVICE_LABELS = WINDOW_SERVICES.map((s) => s.label)
