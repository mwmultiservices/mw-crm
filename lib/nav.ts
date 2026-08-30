// Navigation unifiée par rôle (admin | lead | rep | tech | terrain)
// Sidebar desktop = NAV_BY_ROLE (sections). Bottom-nav mobile = mobileNavForRole()
// (aplatit NAV_BY_ROLE, dédupliqué par href) — même source, même ordre que le desktop,
// le bottom-nav défile horizontalement s'il y a plus d'items que l'écran n'en affiche.
import {
  Home, Map, BarChart2, KanbanSquare, CalendarDays,
  Users, FileText, Wallet, Clock, Database, User, Sprout,
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
  calPays:    { href: '/calendrier/paysagement',  label: 'Paysagement',  Icon: CalendarDays as IconType },
  // vue employé : le calendrier n'est que SON horaire (cf. CalendarView / groupByTeam)
  horaireFen: { href: '/calendrier/fenetres',     label: 'Horaire',      Icon: CalendarDays as IconType },
  horairePays:{ href: '/calendrier/paysagement',  label: 'Horaire',      Icon: CalendarDays as IconType },
  gazon:      { href: '/gazon',                   label: 'Run gazon',    Icon: Sprout as IconType },
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
    { title: 'Planification',   items: [I.calFen, I.calPays, I.gazon] },
    { title: 'Finance',         items: [I.soumissions, I.payes] },
    { title: 'Compte',          items: [I.profil] },
  ],
  lead: [
    { title: 'Principal',     items: [I.accueil, I.carte, I.dashboard] },
    { title: 'Ventes',        items: [I.pipeline, I.clients] },
    { title: 'Planification', items: [I.calFen, I.calPays, I.gazon] },
    // pointage : la grille 2026 donne aussi des taux horaires au directeur
    { title: 'Finance',       items: [I.soumissions, I.payesPerso, I.pointage] },
    { title: 'Compte',        items: [I.profil] },
  ],
  rep: [
    { title: 'Terrain',   items: [I.carte, I.dashboard] },
    { title: 'Mes ventes',items: [I.pipeline, I.soumissions] },
    { title: 'Finance',   items: [I.payesPerso] },
    { title: 'Compte',    items: [I.profil] },
  ],
  // pointage : un laveur de vitres a DEUX taux horaires (paysagement 20 $/h,
  // commercial/copro 22 $/h) en plus de ses % — il doit pouvoir puncher.
  tech: [
    { title: 'Mon espace', items: [I.horaireFen, I.pointage, I.pipeline, I.soumissions] },
    { title: 'Finance',    items: [I.payesPerso] },
    { title: 'Compte',     items: [I.profil] },
  ],
  // pas de /gazon : l'employé ouvre SA run depuis son job au calendrier
  // (« Démarrer la job » → /gazon?route=…), il ne voit pas les autres routes.
  terrain: [
    { title: 'Mon espace', items: [I.pointage, I.horairePays] },
    { title: 'Finance',    items: [I.payesPerso] },
    { title: 'Compte',     items: [I.profil] },
  ],
}

// Items supplémentaires si capacité secondaire paysagement (ex. rep + terrain)
export const TERRAIN_EXTRA: NavSection = {
  title: 'Paysagement',
  items: [I.pointage, I.horairePays],
}

// Items du bottom-nav mobile pour un rôle : tout ce que ce rôle voit dans la
// sidebar desktop (secondary_role inclus), aplatis et dédupliqués par href.
// Pas de plafond à 5 — le bottom-nav défile horizontalement au besoin (cf. .mw-bottomnav).
export function mobileNavForRole(role: string, secondaryRole?: string | null): NavItem[] {
  const sections = navForRole(role, secondaryRole)
  const seen = new Set<string>()
  const items: NavItem[] = []
  for (const section of sections) {
    for (const item of section.items) {
      if (seen.has(item.href)) continue
      seen.add(item.href)
      items.push(item)
    }
  }
  return items
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
