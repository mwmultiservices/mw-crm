// ============================================================
// Pipeline — source unique des stages des leads (Phase 3).
// IDs en anglais (stockés en DB : leads.stage), libellés FR.
// Aligné avec : le défaut DB 'new', le trigger D2D ('won'), l'Accueil.
// ============================================================

export interface Stage {
  id: string
  label: string
  color: string
}

export const STAGES: Stage[] = [
  { id: 'new',        label: 'Nouveau',            color: '#69C9CA' },
  { id: 'contacted',  label: 'Contacté',           color: '#94A3B8' },
  { id: 'interested', label: 'Intéressé',          color: '#F59E0B' },
  { id: 'quoted',     label: 'Soumission envoyée', color: '#3AAFB0' },
  { id: 'scheduled',  label: 'Rendez-vous',        color: '#8B5CF6' },
  { id: 'won',        label: 'Gagné',              color: '#22C55E' },
  { id: 'lost',       label: 'Perdu',              color: '#EF4444' },
]

export const STAGE_IDS = STAGES.map((s) => s.id)
export const STAGE_LABELS: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.id, s.label]))
export const STAGE_COLORS: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.id, s.color]))

export function stageLabel(id: string | null | undefined): string {
  return STAGE_LABELS[id ?? ''] ?? id ?? '—'
}
export function stageColor(id: string | null | undefined): string {
  return STAGE_COLORS[id ?? ''] ?? '#94A3B8'
}

export interface Lead {
  id: string
  name: string
  phone: string | null
  email: string | null
  source: string | null
  service: string | null
  service_category: string | null
  stage: string
  rep_id: string | null
  price: number | null
  notes: string | null
  needs_follow_up?: boolean | null
  created_at: string
}

export interface PipelineColumn extends Stage {
  leads: Lead[]
  total: number
}

// Regroupe une liste de leads en colonnes (une par stage, dans l'ordre).
export function leadsToColumns(leads: Lead[]): PipelineColumn[] {
  return STAGES.map((s) => {
    const colLeads = leads.filter((l) => (l.stage || 'new') === s.id)
    return {
      ...s,
      leads: colLeads,
      total: colLeads.reduce((sum, l) => sum + (Number(l.price) || 0), 0),
    }
  })
}

// Libellés des sources de leads (pour badges).
export const SOURCE_LABELS: Record<string, string> = {
  site_web: 'Site web',
  meta_ads: 'Meta',
  google_ads: 'Google',
  flyers: 'Flyers',
  d2d: 'Porte-à-porte',
  reference: 'Référence',
}
export function sourceLabel(id: string | null | undefined): string {
  return SOURCE_LABELS[id ?? ''] ?? (id || '—')
}
