'use client'
import { useState } from 'react'
import { createClientEverywhere, type Client } from '@/lib/queries/clients'
import { autoFocusDesktop } from '@/lib/ui'
import { UserPlus } from 'lucide-react'
import AddressPreviewButton from '@/components/ui/AddressPreviewButton'

// ============================================================
// « Ajouter nouveau » depuis l'autocomplétion client du calendrier.
// Enregistre la fiche dans Supabase (table clients) ET dans QuickBooks
// (Customer). La base CRM fait foi : si QuickBooks n'est pas connecté, le
// client est quand même créé et on l'indique au lieu d'échouer.
// Le modal est IMBRIQUÉ dans le JobModal → zIndex au-dessus (60 par défaut).
// ============================================================

interface Props {
  /** ce qui a été tapé dans le champ « Client / job » : « Jean Tremblay » */
  initialName?: string
  onCancel: () => void
  onCreated: (client: Client, quickbooks: 'ok' | 'skipped', qbError?: string) => void
}

// « Jean Tremblay » → prénom « Jean », nom « Tremblay »
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length <= 1) return { first: parts[0] ?? '', last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

export default function NewClientModal({ initialName = '', onCancel, onCreated }: Props) {
  const seed = splitName(initialName)
  const [first, setFirst] = useState(seed.first)
  const [last, setLast] = useState(seed.last)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [postal, setPostal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fullName = [first.trim(), last.trim()].filter(Boolean).join(' ')

  const save = async () => {
    if (!fullName) { setError('Prénom ou nom requis.'); return }
    setSaving(true); setError('')
    const { client, error: e, quickbooks, qbError } = await createClientEverywhere({
      name: fullName,
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      city: city.trim() || null,
      postal_code: postal.trim() || null,
    })
    setSaving(false)
    if (e || !client) { setError(e ?? 'Création impossible.'); return }
    onCreated(client, quickbooks, qbError)
  }

  return (
    /* stopPropagation : ce modal vit DANS l'overlay du JobModal — sans ça, un
       clic sur le fond fermerait aussi le job derrière. */
    <div onClick={(e) => { e.stopPropagation(); onCancel() }} className="mw-modal-overlay" style={{ zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} className="mw-modal-card" style={{ width: 'min(420px, 100%)' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
          <UserPlus size={18} color="#0E6B6E" />Nouveau client
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: '#6B7280', lineHeight: 1.45 }}>
          Enregistré dans la base des clients et envoyé dans QuickBooks.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Prénom" flex>
              <input value={first} onChange={(e) => setFirst(e.target.value)} style={inp} autoFocus={autoFocusDesktop()} placeholder="Jean" />
            </Field>
            <Field label="Nom" flex>
              <input value={last} onChange={(e) => setLast(e.target.value)} style={inp} placeholder="Tremblay" />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Téléphone" flex>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} inputMode="tel" placeholder="514-555-1234" />
            </Field>
            <Field label="Courriel" flex>
              <input value={email} onChange={(e) => setEmail(e.target.value)} style={inp} type="email" autoCapitalize="none" placeholder="client@exemple.com" />
            </Field>
          </div>
          <Field label="Adresse">
            <input value={address} onChange={(e) => setAddress(e.target.value)} style={inp} placeholder="123 rue Principale" />
            <AddressPreviewButton parts={[address, city, postal]} />
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Ville" flex>
              <input value={city} onChange={(e) => setCity(e.target.value)} style={inp} placeholder="Longueuil" />
            </Field>
            <Field label="Code postal" flex>
              <input value={postal} onChange={(e) => setPostal(e.target.value)} style={inp} autoCapitalize="characters" placeholder="J4K 1A1" />
            </Field>
          </div>
          {error && <div style={{ color: '#991B1B', fontSize: 13 }}>{error}</div>}
        </div>

        <div className="mw-modal-actions">
          <button onClick={onCancel} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1 }}>Annuler</button>
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, flex: 1, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : 'Créer le client'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <label style={{ display: 'block', flex: flex ? 1 : undefined, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, background: '#FFF', boxSizing: 'border-box' }
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
