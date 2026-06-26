'use client'
import React from 'react'

export default function SkeletonDashboard() {
  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        background: '#F1F2F2',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <style>{`
        @keyframes sk-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .sk { animation: sk-pulse 1.5s ease-in-out infinite; background: #E5E7EB; border-radius: 8px; }
      `}</style>

      {/* Header skeleton */}
      <div
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #E5E7EB',
          padding: '20px 20px 16px',
        }}
      >
        <div className="sk" style={{ width: 160, height: 24, marginBottom: 8 }} />
        <div className="sk" style={{ width: 120, height: 14 }} />
      </div>

      <div style={{ padding: '20px 16px 40px' }}>
        {/* Stats grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 20,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div className="sk" style={{ width: 40, height: 40, borderRadius: 10, marginBottom: 12 }} />
              <div className="sk" style={{ width: '70%', height: 10, marginBottom: 8 }} />
              <div className="sk" style={{ width: '50%', height: 26 }} />
            </div>
          ))}
        </div>

        {/* Progress card */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <div className="sk" style={{ width: 140, height: 16, marginBottom: 12 }} />
          <div className="sk" style={{ width: '100%', height: 8, borderRadius: 4, marginBottom: 8 }} />
          <div className="sk" style={{ width: 80, height: 12 }} />
        </div>

        {/* List items */}
        <div className="sk" style={{ width: 120, height: 14, marginBottom: 12 }} />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div className="sk" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="sk" style={{ width: '60%', height: 12, marginBottom: 6 }} />
              <div className="sk" style={{ width: '40%', height: 10 }} />
            </div>
            <div className="sk" style={{ width: 60, height: 22, borderRadius: 999 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
