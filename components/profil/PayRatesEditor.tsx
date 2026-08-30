'use client'
import { PAY_RATE_FIELDS, type PayRates, type PayRateKey } from '@/lib/payes'

// Grille de rémunération d'un employé (7 postes, cf. SALAIRES MW 2026).
// Un champ à 0 = ce poste ne s'applique pas à cet employé.
export default function PayRatesEditor({
  rates, onChange, disabled,
}: {
  rates: PayRates
  onChange: (key: PayRateKey, value: number) => void
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {PAY_RATE_FIELDS.map((f) => {
        const active = rates[f.key] > 0
        return (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                margin: 0, fontSize: 13, fontWeight: 600,
                color: active ? '#111827' : '#9CA3AF',
              }}>
                {f.label}
              </p>
              <p style={{ margin: '1px 0 0', fontSize: 11, color: '#9CA3AF', lineHeight: 1.35 }}>
                {f.hint}
              </p>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', flexShrink: 0,
              border: `1px solid ${active ? '#69C9CA' : '#E5E7EB'}`,
              borderRadius: 8, overflow: 'hidden', background: '#FFF',
            }}>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={f.unit === '%' ? 1 : 0.5}
                value={rates[f.key] || ''}
                placeholder="0"
                disabled={disabled}
                onChange={(e) => onChange(f.key, Number(e.target.value) || 0)}
                style={{
                  width: 62, border: 'none', outline: 'none', padding: '8px 6px 8px 10px',
                  fontSize: 15, fontWeight: 600, textAlign: 'right',
                  color: active ? '#0D6E6F' : '#9CA3AF',
                  fontFamily: 'Inter, sans-serif', background: 'transparent',
                }}
              />
              <span style={{
                padding: '8px 10px 8px 2px', fontSize: 12, fontWeight: 600,
                color: '#6B7280', background: '#F9FAFB', alignSelf: 'stretch',
                display: 'flex', alignItems: 'center', borderLeft: '1px solid #F3F4F6',
              }}>
                {f.unit}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
