'use client'
import Image from 'next/image'

export default function AppHeader() {
  return (
    <header style={{
      height: 56,
      background: '#FFFFFF',
      borderBottom: '1px solid #E5E7EB',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 16px',
      flexShrink: 0,
      zIndex: 100,
    }}>
      <Image
        src="/logo-mw.svg"
        alt="MW Multiservices"
        width={120}
        height={36}
        priority
        style={{ display: 'block' }}
      />
    </header>
  )
}
