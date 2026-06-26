'use client'
import React from 'react'

interface AlertBadgeProps {
  type: 'warning' | 'danger' | 'info' | 'success'
  label: string
}

const BADGE_STYLES: Record<AlertBadgeProps['type'], { bg: string; color: string }> = {
  warning: { bg: '#FEF3C7', color: '#92400E' },
  danger: { bg: '#FEE2E2', color: '#991B1B' },
  info: { bg: '#E0F2FE', color: '#075985' },
  success: { bg: '#D1FAE5', color: '#065F46' },
}

export default function AlertBadge({ type, label }: AlertBadgeProps) {
  const { bg, color } = BADGE_STYLES[type]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: bg,
        color,
        fontFamily: 'Inter, sans-serif',
        letterSpacing: '0.02em',
      }}
    >
      {label}
    </span>
  )
}
