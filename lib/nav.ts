// Navigation unifiée par rôle (admin | lead | rep | tech | terrain)
// NAV_BY_ROLE (sections) alimente À LA FOIS la sidebar du bureau et le menu ☰
// du téléphone/de la tablette (app/(app)/layout.tsx) — même source, même ordre.
import {
  Home, Map, BarChart2, KanbanSquare, CalendarDays,
  Users, FileText, Wallet, Clock, User, Sprout, Leaf,
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
  calFen:     { href: '/calendrier/fenetres',     label: 'Fenêtres',     Icon: CalendarDays as IconType },
  calPays:    { href: '/calendrier/paysagement',  label: 'Paysagement',  Icon: CalendarDays as IconType },
  // vue employé : le calendrier n'est que SON horaire (cf. CalendarView / groupByTeam)
  horaireFen: { href: '/calendrier/fenetres',     label: 'Horaire',      Icon: CalendarDays as IconType },
  horairePays:{ href: '/calendrier/paysagement',  label: 'Horaire',      Icon: CalendarDays as IconType },
  gazon:      { href: '/gazon',                   label: 'Run gazon',    Icon: Sprout as IconType },
  fermeture:  { href: '/fermeture',               label: 'Run fermeture', Icon: Leaf as IconType },
  soumissions:{ href: '/soumissions',             label: 'Soumissions',  Icon: FileText as IconType },
  payes:      { href: '/payes',                   label: 'Payes',        Icon: Wallet as IconType },
  payesPerso: { href: '/payes',                   label: 'Mes payes',    Icon: Wallet as IconType },
  pointage:   { href: '/pointage',                label: 'Pointage',     Icon: Clock as IconType },
  profil:     { href: '/profil',                  label: 'Profil',       Icon: User as IconType },
} satisfies Record<string, NavItem>

export const NAV_BY_ROLE: Record<string, NavSection[]> = {
  admin: [
    { title: 'Tableau de bord', items: [I.accueil, I.carte, I.dashboard] },
    // « Base D2D » retirée (demande client 2026-09-28) : on cherche un nom
    // directement dans le Pipeline (barre de recherche en haut).
    { title: 'Ventes',          items: [I.pipeline, I.clients] },
    { title: 'Planification',   items: [I.calFen, I.calPays, I.gazon, I.fermeture] },
    { title: 'Finance',         items: [I.soumissions, I.payes] },
    { title: 'Compte',          items: [I.profil] },
  ],
  lead: [
    { title: 'Principal',     items: [I.accueil, I.carte, I.dashboard] },
    { title: 'Ventes',        items: [I.pipeline, I.clients] },
    { title: 'Planification', items: [I.calFen, I.calPays, I.gazon, I.fermeture] },
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
  // pas de /gazon ni /fermeture : l'employé ouvre SA run depuis son job au
  // calendrier (« Démarrer la job » → /gazon?route=… ou /fermeture?run=…).
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
