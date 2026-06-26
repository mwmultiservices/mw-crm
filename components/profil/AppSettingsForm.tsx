'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  initialSettings: Record<string, string>
  onSaved?: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 16,
  color: '#1F2937',
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  background: '#FFFFFF',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#374151',
  marginBottom: 6,
}

const focus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = '#69C9CA'
  e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)'
}
const blur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = '#E5E7EB'
  e.target.style.boxShadow = 'none'
}

export default function AppSettingsForm({ initialSettings, onSaved }: Props) {
  const [companyName, setCompanyName] = useState(initialSettings.company_name || 'MW Multiservices')
  const [subtitle, setSubtitle] = useState(initialSettings.subtitle || '')
  const [primaryColor, setPrimaryColor] = useState(initialSettings.primary_color || '#69C9CA')
  const [secondaryColor, setSecondaryColor] = useState(initialSettings.secondary_color || '#0D6E6F')
  const [logoUrl, setLogoUrl] = useState(initialSettings.logo_url || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await Promise.all([
      supabase.from('app_settings').upsert({ key: 'company_name',   value: companyName    }, { onConflict: 'key' }),
      supabase.from('app_settings').upsert({ key: 'subtitle',       value: subtitle       }, { onConflict: 'key' }),
      supabase.from('app_settings').upsert({ key: 'primary_color',  value: primaryColor   }, { onConflict: 'key' }),
      supabase.from('app_settings').upsert({ key: 'secondary_color',value: secondaryColor }, { onConflict: 'key' }),
      supabase.from('app_settings').upsert({ key: 'logo_url',       value: logoUrl        }, { onConflict: 'key' }),
    ])
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    onSaved?.()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Company name */}
      <div>
        <label style={labelStyle}>Nom de l'entreprise</label>
        <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
          style={inputStyle} onFocus={focus} onBlur={blur} />
      </div>

      {/* Subtitle */}
      <div>
        <label style={labelStyle}>Slogan / Sous-titre</label>
        <input type="text" value={subtitle} onChange={e => setSubtitle(e.target.value)}
          placeholder="L'excellence à votre service" style={inputStyle} onFocus={focus} onBlur={blur} />
      </div>

      {/* Primary color */}
      <div>
        <label style={labelStyle}>Couleur principale</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
            style={{ width: 44, height: 44, border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'none', flexShrink: 0 }} />
          <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
            style={{ ...inputStyle, flex: 1 }} placeholder="#69C9CA" maxLength={7} onFocus={focus} onBlur={blur} />
          <div style={{ width: 36, height: 36, borderRadius: 8, background: primaryColor, border: '1px solid #E5E7EB', flexShrink: 0 }} />
        </div>
      </div>

      {/* Secondary color */}
      <div>
        <label style={labelStyle}>Couleur secondaire</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)}
            style={{ width: 44, height: 44, border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'none', flexShrink: 0 }} />
          <input type="text" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)}
            style={{ ...inputStyle, flex: 1 }} placeholder="#0D6E6F" maxLength={7} onFocus={focus} onBlur={blur} />
          <div style={{ width: 36, height: 36, borderRadius: 8, background: secondaryColor, border: '1px solid #E5E7EB', flexShrink: 0 }} />
        </div>
      </div>

      {/* Logo URL */}
      <div>
        <label style={labelStyle}>URL du logo</label>
        <input type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
          placeholder="https://example.com/logo.png" style={inputStyle} onFocus={focus} onBlur={blur} />
        {logoUrl && (
          <div style={{ marginTop: 10, padding: 10, background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB', display: 'flex', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Logo" style={{ height: 48, objectFit: 'contain', maxWidth: '100%' }} />
          </div>
        )}
      </div>

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
