// Modèle de rôles unifié (CRM + porte-à-porte)
// admin | lead | rep | tech | terrain
// Les valeurs legacy 'manager'/'vendeur' restent tolérées pendant la transition.

export type Role = 'admin' | 'lead' | 'rep' | 'tech' | 'terrain'

// Rôles avec droits de gestion (supervision pipeline/terrain, accès Base, coaching IA).
export const MANAGER_ROLES = ['admin', 'lead', 'manager'] as const

// Rôles "vendeur terrain" (cognent des portes, ont des objectifs portes/ventes).
export const SELLER_ROLES = ['rep', 'vendeur'] as const

export const isManager = (role?: string | null): boolean =>
  !!role && (MANAGER_ROLES as readonly string[]).includes(role)

export const isSeller = (role?: string | null): boolean =>
  !!role && (SELLER_ROLES as readonly string[]).includes(role)

// Libellés FR des rôles (UI). Les valeurs legacy sont affichées mais pas proposées à la sélection.
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  lead: "Chef d'équipe",
  rep: 'Vendeur',
  tech: 'Technicien (fenêtres)',
  terrain: 'Terrain (paysagement)',
  // legacy
  manager: 'Administrateur',
  vendeur: 'Vendeur',
}

// Rôles assignables depuis l'interface de gestion d'équipe (ordre = hiérarchie).
export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: ROLE_LABELS.admin },
  { value: 'lead', label: ROLE_LABELS.lead },
  { value: 'rep', label: ROLE_LABELS.rep },
  { value: 'tech', label: ROLE_LABELS.tech },
  { value: 'terrain', label: ROLE_LABELS.terrain },
]

export const roleLabel = (role?: string | null): string =>
  (role && ROLE_LABELS[role]) || role || 'vendeur'
