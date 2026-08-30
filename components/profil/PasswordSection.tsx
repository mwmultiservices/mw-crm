'use client'
import { useState } from 'react'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { setMyPassword } from '@/lib/queries/credentials'

const INPUT: React.CSSProperties = {
  width: '100%', border: '1px solid #E5E7EB', borderRadius: 8,
  padding: '10px 40px 10px 12px', fontSize: 16, color: '#1F2937',
  fontFamily: 'Inter, sans-serif', outline: 'none', background: '#FFFFFF',
  boxSizing: 'border-box',
}
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6,
}

// Changement de mot de passe par l'employé lui-même.
// La session authentifie l'opération (supabase.auth.updateUser) : le nouveau
// mot de passe ne transite par aucune table et n'est visible de personne.
export default function PasswordSection({ onChanged }: { onChanged?: () => void }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async () => {
    setMsg(null)
    if (pw.length < 8) { setMsg({ ok: false, text: 'Minimum 8 caractères.' }); return }
    if (pw !== pw2) { setMsg({ ok: false, text: 'Les deux mots de passe ne sont pas identiques.' }); return }

    setBusy(true)
    const r = await setMyPassword(pw)
    setBusy(false)
    if (!r.ok) { setMsg({ ok: false, text: r.error ?? 'Changement impossible' }); return }
    setPw('')
    setPw2('')
    setMsg({ ok: true, text: 'Mot de passe changé. Il est maintenant privé — même la direction ne le voit plus.' })
    onChanged?.()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={LABEL}>Nouveau mot de passe</label>
        <div style={{ position: 'relative' }}>
          <input
            type={show ? 'text' : 'password'}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Minimum 8 caractères"
            autoComplete="new-password"
            style={INPUT}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Masquer' : 'Afficher'}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF',
              padding: 4, display: 'flex',
            }}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div>
        <label style={LABEL}>Confirmer</label>
        <input
          type={show ? 'text' : 'password'}
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          placeholder="Retape le même mot de passe"
          autoComplete="new-password"
          style={{ ...INPUT, paddingRight: 12 }}
        />
      </div>

      {msg && (
        <p style={{
          margin: 0, fontSize: 12, fontWeight: 500, lineHeight: 1.5,
          background: msg.ok ? '#F0FDF4' : '#FEF2F2',
          color: msg.ok ? '#166534' : '#B91C1C',
          border: `1px solid ${msg.ok ? '#BBF7D0' : '#FECACA'}`,
          borderRadius: 8, padding: '8px 10px',
        }}>
          {msg.text}
        </p>
      )}

      <button
        onClick={submit}
        disabled={busy || !pw || !pw2}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          background: !pw || !pw2 ? '#E5E7EB' : '#69C9CA',
          color: !pw || !pw2 ? '#9CA3AF' : '#06363B',
          fontWeight: 700, padding: '12px', borderRadius: 8, fontSize: 14,
          border: 'none', cursor: busy || !pw || !pw2 ? 'not-allowed' : 'pointer',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <ShieldCheck size={15} />
        {busy ? 'Changement…' : 'Changer mon mot de passe'}
      </button>
    </div>
  )
}
