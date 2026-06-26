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
