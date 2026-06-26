'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { LogOut, Copy, Check } from 'lucide-react'
import SettingsSection from '@/components/profil/SettingsSection'
import EmployeeCard, { Employee } from '@/components/profil/EmployeeCard'
import ColorPicker from '@/components/profil/ColorPicker'
import AppSettingsForm from '@/components/profil/AppSettingsForm'
import MapSettingsForm from '@/components/profil/MapSettingsForm'
import SaleSettingsForm from '@/components/profil/SaleSettingsForm'
import { isManager } from '@/lib/roles'

// ─── helpers ────────────────────────────────────────────────

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

const LABEL_STYLE: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6,
}
const INPUT_STYLE: React.CSSProperties = {
  width: '100%', border: '1px solid #E5E7EB', borderRadius: 8,
  padding: '10px 12px', fontSize: 16, color: '#1F2937',
  fontFamily: 'Inter, sans-serif', outline: 'none', background: '#FFFFFF',
  boxSizing: 'border-box',
}
const focusIn = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = '#69C9CA'
  e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)'
}
const focusOut = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = '#E5E7EB'
  e.target.style.boxShadow = 'none'
}

// ─── SQL migration banner ────────────────────────────────────

function MigrationBanner({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div style={{
      background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 12,
      padding: 16, marginBottom: 16,
    }}>
      <p style={{ color: '#92400E', fontWeight: 700, fontSize: 14, margin: '0 0 6px' }}>
        ⚠ Migration SQL requise
      </p>
      <p style={{ color: '#78350F', fontSize: 12, margin: '0 0 12px', lineHeight: 1.5 }}>
        Certaines fonctionnalités nécessitent des colonnes/tables manquantes. Copiez ce SQL et exécutez-le dans <strong>Supabase → SQL Editor</strong>.
      </p>
      <pre style={{
        background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8,
        padding: 10, fontSize: 10, overflowX: 'auto', margin: '0 0 10px',
        color: '#374151', lineHeight: 1.6,
      }}>
        {sql}
      </pre>
      <button
        onClick={copy}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: copied ? '#10B981' : '#F59E0B',
          color: '#FFFFFF', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copié !' : 'Copier le SQL'}
      </button>
    </div>
  )
}

// ─── SQL migration string ────────────────────────────────────

const MIGRATION_SQL = `-- Ajouter colonnes à profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS commission_type  TEXT    DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS commission_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phone            TEXT,
  ADD COLUMN IF NOT EXISTS daily_goal            INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS personal_goal_doors   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS personal_goal_revenue NUMERIC DEFAULT 0;

-- Créer table app_settings
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "auth_read" ON app_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "auth_write" ON app_settings
  FOR ALL TO authenticated USING (true);`

// ─── Spinner ────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F1F2F2',
    }}>
      <style>{`@keyframes mw-spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{
        width: 32, height: 32, border: '3px solid #E5E7EB',
        borderTopColor: '#69C9CA', borderRadius: '50%',
        animation: 'mw-spin 0.8s linear infinite',
      }} />
    </div>
  )
}

// ─── type Tab ───────────────────────────────────────────────

type ManagerTab = 'equipe' | 'parametres'

// ═══════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════

export default function ProfilPage() {
  const router = useRouter()

  const [profile, setProfile]           = useState<any>(null)
  const [allProfiles, setAllProfiles]   = useState<any[]>([])
  const [appSettings, setAppSettings]   = useState<Record<string, string>>({})
  const [needsMigration, setNeedsMigration] = useState(false)
  const [loading, setLoading]           = useState(true)
  const [managerTab, setManagerTab]     = useState<ManagerTab>('equipe')

  // Vendeur — phone edit
  const [phone, setPhone]           = useState('')
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [phoneSaved, setPhoneSaved] = useState(false)

  // Vendeur — color
  const [color, setColor]           = useState('#69C9CA')
  const [colorSaving, setColorSaving] = useState(false)
  const [colorSaved, setColorSaved] = useState(false)

  // ── load ──────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (p) {
      setProfile(p)
      setPhone(p.phone || '')
      setColor(p.color || '#69C9CA')
    }

    const { data: allP } = await supabase.from('profiles').select('*')
    setAllProfiles(allP || [])

    // app_settings — graceful degradation if table missing
    const { data: settings, error: settingsErr } = await supabase.from('app_settings').select('*')
    if (settingsErr) {
      setNeedsMigration(true)
    } else if (settings) {
      const map: Record<string, string> = {}
      settings.forEach((s: any) => { map[s.key] = s.value })
      setAppSettings(map)
    }

    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  // ── actions ───────────────────────────────────────────────

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const savePhone = async () => {
    if (!profile) return
    setPhoneSaving(true)
    await supabase.from('profiles').update({ phone }).eq('id', profile.id)
    setPhoneSaving(false)
    setPhoneSaved(true)
    setTimeout(() => setPhoneSaved(false), 2500)
  }

  const saveColor = async (newColor: string) => {
    if (!profile) return
    setColor(newColor)
    setColorSaving(true)
    await supabase.from('profiles').update({ color: newColor }).eq('id', profile.id)
    setColorSaving(false)
    setColorSaved(true)
    setTimeout(() => setColorSaved(false), 2500)
  }

  // ── guards ────────────────────────────────────────────────

  if (loading || !profile) return <Spinner />

  const userIsManager = isManager(profile.role)
  const vendeurs  = allProfiles.filter(p => p.id !== profile.id)

  // Colors used by everyone except the current user
  const usedColors = allProfiles
    .filter(p => p.id !== profile.id && p.color)
    .map(p => ({ color: p.color as string, name: p.full_name as string }))

  // ── Identity card (shared) ────────────────────────────────

  const IdentityCard = () => (
    <div style={{
      background: '#FFFFFF', borderRadius: 12, border: '1px solid #E5E7EB',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: 20,
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14, background: profile.color || '#69C9CA',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontWeight: 800, fontSize: 20, flexShrink: 0,
      }}>
        {(profile.full_name || '?').slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: '#111827', fontWeight: 700, fontSize: 18, margin: '0 0 2px', letterSpacing: '-0.01em' }}>
          {profile.full_name}
        </p>
        <p style={{ color: '#374151', fontSize: 12, margin: '0 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {profile.email}
        </p>
        <span style={{
          background: '#E8F8F8', color: '#0D6E6F', fontSize: 11, fontWeight: 600,
          padding: '3px 10px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {profile.role || 'vendeur'}
        </span>
      </div>
    </div>
  )

  // ── Logout button (shared) ────────────────────────────────

  const LogoutBtn = () => (
    <button
      onClick={handleLogout}
      style={{
        width: '100%', background: '#FFFFFF', color: '#EF4444', fontWeight: 600,
        padding: '14px 16px', borderRadius: 12, fontSize: 15, border: '1px solid #FECACA',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, fontFamily: 'Inter, sans-serif', transition: 'background 150ms ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
      onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
    >
      <LogOut size={16} />
      Se déconnecter
    </button>
  )

  // ─────────────────────────────────────────────────────────
  // MANAGER VIEW
  // ─────────────────────────────────────────────────────────

  if (userIsManager) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F1F2F2', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '16px 16px 0', flexShrink: 0 }}>
          <h1 style={{ color: '#111827', fontWeight: 700, fontSize: 20, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
            Profil &amp; Paramètres
          </h1>
          <div style={{ display: 'flex', gap: 0 }}>
            {(['equipe', 'parametres'] as ManagerTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setManagerTab(tab)}
                style={{
                  flexShrink: 0, padding: '10px 16px', border: 'none', background: 'none',
                  borderBottom: managerTab === tab ? '2px solid #69C9CA' : '2px solid transparent',
                  color: managerTab === tab ? '#69C9CA' : '#6B7280',
                  fontWeight: managerTab === tab ? 600 : 500,
                  fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                  transition: 'color 150ms, border-color 150ms',
                }}
              >
                {tab === 'equipe' ? 'Équipe' : 'Paramètres'}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {needsMigration && <MigrationBanner sql={MIGRATION_SQL} />}
          <IdentityCard />

          {/* ── Tab: Équipe ── */}
          {managerTab === 'equipe' && (
            <>
              <div>
                <p style={{ color: '#374151', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px 2px' }}>
                  Gestion des employés
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {vendeurs.length === 0 && (
                    <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E5E7EB', padding: '32px 16px', textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
                      Aucun vendeur
                    </div>
                  )}
                  {vendeurs.map((emp: any) => (
                    <EmployeeCard
                      key={emp.id}
                      employee={emp as Employee}
                      usedColors={usedColors}
                      onUpdated={loadData}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Tab: Paramètres ── */}
          {managerTab === 'parametres' && (
            <>
              <SettingsSection title="Application" description="Nom, couleur principale, slogan">
                <AppSettingsForm initialSettings={appSettings} onSaved={loadData} />
              </SettingsSection>

              <SettingsSection title="Carte" description="Comportement de la carte interactive">
                <MapSettingsForm initialSettings={appSettings} onSaved={loadData} />
              </SettingsSection>

              <SettingsSection title="Services de vente" description="Services proposés lors de la création d'une porte">
                <SaleSettingsForm initialSettings={appSettings} onSaved={loadData} />
              </SettingsSection>
            </>
          )}

          <LogoutBtn />
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────
  // VENDEUR VIEW
  // ─────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#F1F2F2', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '20px 20px 16px' }}>
        <h1 style={{ color: '#111827', fontWeight: 700, fontSize: 22, margin: 0, letterSpacing: '-0.02em' }}>
          Mon profil
        </h1>
      </div>

      <div style={{ padding: '20px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {needsMigration && <MigrationBanner sql={MIGRATION_SQL} />}
        <IdentityCard />

        {/* Mon profil — coordonnées */}
        <SettingsSection title="Mes informations" description="Numéro de téléphone affiché aux collègues">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={LABEL_STYLE}>Prénom et nom</label>
              <input
                type="text" value={profile.full_name} readOnly
                style={{ ...INPUT_STYLE, background: '#F9FAFB', color: '#6B7280' }}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Adresse courriel</label>
              <input
                type="email" value={profile.email} readOnly
                style={{ ...INPUT_STYLE, background: '#F9FAFB', color: '#6B7280' }}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Téléphone</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(formatPhone(e.target.value))}
                  placeholder="(514) 555-1234"
                  style={{ ...INPUT_STYLE, flex: 1 }}
                  onFocus={focusIn} onBlur={focusOut}
                />
                <button
                  onClick={savePhone} disabled={phoneSaving}
                  style={{
                    background: phoneSaved ? '#10B981' : '#69C9CA',
                    color: phoneSaved ? '#FFFFFF' : '#000000',
                    fontWeight: 600, padding: '0 14px', borderRadius: 8, fontSize: 13,
                    border: 'none', cursor: phoneSaving ? 'not-allowed' : 'pointer',
                    fontFamily: 'Inter, sans-serif', flexShrink: 0, transition: 'background 200ms',
                  }}
                >
                  {phoneSaving ? '...' : phoneSaved ? '✓' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Couleur terrain */}
        <SettingsSection title="Ma couleur sur la carte" description="Identifie vos pins sur la carte de l'équipe">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, background: color,
                border: '2px solid #E5E7EB', flexShrink: 0,
              }} />
              <div>
                <p style={{ color: '#111827', fontWeight: 600, fontSize: 14, margin: 0 }}>Couleur actuelle</p>
                <p style={{ color: '#6B7280', fontSize: 12, margin: '2px 0 0', fontFamily: 'monospace' }}>{color}</p>
              </div>
              {colorSaved && (
                <span style={{
                  background: '#D1FAE5', color: '#065F46', fontSize: 12, fontWeight: 600,
                  padding: '4px 10px', borderRadius: 999, marginLeft: 'auto',
                }}>
                  ✓ Sauvegardé
                </span>
              )}
            </div>
            <ColorPicker
              selectedColor={color}
              usedColors={usedColors}
              onChange={saveColor}
            />
            {colorSaving && (
              <p style={{ color: '#6B7280', fontSize: 12, margin: 0, textAlign: 'center' }}>Sauvegarde...</p>
            )}
          </div>
        </SettingsSection>

        {/* Commission (read-only) */}
        {(profile.commission_type || profile.commission_value > 0) && (
          <SettingsSection title="Ma commission" description="Définie par le manager">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                background: '#E8F8F8', borderRadius: 10,
                padding: '12px 18px', textAlign: 'center',
              }}>
                <p style={{ color: '#0D6E6F', fontWeight: 800, fontSize: 24, margin: 0 }}>
                  {profile.commission_type === 'percent'
                    ? `${profile.commission_value}%`
                    : `${profile.commission_value} $`}
                </p>
                <p style={{ color: '#6B7280', fontSize: 11, margin: '2px 0 0' }}>
                  {profile.commission_type === 'percent' ? 'par vente' : 'fixe / vente'}
                </p>
              </div>
            </div>
          </SettingsSection>
        )}

        <LogoutBtn />
      </div>
    </div>
  )
}
