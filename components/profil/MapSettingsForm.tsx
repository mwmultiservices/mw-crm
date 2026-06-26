'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  initialSettings: Record<string, string>
  onSaved?: () => void
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: '#374151',
}

const inputStyle: React.CSSProperties = {
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 16,
  color: '#1F2937',
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  background: '#FFFFFF',
  boxSizing: 'border-box' as const,
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 26, borderRadius: 13,
        background: value ? '#69C9CA' : '#D1D5DB',
        border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
        transition: 'background 200ms ease',
      }}
    >
      <div style={{
        position: 'absolute', top: 3,
        left: value ? 21 : 3,
        width: 20, height: 20, borderRadius: '50%', background: 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 200ms ease',
      }} />
    </button>
  )
}

export default function MapSettingsForm({ initialSettings, onSaved }: Props) {
  const [longPressMs, setLongPressMs] = useState(parseInt(initialSettings.map_long_press_ms || '700'))
  const [pinColor, setPinColor]       = useState(initialSettings.map_pin_default_color || '#69C9CA')
  const [showAddress, setShowAddress] = useState(initialSettings.map_show_address !== 'false')
  const [showStatus, setShowStatus]   = useState(initialSettings.map_show_status !== 'false')
  const [vibration, setVibration]     = useState(initialSettings.map_vibration !== 'false')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await Promise.all([
      supabase.from('app_settings').upsert({ key: 'map_long_press_ms',      value: String(longPressMs) }, { onConflict: 'key' }),
      supabase.from('app_settings').upsert({ key: 'map_pin_default_color',  value: pinColor            }, { onConflict: 'key' }),
      supabase.from('app_settings').upsert({ key: 'map_show_address',       value: String(showAddress) }, { onConflict: 'key' }),
      supabase.from('app_settings').upsert({ key: 'map_show_status',        value: String(showStatus)  }, { onConflict: 'key' }),
      supabase.from('app_settings').upsert({ key: 'map_vibration',          value: String(vibration)   }, { onConflict: 'key' }),
    ])
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    onSaved?.()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Long press slider */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={labelStyle}>Durée du long press</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#69C9CA' }}>{longPressMs} ms</span>
        </div>
        <input
          type="range" min={300} max={1000} step={50} value={longPressMs}
          onChange={e => setLongPressMs(parseInt(e.target.value))}
          style={{ width: '100%', accentColor: '#69C9CA' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>300 ms (rapide)</span>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>1000 ms (lent)</span>
        </div>
      </div>

      {/* Pin default color */}
      <div>
        <label style={{ ...labelStyle, display: 'block', marginBottom: 8 }}>
          Couleur par défaut des pins
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="color" value={pinColor} onChange={e => setPinColor(e.target.value)}
            style={{ width: 44, height: 44, border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'none', flexShrink: 0 }}
          />
          <input
            type="text" value={pinColor} onChange={e => setPinColor(e.target.value)}
            placeholder="#69C9CA" maxLength={7}
            style={{ ...inputStyle, flex: 1 }}
            onFocus={e => { e.target.style.borderColor = '#69C9CA'; e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)' }}
            onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
          />
          <div style={{ width: 36, height: 36, borderRadius: 8, background: pinColor, border: '1px solid #E5E7EB', flexShrink: 0 }} />
        </div>
      </div>

      {/* Toggles */}
      {([
        { label: "Afficher l'adresse sur la fiche",         value: showAddress, onChange: setShowAddress },
        { label: 'Afficher le statut sur les pins',          value: showStatus,  onChange: setShowStatus  },
        { label: 'Vibration au déclenchement du long press', value: vibration,   onChange: setVibration   },
      ] as const).map(({ label, value, onChange }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={labelStyle}>{label}</span>
          <Toggle value={value} onChange={onChange} />
        </div>
      ))}

      <button
        onClick={handleSave} disabled={saving}
        style={{
          background: '#69C9CA', color: '#000000',
          fontWeight: 600, padding: '0 24px', height: 48, borderRadius: 10, fontSize: 14,
          border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
          fontFamily: 'Inter, sans-serif', width: '100%', opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Sauvegarde...' : 'Enregistrer'}
      </button>
      {saved && (
        <p style={{ margin: 0, textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#10B981' }}>
          ✓ Paramètres sauvegardés
        </p>
      )}
    </div>
  )
}
