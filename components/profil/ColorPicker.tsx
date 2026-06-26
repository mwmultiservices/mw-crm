'use client'
import { useState } from 'react'
import { VENDOR_COLORS } from '@/lib/colors'

export const PALETTE = VENDOR_COLORS

interface UsedColor { color: string; name: string }

interface Props {
  selectedColor: string
  usedColors: UsedColor[]
  onChange: (color: string) => void
}

export default function ColorPicker({ selectedColor, usedColors, onChange }: Props) {
  const [conflictMsg, setConflictMsg] = useState('')

  const handleClick = (color: string) => {
    const usedBy = usedColors.find(u => u.color === color)
    if (usedBy) {
      setConflictMsg(`Déjà utilisée par ${usedBy.name}`)
      setTimeout(() => setConflictMsg(''), 2500)
      return
    }
    setConflictMsg('')
    onChange(color)
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        {PALETTE.map(color => {
          const usedBy = usedColors.find(u => u.color === color)
          const isSelected = selectedColor === color
          const isTaken = !!usedBy
          return (
            <button
              key={color}
              onClick={() => handleClick(color)}
              title={isTaken ? `Utilisée par ${usedBy!.name}` : color}
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: 10,
                background: color,
                border: 'none',
                cursor: isTaken ? 'not-allowed' : 'pointer',
                opacity: isTaken ? 0.45 : 1,
                boxShadow: isSelected
                  ? `0 0 0 2px white, 0 0 0 4px ${color}`
                  : '0 1px 4px rgba(0,0,0,0.18)',
                transition: 'all 150ms',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                fontSize: 14,
              }}
            >
              {isTaken
                ? <span style={{ fontSize: 13 }}>🔒</span>
                : isSelected
                  ? <span style={{ color: 'white', fontSize: 16, fontWeight: 800, lineHeight: 1 }}>✓</span>
                  : null}
            </button>
          )
        })}
      </div>
      {conflictMsg && (
        <p style={{ color: '#EF4444', fontSize: 12, margin: '8px 0 0', textAlign: 'center', fontWeight: 500 }}>
          {conflictMsg}
        </p>
      )}
    </div>
  )
}
