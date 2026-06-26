'use client'
import React from 'react'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  delta?: number
  color?: string
  loading?: boolean
}

export default function StatCard({
  title,
  value,
  icon,
  delta,
  color = '#69C9CA',
  loading = false,
}: StatCardProps) {
  if (loading) {
    return (
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: 12,
          padding: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: '#F3F4F6',
            marginBottom: 12,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <div
          style={{
            width: '60%',
            height: 12,
            borderRadius: 6,
            background: '#F3F4F6',
            marginBottom: 8,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <div
          style={{
            width: '40%',
            height: 28,
            borderRadius: 6,
            background: '#F3F4F6',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      </div>
    )
  }

  const deltaBg =
    delta === undefined || delta === 0
      ? '#F3F4F6'
      : delta > 0
      ? '#D1FAE5'
      : '#FEE2E2'
  const deltaColor =
    delta === undefined || delta === 0
      ? '#6B7280'
      : delta > 0
      ? '#065F46'
      : '#991B1B'
  const deltaLabel =
    delta === undefined
      ? null
      : delta > 0
      ? `+${delta}`
      : delta < 0
      ? `${delta}`
      : '0'

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        fontFamily: 'Inter, sans-serif',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: color + '1A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <div style={{ color }}>{icon}</div>
        </div>
        {deltaLabel !== null && (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: deltaBg,
              color: deltaColor,
            }}
          >
            {deltaLabel}
          </span>
        )}
      </div>
      <p
        style={{
          color: '#374151',
          fontSize: 11,
          fontWeight: 600,
          margin: '0 0 4px',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {title}
      </p>
      <p
        style={{
          color: '#111827',
          fontSize: 28,
          fontWeight: 700,
          margin: 0,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>
    </div>
  )
}
