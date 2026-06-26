'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import ColorPicker from '@/components/profil/ColorPicker'
import { VENDOR_COLORS, getUsedColorProfiles } from '@/lib/colors'

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 15,
  color: '#1F2937',
  outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'Inter, sans-serif',
  background: '#FFFFFF',
}

function Input({ type = 'text', placeholder, value, onChange, required }: {
  type?: string
  placeholder: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  required?: boolean
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      required={required}
      style={inputStyle}
      onFocus={e => {
        e.target.style.borderColor = '#69C9CA'
        e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)'
      }}
      onBlur={e => {
        e.target.style.borderColor = '#E5E7EB'
        e.target.style.boxShadow = 'none'
      }}
    />
  )
}

export default function SignupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'rep' | 'admin'>('rep')
  const [color, setColor] = useState(VENDOR_COLORS[0])
  const [managerCode, setManagerCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [usedColors, setUsedColors] = useState<{ color: string; name: string }[]>([])

  useEffect(() => {
    getUsedColorProfiles(supabase).then(setUsedColors)
  }, [])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    // Le rôle est validé/posé CÔTÉ SERVEUR (le code manager n'est plus en clair ici).
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName, color, role, managerCode }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data?.error || "Échec de l'inscription"); setLoading(false); return }
    // Connexion immédiate après création
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr) { setError(signInErr.message); setLoading(false); return }
    router.push('/carte')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #000000 0%, #0D1F1F 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <Image
              src="/logo-mw.svg"
              alt="MW Multiservices"
              width={160}
              height={56}
              style={{ filter: 'brightness(0) invert(1)' }}
              priority
            />
          </div>
          <p style={{ color: '#6B7280', fontSize: 14, margin: 0 }}>
            Équipe terrain — Porte-à-porte
          </p>
        </div>

        {/* Carte formulaire */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          padding: 32,
        }}>
          <h1 style={{
            color: '#000000',
            fontSize: 24,
            fontWeight: 600,
            margin: '0 0 24px',
            letterSpacing: '-0.01em',
          }}>
            Créer un compte
          </h1>

          <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Nom complet</label>
              <Input placeholder="Jean Tremblay" value={fullName} onChange={e => setFullName(e.target.value)} required />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Adresse email</label>
              <Input type="email" placeholder="vous@exemple.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Mot de passe</label>
              <Input type="password" placeholder="Min. 6 caractères" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>

            {/* Rôle */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Rôle</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['rep', 'admin'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      fontWeight: 500,
                      fontSize: 14,
                      border: `1.5px solid ${role === r ? '#69C9CA' : '#E5E7EB'}`,
                      background: role === r ? '#E8F8F8' : '#FFFFFF',
                      color: role === r ? '#0D6E6F' : '#6B7280',
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                      fontFamily: 'Inter, sans-serif',
                      minHeight: 44,
                    }}
                  >
                    {r === 'rep' ? 'Vendeur' : 'Manager'}
                  </button>
                ))}
              </div>
            </div>

            {role === 'admin' && (
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Code manager</label>
                <Input type="password" placeholder="Code d'accès manager" value={managerCode} onChange={e => setManagerCode(e.target.value)} />
              </div>
            )}

            {/* Couleur terrain */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 10 }}>
                Couleur sur la carte
              </label>
              <ColorPicker
                selectedColor={color}
                usedColors={usedColors}
                onChange={setColor}
              />
            </div>

            {error && (
              <div style={{
                background: '#FEE2E2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#991B1B',
                fontSize: 14,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? '#E5E7EB' : '#69C9CA',
                color: loading ? '#9CA3AF' : '#000000',
                fontWeight: 600,
                padding: '11px 20px',
                borderRadius: 8,
                fontSize: 15,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: 4,
                minHeight: 44,
                transition: 'background 150ms ease',
                fontFamily: 'Inter, sans-serif',
              }}
              onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.background = '#4AADAE' }}
              onMouseLeave={e => { if (!loading) (e.target as HTMLButtonElement).style.background = '#69C9CA' }}
            >
              {loading ? 'Création...' : 'Créer mon compte'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#6B7280', fontSize: 14, marginTop: 24 }}>
          Déjà un compte ?{' '}
          <a href="/login" style={{ color: '#69C9CA', fontWeight: 600, textDecoration: 'none' }}>
            Se connecter
          </a>
        </p>
      </div>
    </div>
  )
}
