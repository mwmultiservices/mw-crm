'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import { LogOut } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import { navForRole, MOBILE_NAV_BY_ROLE, type NavItem } from '@/lib/nav'
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

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading || !profile) return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(160deg, #000 0%, #0D1F1F 100%)',
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

  const sections   = navForRole(profile.role, profile.secondary_role)
  const mobileItems = MOBILE_NAV_BY_ROLE[profile.role] ?? MOBILE_NAV_BY_ROLE.rep
  const initials = (profile.full_name ?? '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()

  const navLinkDesktop = (item: NavItem) => {
    const active = isActive(pathname, item.href)
    const { Icon } = item
    return (
      <Link key={item.href + item.label} href={item.href} style={{
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

  return (
    <div className="mw-shell">
      {/* ───────── Sidebar (desktop) ───────── */}
      <aside className="mw-sidebar">
        <div style={{ padding: '20px 18px 14px' }}>
          <Image src="/logo-mw.svg" alt="MW Multiservices" width={132} height={40}
            style={{ filter: 'brightness(0) invert(1)' }} priority />
        </div>
        <nav style={{ flex: 1, padding: '4px 12px 12px' }}>
          {sections.map(section => (
            <div key={section.title} style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: '#4B5563', padding: '0 12px 6px',
              }}>{section.title}</div>
              {section.items.map(navLinkDesktop)}
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
          <button onClick={logout} title="Déconnexion" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#6B7280', display: 'flex', padding: 4,
          }}><LogOut size={17} /></button>
        </div>
      </aside>

      {/* ───────── Main ───────── */}
      <div className="mw-main">
        <div className="mw-header-mobile"><AppHeader /></div>
        <main className="mw-content">{children}</main>

        {/* Bottom-nav (mobile) */}
        <nav className="mw-bottomnav">
          {mobileItems.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href)
            return (
              <Link key={href + label} href={href} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '10px 4px 9px', textDecoration: 'none', gap: 4,
                borderTop: active ? '2px solid #69C9CA' : '2px solid transparent',
              }}>
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <Icon size={21} color={active ? '#69C9CA' : '#4B5563'} strokeWidth={active ? 2.5 : 2} />
                  {href === '/pipeline' && unread > 0 && (
                    <span style={{
                      position: 'absolute', top: -5, right: -9, minWidth: 15, height: 15, borderRadius: 999,
                      background: '#EF4444', color: '#FFF', fontSize: 9, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                    }}>{unread > 99 ? '99+' : unread}</span>
                  )}
                </span>
                <span style={{
                  fontSize: 9.5, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase',
                  color: active ? '#69C9CA' : '#4B5563',
                }}>{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
