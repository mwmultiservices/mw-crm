'use client'
import { useState } from 'react'
import { Copy, Check, UserPlus } from 'lucide-react'
import { ROLE_OPTIONS } from '@/lib/roles'
import { createEmployee, type CreatedEmployee } from '@/lib/queries/team'
import { autoFocusDesktop } from '@/lib/ui'
import ColorPicker, { PALETTE } from './ColorPicker'

const EMAIL_DOMAIN = 'mwmultiservices.ca'

const inp: React.CSSProperties = {
  width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 12px',
  fontSize: 16, color: '#1F2937', fontFamily: 'Inter, sans-serif', outline: 'none',
  background: '#FFFFFF', boxSizing: 'border-box',
}
const btn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 8,
  padding: '11px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'Inter, sans-serif', background: '#69C9CA', color: '#06363B',
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <div style={{ marginTop: 4 }}>{children}</div>
      {hint && <p style={{ color: '#9CA3AF', fontSize: 11, margin: '4px 0 0', lineHeight: 1.45 }}>{hint}</p>}
    </label>
  )
}

// « Jean-Luc Tremblay » → « jean-luc.tremblay » (même règle que côté serveur).
function slugUsername(raw: string): string {
  return raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

interface Props {
  usedColors: { color: string; name: string }[]
  onClose: () => void
  onCreated: () => void        // recharge la liste (appelé à la fermeture après succès)
}

export default function NewEmployeeModal({ usedColors, onClose, onCreated }: Props) {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [touchedUser, setTouchedUser] = useState(false)   // l'admin a-t-il édité l'identifiant ?
  const [role, setRole] = useState('rep')
  const [phone, setPhone] = useState('')
  // Défaut = première couleur libre : la palette refuse celles déjà prises.
  const [color, setColor] = useState(
    () => PALETTE.find(c => !usedColors.some(u => u.color === c)) ?? PALETTE[0],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedEmployee | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // L'identifiant suit le nom tant que l'admin ne l'a pas écrit lui-même.
  const onNameChange = (v: string) => {
    setFullName(v)
    if (!touchedUser) setUsername(slugUsername(v))
  }

  const submit = async () => {
    if (!fullName.trim()) { setError('Nom complet requis.'); return }
    if (!username.trim()) { setError('Identifiant requis.'); return }
    setSaving(true); setError(null)
    const r = await createEmployee({
      full_name: fullName.trim(),
      username: username.trim(),
      role,
      phone: phone || null,
      color,
    })
    setSaving(false)
    if (!r.ok) { setError(r.error); return }
    setCreated(r.employee)
    setWarning(r.warning ?? null)
  }

  const copyCredentials = () => {
    if (!created) return
    const text =
      `${created.full_name}\nIdentifiant : ${created.username}\n` +
      `Mot de passe : ${created.password}\nSite : https://mw-crm.vercel.app`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const close = () => { if (created) onCreated(); onClose() }

  // ── Étape 2 : compte créé, on montre les accès à transmettre ──
  if (created) {
    return (
      <div onClick={close} className="mw-modal-overlay">
        <div onClick={e => e.stopPropagation()} className="mw-modal-card" style={{ width: 'min(420px, 100%)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
            ✓ Compte créé
          </h2>
          <p style={{ color: '#6B7280', fontSize: 12, margin: '0 0 14px', lineHeight: 1.55 }}>
            Envoie ces accès à <strong>{created.full_name}</strong>. Le mot de passe reste visible
            dans l&apos;onglet « Mots de passe » jusqu&apos;à ce qu&apos;il en choisisse un lui-même.
          </p>

          <div style={{
            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
            padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div>
              <p style={{ color: '#92400E', fontSize: 11, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Identifiant
              </p>
              <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 15, fontWeight: 700, color: '#78350F', userSelect: 'all', wordBreak: 'break-all' }}>
                {created.username}
              </code>
            </div>
            <div>
              <p style={{ color: '#92400E', fontSize: 11, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Mot de passe temporaire
              </p>
              <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 17, fontWeight: 800, color: '#78350F', letterSpacing: '0.04em', userSelect: 'all' }}>
                {created.password}
              </code>
            </div>
          </div>

          {warning && (
            <p style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px', fontSize: 12, margin: '12px 0 0', lineHeight: 1.5 }}>
              {warning}
            </p>
          )}

          <div className="mw-modal-actions">
            <button onClick={copyCredentials} style={{
              ...btn, flex: 1, justifyContent: 'center',
              background: copied ? '#10B981' : '#FFFFFF',
              color: copied ? '#FFFFFF' : '#374151',
              border: '1px solid #D1D5DB',
            }}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copié !' : 'Copier les accès'}
            </button>
            <button onClick={close} style={{ ...btn, flex: 1, justifyContent: 'center' }}>Terminé</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Étape 1 : formulaire ──
  return (
    <div onClick={onClose} className="mw-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="mw-modal-card" style={{ width: 'min(440px, 100%)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserPlus size={18} color="#0D6E6F" /> Nouvel employé
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Nom complet *">
            <input value={fullName} onChange={e => onNameChange(e.target.value)} style={inp}
              placeholder="Jean Tremblay" autoFocus={autoFocusDesktop()} />
          </Field>

          <Field label="Identifiant *" hint={`Sert à se connecter. Courriel du compte : ${username || 'identifiant'}@${EMAIL_DOMAIN}`}>
            <input
              value={username}
              onChange={e => { setTouchedUser(true); setUsername(e.target.value) }}
              style={inp} placeholder="jean.tremblay" autoCapitalize="none" autoCorrect="off"
            />
          </Field>

          <Field label="Rôle" hint="Détermine les sections visibles et les permissions.">
            <select value={role} onChange={e => setRole(e.target.value)} style={{ ...inp, cursor: 'pointer', fontSize: 15 }}>
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>

          <Field label="Téléphone">
            <input value={phone} onChange={e => setPhone(formatPhone(e.target.value))} style={inp}
              type="tel" placeholder="(514) 555-1234" />
          </Field>

          <Field label="Couleur terrain">
            <ColorPicker selectedColor={color} usedColors={usedColors} onChange={setColor} />
          </Field>

          <p style={{ color: '#6B7280', fontSize: 12, margin: 0, lineHeight: 1.5, background: '#F9FAFB', borderRadius: 8, padding: '9px 11px' }}>
            Un mot de passe temporaire est généré automatiquement et affiché à l&apos;étape suivante.
            La grille de paye se règle ensuite sur la fiche de l&apos;employé.
          </p>

          {error && (
            <p style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px', fontSize: 12, margin: 0 }}>
              {error}
            </p>
          )}
        </div>

        <div className="mw-modal-actions">
          <button onClick={onClose} style={{ ...btn, flex: 1, justifyContent: 'center', background: '#F3F4F6', color: '#374151' }}>
            Annuler
          </button>
          <button onClick={submit} disabled={saving} style={{ ...btn, flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Création…' : 'Créer le compte'}
          </button>
        </div>
      </div>
    </div>
  )
}
