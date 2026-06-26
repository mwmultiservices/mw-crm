'use client'
import React from 'react'

interface ProgressBarProps {
  value: number
  color?: string
  height?: number
  animated?: boolean
  label?: string
}

export default function ProgressBar({
  value,
  color = '#69C9CA',
  height = 8,
  animated = true,
  label,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#374151' }}>{label}</span>
          <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>{Math.round(clamped)}%</span>
        </div>
      )}
      <div
        style={{
          width: '100%',
          height,
          background: '#F3F4F6',
          borderRadius: height,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: '100%',
            background: color,
            borderRadius: height,
            transition: animated ? 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          }}
        />
      </div>
    </div>
  )
}
