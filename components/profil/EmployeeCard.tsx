'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ROLE_OPTIONS, roleLabel, type Role } from '@/lib/roles'
import ColorPicker from './ColorPicker'
import CommissionEditor from './CommissionEditor'

export interface Employee {
  id: string
  full_name: string
  email: string
  phone?: string | null
  color?: string | null
  role?: string | null
  commission_type?: string | null
  commission_value?: number | null
}

interface Props {
  employee: Employee
  usedColors: { color: string; name: string }[]
  onUpdated: () => void
}

const SaveBtn = ({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    disabled={saving}
    style={{
      background: saved ? '#10B981' : '#69C9CA',
      color: saved ? '#FFFFFF' : '#000000',
      fontWeight: 600,
      padding: '12px',
      borderRadius: 8,
      fontSize: 14,
      border: 'none',
      cursor: saving ? 'not-allowed' : 'pointer',
      fontFamily: 'Inter, sans-serif',
      transition: 'background 200ms',
      width: '100%',
    }}
  >
    {saving ? 'Sauvegarde...' : saved ? '✓ Sauvegardé' : 'Enregistrer'}
  </button>
)

export default function EmployeeCard({ employee, usedColors, onUpdated }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [color, setColor] = useState(employee.color || '#69C9CA')
  const [role, setRole] = useState<string>(employee.role || 'rep')
  const [commType, setCommType] = useState<'percent' | 'fixed'>(
    (employee.commission_type as 'percent' | 'fixed') || 'percent'
  )
  const [commValue, setCommValue] = useState(employee.commission_value ?? 0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('profiles')
      .update({ color, role, commission_type: commType, commission_value: commValue })
      .eq('id', employee.id)
    setSaving(false)
    if (err) {
      // Le trigger protect_profile_fields rejette si l'utilisateur n'est pas admin.
      setError(err.message || 'Modification refusée')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    onUpdated()
  }

  const commDisplay = commType === 'percent'
    ? `${commValue}%`
    : `${commValue}$/vente`

  const otherColors = usedColors.filter(u => u.color !== employee.color)

  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: 12,
      border: '1px solid #E5E7EB',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Row */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: color, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 700, fontSize: 14,
        }}>
          {employee.full_name.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#111827', fontWeight: 600, fontSize: 14, margin: '0 0 2px' }}>
            {employee.full_name}
          </p>
          <p style={{
            color: '#6B7280', fontSize: 12, margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {employee.email}
            {employee.phone ? ` · ${employee.phone}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{
            background: '#EEF2FF', color: '#4338CA',
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {roleLabel(role)}
          </span>
          <span style={{
            background: '#E8F8F8', color: '#0D6E6F',
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
          }}>
            {commDisplay}
          </span>
          {expanded ? <ChevronUp size={16} color="#9CA3AF" /> : <ChevronDown size={16} color="#9CA3AF" />}
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: '1px solid #F3F4F6', padding: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <p style={{ color: '#374151', fontWeight: 600, fontSize: 12, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Rôle
              </p>
              <select
                value={role}
                onChange={e => setRole(e.target.value as Role)}
                style={{
                  width: '100%', border: '1px solid #E5E7EB', borderRadius: 8,
                  padding: '10px 12px', fontSize: 15, color: '#1F2937',
                  fontFamily: 'Inter, sans-serif', outline: 'none', background: '#FFFFFF',
                  boxSizing: 'border-box', cursor: 'pointer',
                }}
              >
                {ROLE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p style={{ color: '#9CA3AF', fontSize: 11, margin: '6px 0 0' }}>
                Détermine les sections et permissions de l&apos;employé.
              </p>
            </div>
            <div>
              <p style={{ color: '#374151', fontWeight: 600, fontSize: 12, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Couleur terrain
              </p>
              <ColorPicker selectedColor={color} usedColors={otherColors} onChange={setColor} />
            </div>
            <div>
              <p style={{ color: '#374151', fontWeight: 600, fontSize: 12, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Commission
              </p>
              <CommissionEditor
                type={commType}
                value={commValue}
                onChange={(t, v) => { setCommType(t); setCommValue(v) }}
              />
            </div>
            {error && (
              <p style={{
                background: '#FEF2F2', color: '#B91C1C', fontSize: 12, fontWeight: 500,
                border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px', margin: 0,
              }}>
                {error}
              </p>
            )}
            <SaveBtn saving={saving} saved={saved} onClick={handleSave} />
          </div>
        </div>
      )}
    </div>
  )
}
