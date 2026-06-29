'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Accepte un courriel OU un nom d'utilisateur : si pas de '@', on résout
    // le courriel correspondant (fonction DB) avant de se connecter.
    let email = identifier.trim()
    if (email && !email.includes('@')) {
      const { data, error: rpcErr } = await supabase.rpc('mw_email_for_username', { p_username: email })
      if (rpcErr || !data) {
        setError("Nom d'utilisateur introuvable")
        setLoading(false)
        return
      }
      email = data as string
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/carte')
    }
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
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
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
            Application terrain — Porte-à-porte
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
            Connexion
          </h1>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                Courriel ou nom d&apos;utilisateur
              </label>
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="ex. william.yelle"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
                style={{
                  width: '100%',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 15,
                  color: '#1F2937',
                  outline: 'none',
                  transition: 'border-color 150ms, box-shadow 150ms',
                  fontFamily: 'Inter, sans-serif',
                }}
                onFocus={e => {
                  e.target.style.borderColor = '#69C9CA'
                  e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)'
                }}
                onBlur={e => {
                  e.target.style.borderColor = '#E5E7EB'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                Mot de passe
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 15,
                  color: '#1F2937',
                  outline: 'none',
                  transition: 'border-color 150ms, box-shadow 150ms',
                  fontFamily: 'Inter, sans-serif',
                }}
                onFocus={e => {
                  e.target.style.borderColor = '#69C9CA'
                  e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)'
                }}
                onBlur={e => {
                  e.target.style.borderColor = '#E5E7EB'
                  e.target.style.boxShadow = 'none'
                }}
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
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#6B7280', fontSize: 14, marginTop: 24 }}>
          Pas de compte ?{' '}
          <a href="/signup" style={{ color: '#69C9CA', fontWeight: 600, textDecoration: 'none' }}>
            Créer un compte
          </a>
        </p>
      </div>
    </div>
  )
}
