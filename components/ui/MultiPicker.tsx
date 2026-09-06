'use client'
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

// ============================================================
// Menu déroulant à sélection MULTIPLE (cases à cocher).
// Un <select multiple> natif est inutilisable au doigt sur téléphone :
// on garde donc l'allure d'un menu déroulant (bouton + panneau) mais chaque
// ligne est une case à cocher, et le bouton résume la sélection.
//
// Placé dans un <fieldset disabled> (mode lecture seule du JobModal), le
// bouton est nativement désactivé — la valeur reste lisible.
//
// Utilisé par : le Service d'une job (JobModal) et les vendeurs d'un
// upsell (JobUpsells).
// ============================================================

export interface PickerOption {
  id: string
  label: string
  sub?: string
}

interface Props {
  options: PickerOption[]
  selected: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  /** Résumé affiché sur le bouton (défaut : les libellés cochés, joints). */
  summary?: string
  /** Rendu en bas du panneau (ex. « Autre service… »). */
  footer?: React.ReactNode
  /** Ferme le panneau dès qu'un choix est fait (listes à choix rapide). */
  closeOnSelect?: boolean
}

export default function MultiPicker({
  options, selected, onChange, placeholder = '— Choisir —', summary, footer, closeOnSelect = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // clic à l'extérieur → referme (le panneau vit dans une carte de modal
  // qui défile : pas de fermeture au scroll, sinon on ne peut rien cocher)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
    if (closeOnSelect) setOpen(false)
  }

  const label = summary ?? options.filter((o) => selected.includes(o.id)).map((o) => o.label).join(' + ')

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
          padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#FFF',
          fontSize: 14, cursor: 'pointer', boxSizing: 'border-box',
          color: label ? '#111827' : '#9CA3AF',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label || placeholder}
        </span>
        <ChevronDown size={15} style={{ flexShrink: 0, color: '#9CA3AF', transform: open ? 'rotate(180deg)' : undefined }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 8, marginTop: 4,
          background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 8px 20px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto',
        }}>
          {options.length === 0 && (
            <div style={{ padding: 10, fontSize: 12, color: '#9CA3AF' }}>Aucun choix disponible.</div>
          )}
          {options.map((o) => {
            const on = selected.includes(o.id)
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                  padding: '9px 10px', border: 'none', borderTop: '1px solid #F3F4F6',
                  background: on ? '#69C9CA14' : '#FFF', cursor: 'pointer',
                }}
              >
                <span style={{
                  flex: '0 0 17px', height: 17, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: on ? '1px solid #0E6B6E' : '1px solid #D1D5DB', background: on ? '#0E6B6E' : '#FFF', color: '#FFF',
                }}>
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: on ? 700 : 500, color: '#111827' }}>{o.label}</span>
                  {o.sub && <span style={{ display: 'block', fontSize: 11, color: '#6B7280' }}>{o.sub}</span>}
                </span>
              </button>
            )
          })}
          {footer}
        </div>
      )}
    </div>
  )
}
