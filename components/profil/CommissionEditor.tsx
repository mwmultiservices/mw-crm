'use client'

interface Props {
  type: 'percent' | 'fixed'
  value: number
  onChange: (type: 'percent' | 'fixed', value: number) => void
}

export default function CommissionEditor({ type, value, onChange }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Toggle type */}
      <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 8, padding: 3 }}>
        {(['percent', 'fixed'] as const).map(t => (
          <button
            key={t}
            onClick={() => onChange(t, value)}
            style={{
              flex: 1,
              padding: '8px 4px',
              borderRadius: 6,
              border: 'none',
              background: type === t ? '#FFFFFF' : 'transparent',
              color: type === t ? '#111827' : '#6B7280',
              fontWeight: type === t ? 600 : 500,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              boxShadow: type === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 150ms',
            }}
          >
            {t === 'percent' ? 'Pourcentage (%)' : 'Fixe ($/vente)'}
          </button>
        ))}
      </div>

      {/* Value input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="number"
          min={0}
          max={type === 'percent' ? 100 : 9999}
          step={type === 'percent' ? 0.5 : 1}
          value={value}
          onChange={e => onChange(type, parseFloat(e.target.value) || 0)}
          style={{
            flex: 1,
            padding: '10px 12px',
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            fontSize: 15,
            color: '#111827',
            fontFamily: 'Inter, sans-serif',
            outline: 'none',
            background: '#FFFFFF',
          }}
          onFocus={e => { e.target.style.borderColor = '#69C9CA'; e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)' }}
          onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
        />
        <span style={{ color: '#374151', fontSize: 14, fontWeight: 500, minWidth: 52, flexShrink: 0 }}>
          {type === 'percent' ? '%' : '$/vente'}
        </span>
      </div>

      <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>
        Affichage : <strong style={{ color: '#111827' }}>
          {type === 'percent' ? `${value}%` : `${value} $/vente`}
        </strong>
      </p>
    </div>
  )
}
