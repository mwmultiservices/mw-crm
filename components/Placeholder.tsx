'use client'

export default function Placeholder({ title, phase, desc }: { title: string; phase?: string; desc?: string }) {
  return (
    <div style={{ padding: '28px 24px', fontFamily: 'Inter, sans-serif', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>{title}</h1>
      {phase && (
        <span style={{
          display: 'inline-block', background: '#E8F8F8', color: '#0D6E6F',
          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>{phase}</span>
      )}
      <div style={{
        marginTop: 18, border: '1px dashed #D1D5DB', borderRadius: 14,
        background: '#FFFFFF', padding: '40px 24px', textAlign: 'center',
      }}>
        <p style={{ color: '#374151', fontSize: 15, fontWeight: 600, margin: '0 0 6px' }}>Section en construction</p>
        <p style={{ color: '#6B7280', fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>{desc ?? 'Cette page sera construite dans une phase à venir du plan (ROADMAP.md).'}</p>
      </div>
    </div>
  )
}
