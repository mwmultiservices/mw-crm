'use client'
import Image from 'next/image'

export default function AppHeader() {
  return (
    <header style={{
      height: 52,
      width: '100%',
      background: '#000',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 16px',
      flexShrink: 0,
    }}>
      <Image
        src="/logo-mw.svg"
        alt="MW Multiservices"
        width={112}
        height={34}
        priority
        style={{ display: 'block', filter: 'brightness(0) invert(1)' }}
      />
    </header>
  )
}
