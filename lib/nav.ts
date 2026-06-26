// Navigation unifiée par rôle (admin | lead | rep | tech | terrain)
// Sidebar desktop = NAV_BY_ROLE (sections) ; bottom-nav mobile = MOBILE_NAV_BY_ROLE (max ~5).
import {
  Home, Map, BarChart2, KanbanSquare, CalendarDays, Leaf,
  Users, FileText, Wallet, Clock, Database, User,
} from 'lucide-react'

type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

export interface NavItem {
  href: string
  label: string
  Icon: IconType
}
export interface NavSection {
  title: string
  items: NavItem[]
}

// Items réutilisables
const I = {
  accueil:    { href: '/accueil',                 label: 'Accueil',      Icon: Home as IconType },
  carte:      { href: '/carte',                   label: 'Carte D2D',    Icon: Map as IconType },
  dashboard:  { href: '/dashboard',               label: 'Performance',  Icon: BarChart2 as IconType },
  pipeline:   { href: '/pipeline',                label: 'Pipeline',     Icon: KanbanSquare as IconType },
  clients:    { href: '/clients',                 label: 'Clients',      Icon: Users as IconType },
  baseD2D:    { href: '/base-de-donnees',         label: 'Base D2D',     Icon: Database as IconType },
  calFen:     { href: '/calendrier/fenetres',     label: 'Fenêtres',     Icon: CalendarDays as IconType },
  calPays:    { href: '/calendrier/paysagement',  label: 'Paysagement',  Icon: Leaf as IconType },
  soumissions:{ href: '/soumissions',             label: 'Soumissions',  Icon: FileText as IconType },
  payes:      { href: '/payes',                   label: 'Payes',        Icon: Wallet as IconType },
  payesPerso: { href: '/payes',                   label: 'Mes payes',    Icon: Wallet as IconType },
  pointage:   { href: '/pointage',                label: 'Pointage',     Icon: Clock as IconType },
  profil:     { href: '/profil',                  label: 'Profil',       Icon: User as IconType },
} satisfies Record<string, NavItem>

export const NAV_BY_ROLE: Record<string, NavSection[]> = {
  admin: [
    { title: 'Tableau de bord', items: [I.accueil, I.carte, I.dashboard] },
    { title: 'Ventes',          items: [I.pipeline, I.clients, I.baseD2D] },
    { title: 'Planification',   items: [I.calFen, I.calPays] },
    { title: 'Finance',         items: [I.soumissions, I.payes] },
    { title: 'Compte',          items: [I.profil] },
  ],
  lead: [
    { title: 'Principal',     items: [I.accueil, I.carte, I.dashboard] },
    { title: 'Ventes',        items: [I.pipeline, I.clients] },
    { title: 'Planification', items: [I.calFen, I.calPays] },
    { title: 'Finance',       items: [I.soumissions, I.payesPerso] },
    { title: 'Compte',        items: [I.profil] },
  ],
  rep: [
    { title: 'Terrain',   items: [I.carte, I.dashboard] },
    { title: 'Mes ventes',items: [I.pipeline, I.soumissions] },
    { title: 'Finance',   items: [I.payesPerso] },
    { title: 'Compte',    items: [I.profil] },
  ],
  tech: [
    { title: 'Mon espace', items: [I.calFen, I.pipeline, I.soumissions] },
    { title: 'Finance',    items: [I.payesPerso] },
    { title: 'Compte',     items: [I.profil] },
  ],
  terrain: [
    { title: 'Mon espace', items: [I.pointage, I.calPays] },
    { title: 'Finance',    items: [I.payesPerso] },
    { title: 'Compte',     items: [I.profil] },
  ],
}

// Items supplémentaires si capacité secondaire paysagement (ex. rep + terrain)
export const TERRAIN_EXTRA: NavSection = {
  title: 'Paysagement',
  items: [I.pointage, I.calPays],
}

export const MOBILE_NAV_BY_ROLE: Record<string, NavItem[]> = {
  admin:   [I.accueil, I.pipeline, I.calFen, I.payes, I.profil],
  lead:    [I.accueil, I.pipeline, I.carte, I.calFen, I.profil],
  rep:     [I.carte, I.pipeline, I.dashboard, I.payesPerso, I.profil],
  tech:    [I.calFen, I.pipeline, I.soumissions, I.payesPerso, I.profil],
  terrain: [I.pointage, I.calPays, I.payesPerso, I.profil],
}

// Page d'atterrissage par défaut selon le rôle
export const HOME_BY_ROLE: Record<string, string> = {
  admin: '/accueil',
  lead: '/accueil',
  rep: '/carte',
  tech: '/calendrier/fenetres',
  terrain: '/pointage',
}

export function navForRole(role: string, secondaryRole?: string | null): NavSection[] {
  const base = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.rep
  if (secondaryRole === 'terrain' && role !== 'terrain') {
    // insère la section Paysagement avant "Compte"
    const out = base.filter(s => s.title !== 'Compte')
    const compte = base.find(s => s.title === 'Compte')
    return compte ? [...out, TERRAIN_EXTRA, compte] : [...out, TERRAIN_EXTRA]
  }
  return base
}
