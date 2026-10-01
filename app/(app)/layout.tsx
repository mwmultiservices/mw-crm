'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import { LogOut, X } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import RefreshButton from '@/components/RefreshButton'
import { navForRole, type NavItem } from '@/lib/nav'
import { isManager } from '@/lib/roles'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', lead: 'Lead ventes', rep: 'Rep D2D',
  tech: 'Tech fenêtres', terrain: 'Paysagement',
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<{ role: string; secondary_role: string | null; full_name: string | null; color: string | null } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  // menu ☰ (téléphone/tablette) — remplace l'ancien bottom-nav
  const [menuOpen, setMenuOpen] = useState(false)

  // Verrouille le document pendant toute la durée de vie du shell : plus aucun
  // défilement/rubber-band de la page entière (header et bottom-nav restent figés).
  // Retiré au démontage pour laisser /login et /legal défiler normalement.
  useEffect(() => {
    document.documentElement.classList.add('mw-app-locked')
    document.body.classList.add('mw-app-locked')
    // Pincement iOS : Safari ignore user-scalable=no et touch-action seul ne
    // suffit pas partout → on annule le geste (événement propre à Safari).
    // Sauf sur la carte D2D (Leaflet zoome lui-même, aux touch events).
    const noPinch = (e: Event) => {
      if (!(e.target as Element | null)?.closest?.('.leaflet-container')) e.preventDefault()
    }
    document.addEventListener('gesturestart', noPinch, { passive: false })
    document.addEventListener('gesturechange', noPinch, { passive: false })
    return () => {
      document.documentElement.classList.remove('mw-app-locked')
      document.body.classList.remove('mw-app-locked')
      document.removeEventListener('gesturestart', noPinch)
      document.removeEventListener('gesturechange', noPinch)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)
      const { data } = await supabase
        .from('profiles')
        .select('role, secondary_role, full_name, color')
        .eq('id', session.user.id)
        .single()
      setProfile({
        role: data?.role ?? 'rep',
        secondary_role: data?.secondary_role ?? null,
        full_name: data?.full_name ?? null,
        color: data?.color ?? '#69C9CA',
      })
      setLoading(false)
    })
  }, [router])

  // Pastille « réponses SMS non lues » sur l'item Pipeline (temps réel).
  // Manager = tous les leads ; rep = les siens. Best-effort si la colonne
  // unread_sms n'existe pas encore (migration) → 0.
  useEffect(() => {
    if (!profile || !userId) return
    const refresh = async () => {
      let q = supabase.from('leads').select('id', { count: 'exact', head: true }).eq('unread_sms', true)
      if (!isManager(profile.role)) q = q.eq('rep_id', userId)
      const { count, error } = await q
      setUnread(error ? 0 : count ?? 0)
    }
    refresh()
    const channel = supabase
      .channel('nav-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile, userId])

  // Badge sur l'icône de l'app installée (PWA) — supporté iOS 16.4+/Android
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (unread > 0) nav.setAppBadge?.(unread).catch(() => {})
    else nav.clearAppBadge?.().catch(() => {})
  }, [unread])

  // Échap ferme le menu ☰
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  // iOS : quand le clavier se referme, la vue reste parfois décalée vers le haut
  // (haut de l'app sous la barre d'état, bande vide en bas). Le document est
  // verrouillé (mw-app-locked) et ne doit jamais défiler : dès qu'aucun champ
  // n'a plus le focus, on le recale à 0.
  useEffect(() => {
    const typing = () => !!document.activeElement?.matches(
      'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable="true"]')
    let t: ReturnType<typeof setTimeout> | undefined
    const realign = () => {
      clearTimeout(t)
      t = setTimeout(() => {
        if (!typing() && (window.scrollY !== 0 || window.scrollX !== 0)) window.scrollTo(0, 0)
      }, 150)
    }
    const vv = window.visualViewport
    window.addEventListener('focusout', realign)
    vv?.addEventListener('resize', realign)
    return () => {
      clearTimeout(t)
      window.removeEventListener('focusout', realign)
      vv?.removeEventListener('resize', realign)
    }
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading || !profile) return (
    <div style={{
      height: '100%', minHeight: '100dvh', background: 'linear-gradient(160deg, #000 0%, #0D1F1F 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ textAlign: 'center' }}>
        <Image src="/logo-mw.svg" alt="MW Multiservices" width={140} height={48}
          style={{ filter: 'brightness(0) invert(1)', marginBottom: 28 }} priority />
        <div style={{
          width: 32, height: 32, border: '3px solid rgba(105,201,202,0.2)',
          borderTopColor: '#69C9CA', borderRadius: '50%',
          animation: 'mw-spin 0.8s linear infinite', margin: '0 auto',
        }} />
      </div>
    </div>
  )

  const sections = navForRole(profile.role, profile.secondary_role)
  const initials = (profile.full_name ?? '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()

  const navLink = (item: NavItem) => {
    const active = isActive(pathname, item.href)
    const { Icon } = item
    return (
      <Link key={item.href + item.label} href={item.href} onClick={() => setMenuOpen(false)} style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px',
        borderRadius: 9, textDecoration: 'none', marginBottom: 2,
        background: active ? 'rgba(105,201,202,0.14)' : 'transparent',
        color: active ? '#69C9CA' : '#9CA3AF',
        fontSize: 13.5, fontWeight: active ? 600 : 500,
        transition: 'background 120ms ease, color 120ms ease',
      }}>
        <Icon size={18} color={active ? '#69C9CA' : '#6B7280'} strokeWidth={active ? 2.4 : 2} />
        {item.label}
        {item.href === '/pipeline' && unread > 0 && (
          <span style={{
            marginLeft: 'auto', minWidth: 18, height: 18, borderRadius: 999, background: '#EF4444',
            color: '#FFF', fontSize: 10.5, fontWeight: 700, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', padding: '0 5px',
          }}>{unread > 99 ? '99+' : unread}</span>
        )}
      </Link>
    )
  }

  // Contenu commun à la sidebar (bureau) et au menu ☰ (téléphone/tablette)
  const navBody = (
    <>
      <nav style={{ flex: 1, padding: '4px 12px 12px' }}>
        {sections.map(section => (
          <div key={section.title} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#4B5563', padding: '0 12px 6px',
            }}>{section.title}</div>
            {section.items.map(navLink)}
          </div>
        ))}
      </nav>
      {/* Footer utilisateur */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: profile.color ?? '#69C9CA', color: '#000',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
        }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.full_name}</div>
          <div style={{ fontSize: 10.5, color: '#6B7280' }}>{ROLE_LABEL[profile.role] ?? profile.role}</div>
        </div>
        <button onClick={logout} title="Déconnexion" aria-label="Déconnexion" style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: '#6B7280', display: 'flex', padding: 4,
        }}><LogOut size={17} /></button>
      </div>
    </>
  )

  return (
    <div className="mw-shell">
      {/* ───────── Sidebar (bureau : souris + écran large) ───────── */}
      <aside className="mw-sidebar">
        <div style={{ padding: '20px 18px 14px' }}>
          <Image src="/logo-mw.svg" alt="MW Multiservices" width={132} height={40}
            style={{ filter: 'brightness(0) invert(1)' }} priority />
        </div>
        {navBody}
      </aside>

      {/* ───────── Menu ☰ (téléphone ET tablette) ─────────
          Même contenu que la sidebar ; glisse depuis la gauche. */}
      <div className={`mw-navdrawer-overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />
      <aside className={`mw-navdrawer${menuOpen ? ' open' : ''}`} aria-hidden={!menuOpen}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 10px 14px 18px' }}>
          <Image src="/logo-mw.svg" alt="MW Multiservices" width={120} height={36}
            style={{ filter: 'brightness(0) invert(1)' }} />
          <button onClick={() => setMenuOpen(false)} aria-label="Fermer le menu" style={{
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', borderRadius: 10, color: '#9CA3AF', cursor: 'pointer', padding: 0,
          }}><X size={22} /></button>
        </div>
        {navBody}
      </aside>

      {/* ───────── Main ───────── */}
      <div className="mw-main">
        <div className="mw-header-mobile">
          <AppHeader menuOpen={menuOpen} onMenu={() => setMenuOpen(true)} badge={unread} />
        </div>
        <main className="mw-content">{children}</main>
        <RefreshButton />
      </div>
    </div>
  )
}
