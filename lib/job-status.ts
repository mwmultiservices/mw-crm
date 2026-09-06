// ============================================================
// Statuts d'une job du calendrier — SOURCE UNIQUE (libellés + couleurs).
// Demande client : confirmée (jaune) · dispo (mauve) · pending (orange) · done (vert).
// `scheduled` (valeur historique, défaut SQL de la colonne) est traité comme
// « confirmée » : aucune migration de données nécessaire.
// ============================================================

export type JobStatus = 'confirmed' | 'pending' | 'dispo' | 'done' | 'canceled'

export interface JobStatusMeta {
  id: JobStatus
  label: string  // menu déroulant
  short: string  // pastille sur la carte du calendrier
  color: string  // couleur pleine (bordure + pastille)
  bg: string     // fond pâle de la carte
  text: string   // texte sur fond pâle
}

export const JOB_STATUSES: JobStatusMeta[] = [
  { id: 'confirmed', label: '🟡 Job confirmée',        short: 'CONFIRMÉE', color: '#EAB308', bg: '#FEFCE8', text: '#854D0E' },
  { id: 'pending',   label: '🟠 Job pending',          short: 'PENDING',   color: '#F97316', bg: '#FFF7ED', text: '#9A3412' },
  { id: 'dispo',     label: '🟣 Job dispo (à vendre)', short: 'DISPO',     color: '#8B5CF6', bg: '#F5F3FF', text: '#6D28D9' },
  { id: 'done',      label: '🟢 Job done',             short: 'DONE',      color: '#10B981', bg: '#ECFDF5', text: '#065F46' },
  { id: 'canceled',  label: '⚪️ Annulée',              short: 'ANNULÉE',   color: '#9CA3AF', bg: '#F9FAFB', text: '#6B7280' },
]

export const JOB_STATUS_BY_ID = Object.fromEntries(
  JOB_STATUSES.map((s) => [s.id, s]),
) as Record<JobStatus, JobStatusMeta>

// Statut d'une job qu'on vient de céduler.
export const DEFAULT_JOB_STATUS: JobStatus = 'confirmed'

// Anciennes valeurs en base → statut courant.
const LEGACY: Record<string, JobStatus> = { scheduled: 'confirmed', cedule: 'confirmed' }

export function normalizeJobStatus(raw: string | null | undefined): JobStatus {
  const v = (raw ?? '').trim().toLowerCase()
  if (v in JOB_STATUS_BY_ID) return v as JobStatus
  return LEGACY[v] ?? DEFAULT_JOB_STATUS
}

export function jobStatusMeta(raw: string | null | undefined): JobStatusMeta {
  return JOB_STATUS_BY_ID[normalizeJobStatus(raw)]
}
