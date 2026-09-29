'use client'
import Image from 'next/image'
import { Menu } from 'lucide-react'
import RefreshButton from '@/components/RefreshButton'

/**
 * En-tête téléphone/tablette : ☰ (menu) à gauche, logo au centre, Rafraîchir
 * à droite. Le menu remplace l'ancien bottom-nav → tout l'écran sous l'en-tête
 * revient au contenu.
 */
export default function AppHeader({ menuOpen, onMenu, badge = 0 }: {
  menuOpen: boolean
  onMenu: () => void
  badge?: number // réponses SMS non lues (la pastille du Pipeline est dans le menu)
}) {
  return (
    <header style={{
      height: 52,
      width: '100%',
      background: '#000',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      display: 'grid',
      gridTemplateColumns: '48px 1fr 48px',
      alignItems: 'center',
      padding: '0 6px',
      flexShrink: 0,
    }}>
      <button onClick={onMenu} aria-label="Menu" aria-expanded={menuOpen} style={{
        position: 'relative', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', borderRadius: 10, cursor: 'pointer', color: '#FFF', padding: 0,
      }}>
        <Menu size={24} strokeWidth={2.2} />
        {badge > 0 && (
          <span style={{
            position: 'absolute', top: 6, right: 4, minWidth: 16, height: 16, borderRadius: 999,
            background: '#EF4444', color: '#FFF', fontSize: 9.5, fontWeight: 700, padding: '0 4px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #000',
          }}>{badge > 99 ? '99+' : badge}</span>
        )}
      </button>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Image
          src="/logo-mw.svg"
          alt="MW Multiservices"
          width={112}
          height={34}
          priority
          style={{ display: 'block', filter: 'brightness(0) invert(1)' }}
        />
      </div>
      <RefreshButton variant="header" />
    </header>
  )
}
