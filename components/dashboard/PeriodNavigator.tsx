'use client'
import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  period: 'day' | 'week' | 'month'
  offset: number
  onOffsetChange: (offset: number) => void
  label: string
  minOffset?: number
}

export function computeDateRange(
  period: 'day' | 'week' | 'month',
  offset: number
): { dateDebut: string; dateFin: string; label: string } {
  const now = new Date()

  if (period === 'day') {
    const d = new Date(now)
    d.setDate(d.getDate() + offset)
    const str = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })
    return { dateDebut: str, dateFin: str, label }
  }

  if (period === 'week') {
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(now)
    monday.setDate(now.getDate() + diff + offset * 7)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const label = `Semaine du ${monday.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })} au ${sunday.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })}`
    return {
      dateDebut: monday.toISOString().slice(0, 10),
      dateFin: sunday.toISOString().slice(0, 10),
      label,
    }
  }

  // month
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const label = d.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' })
  return {
    dateDebut: d.toISOString().slice(0, 10),
    dateFin: lastDay.toISOString().slice(0, 10),
    label,
  }
}

export default function PeriodNavigator({ period, offset, onOffsetChange, label, minOffset }: Props) {
  const prevDisabled = minOffset !== undefined && offset <= minOffset
  const nextDisabled = offset === 0

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 12, gap: 8,
    }}>
      <button
        onClick={() => { if (!prevDisabled) onOffsetChange(offset - 1) }}
        disabled={prevDisabled}
        style={{
          background: '#F3F4F6', border: 'none', borderRadius: 8,
          padding: '6px 10px', cursor: prevDisabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', flexShrink: 0,
          opacity: prevDisabled ? 0.4 : 1,
        }}
      >
        <ChevronLeft size={16} color="#374151" />
      </button>
      <span style={{
        color: '#374151', fontSize: 12, fontWeight: 500,
        textAlign: 'center', flex: 1,
      }}>
        {label}
      </span>
      <button
        onClick={() => { if (!nextDisabled) onOffsetChange(offset + 1) }}
        disabled={nextDisabled}
        style={{
          background: '#F3F4F6', border: 'none', borderRadius: 8,
          padding: '6px 10px', cursor: nextDisabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', flexShrink: 0,
          opacity: nextDisabled ? 0.4 : 1,
        }}
      >
        <ChevronRight size={16} color="#374151" />
      </button>
    </div>
  )
}
