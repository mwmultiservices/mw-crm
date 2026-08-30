'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, Copy, Check, KeyRound, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ROLE_OPTIONS, roleLabel, type Role } from '@/lib/roles'
import { payRatesOf, hasRates, money2, type PayRates, type PayRateKey } from '@/lib/payes'
import { generateTempPasswords, type TempCredential } from '@/lib/queries/credentials'
import ColorPicker from './ColorPicker'
import PayRatesEditor from './PayRatesEditor'

export interface Employee {
  id: string
  full_name: string
  email: string
  phone?: string | null
  color?: string | null
  role?: string | null
  commission_type?: string | null
  commission_value?: number | null
  [key: string]: unknown
}

interface Props {
  employee: Employee
  usedColors: { color: string; name: string }[]
  onUpdated: () => void
  tempPassword?: TempCredential | null
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

export default function EmployeeCard({ employee, usedColors, onUpdated, tempPassword }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [color, setColor] = useState(employee.color || '#69C9CA')
  const [role, setRole] = useState<string>(employee.role || 'rep')
  const [rates, setRates] = useState<PayRates>(() => payRatesOf(employee))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pwBusy, setPwBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const setRate = (key: PayRateKey, value: number) =>
    setRates((r) => ({ ...r, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('profiles')
      .update({
        color, role,
        ...rates,
        // compat : l'ancien couple commission_* alimente encore quelques vues
        commission_type: 'percent',
        commission_value: rates.pct_vente,
        hourly_rate: rates.rate_paysagement,
      })
      .eq('id', employee.id)
    setSaving(false)
    if (err) {
      // Colonnes absentes (migration pas appliquée) ou trigger protect_profile_fields.
      setError(
        /column|colonne/i.test(err.message)
          ? `${err.message} — applique migration_crm_salaires.sql dans Supabase → SQL Editor.`
          : err.message || 'Modification refusée',
      )
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    onUpdated()
  }

  const regenerate = async () => {
    setPwBusy(true)
    setError(null)
    const r = await generateTempPasswords({ profileIds: [employee.id] })
    setPwBusy(false)
    if (!r.ok) { setError(r.error ?? 'Génération impossible'); return }
    onUpdated()
  }

  const copyPassword = () => {
    if (!tempPassword) return
    navigator.clipboard.writeText(tempPassword.password).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const commDisplay = hasRates(rates)
    ? [
        rates.rate_paysagement > 0 ? `${money2(rates.rate_paysagement)}/h` : null,
        rates.pct_vente > 0 ? `${rates.pct_vente}%` : null,
      ].filter(Boolean).join(' · ')
    : 'à définir'

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
          {tempPassword && (
            <span title="Mot de passe temporaire actif" style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              background: '#FEF3C7', color: '#92400E',
              fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
            }}>
              <KeyRound size={10} />temp
            </span>
          )}
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
              <p style={{ color: '#374151', fontWeight: 600, fontSize: 12, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Grille de paye
              </p>
              <p style={{ color: '#9CA3AF', fontSize: 11, margin: '0 0 12px', lineHeight: 1.45 }}>
                Laisse à 0 les postes qui ne s&apos;appliquent pas. Ces taux alimentent
                directement la page Payes selon les jobs faites.
              </p>
              <PayRatesEditor rates={rates} onChange={setRate} />
            </div>

            <div>
              <p style={{ color: '#374151', fontWeight: 600, fontSize: 12, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Mot de passe
              </p>
              {tempPassword ? (
                <div style={{
                  background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
                  padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <code style={{
                    flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 16, fontWeight: 700, color: '#92400E', letterSpacing: '0.04em',
                    userSelect: 'all', wordBreak: 'break-all',
                  }}>
                    {tempPassword.password}
                  </code>
                  <button
                    onClick={copyPassword}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                      background: copied ? '#10B981' : '#F59E0B', color: '#FFF',
                      border: 'none', borderRadius: 8, padding: '7px 11px',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'Copié' : 'Copier'}
                  </button>
                </div>
              ) : (
                <p style={{
                  background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10,
                  padding: '10px 12px', margin: 0, fontSize: 12, color: '#166534', lineHeight: 1.5,
                }}>
                  ✓ Mot de passe personnel — choisi par l&apos;employé, invisible sur le site.
                </p>
              )}
              <button
                onClick={regenerate}
                disabled={pwBusy}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%', marginTop: 8, background: '#FFFFFF', color: '#374151',
                  border: '1px solid #D1D5DB', borderRadius: 8, padding: '9px 12px',
                  fontSize: 12, fontWeight: 600, cursor: pwBusy ? 'not-allowed' : 'pointer',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                <RefreshCw size={13} />
                {pwBusy ? 'Génération…' : tempPassword ? 'Générer un nouveau mot de passe' : 'Réinitialiser avec un mot de passe temporaire'}
              </button>
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
