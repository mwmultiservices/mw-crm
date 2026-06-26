'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getAccueilData, type AccueilData } from '@/lib/queries/accueil'
import { STAGE_IDS, stageLabel } from '@/lib/pipeline'
import StatCard from '@/components/dashboard/shared/StatCard'
import {
  AppWindow, Trees, Hammer, DollarSign, Inbox, CalendarDays, FileText, Clock,
} from 'lucide-react'

// ----------------------------------------------------------------------------
// Accueil (Phase 2) — revenus par service, demandes pipeline, jobs du jour,
// soumissions envoyées en attente.
// ----------------------------------------------------------------------------

const money = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

const TYPE_LABELS: Record<string, string> = { fenetre: 'Fenêtres', gazon: 'Gazon', projet: 'Projet' }
const TYPE_COLORS: Record<string, string> = { fenetre: '#69C9CA', gazon: '#697035', projet: '#8D5D36' }

function timeOf(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
}
function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
}

export default function AccueilPage() {
  const [data, setData] = useState<AccueilData | null>(null)
  const [firstName, setFirstName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('full_name').eq('id', user.id).single()
          .then(({ data: p }) => setFirstName((p?.full_name || '').split(' ')[0] || ''))
      }
    })
    getAccueilData()
      .then(setData)
      .catch((e) => setError(e?.message ?? 'Erreur de chargement'))
  }, [])

  const loading = !data && !error
  const today = new Date().toLocaleDateString('fr-CA', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', maxWidth: 1100, margin: '0 auto', padding: '8px 4px 80px' }}>
      {/* En-tête */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
          {firstName ? `Bonjour, ${firstName}` : 'Accueil'}
        </h1>
        <p style={{ color: '#6B7280', fontSize: 13, margin: '4px 0 0', textTransform: 'capitalize' }}>{today}</p>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 14, borderRadius: 12, fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* 1. Revenus par service (ce mois-ci) */}
      <SectionTitle>Revenus par service · ce mois-ci</SectionTitle>
      <div style={grid4}>
        <StatCard title="Fenêtres" value={data ? money(data.revenue.fenetre) : '—'} icon={<AppWindow size={18} />} color="#69C9CA" loading={loading} />
        <StatCard title="Paysagement" value={data ? money(data.revenue.paysagement) : '—'} icon={<Trees size={18} />} color="#697035" loading={loading} />
        <StatCard title="Projets" value={data ? money(data.revenue.projet) : '—'} icon={<Hammer size={18} />} color="#8D5D36" loading={loading} />
        <StatCard title="Total" value={data ? money(data.revenue.total) : '—'} icon={<DollarSign size={18} />} color="#10B981" loading={loading} />
      </div>

      {/* 2. Demandes pipeline */}
      <SectionTitle>Demandes · pipeline</SectionTitle>
      <Card>
        {loading ? (
          <Skeleton h={60} />
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: '#111827' }}>{data!.leadsTotal}</span>
              <span style={{ fontSize: 13, color: '#6B7280' }}>leads au total</span>
              {data!.leadsToday > 0 && (
                <span style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 999, background: '#D1FAE5', color: '#065F46', fontSize: 12, fontWeight: 600 }}>
                  +{data!.leadsToday} aujourd&apos;hui
                </span>
              )}
            </div>
            {data!.pipeline.length === 0 ? (
              <Empty icon={<Inbox size={20} />} text="Aucun lead dans le pipeline." />
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[...data!.pipeline]
                  .sort((a, b) => STAGE_IDS.indexOf(a.stage) - STAGE_IDS.indexOf(b.stage))
                  .map((p) => (
                    <div key={p.stage} style={{ padding: '8px 14px', borderRadius: 10, background: '#F3F4F6', minWidth: 90 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{p.count}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {stageLabel(p.stage)}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 3 + 4 sur deux colonnes en desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 8 }}>
        {/* Jobs du jour */}
        <div>
          <SectionTitle><CalendarDays size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Jobs du jour</SectionTitle>
          <Card>
            {loading ? (
              <Skeleton h={120} />
            ) : data!.jobsToday.length === 0 ? (
              <Empty icon={<CalendarDays size={20} />} text="Aucun job cédulé aujourd'hui." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data!.jobsToday.map((j) => (
                  <div key={j.id} style={rowStyle}>
                    <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: TYPE_COLORS[j.type] ?? '#69C9CA' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {j.client_name || j.title || 'Sans nom'}
                      </div>
                      <div style={{ fontSize: 12, color: '#6B7280' }}>
                        {TYPE_LABELS[j.type] ?? j.type}{j.team ? ` · ${j.team}` : ''}{j.service ? ` · ${j.service}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                      <Clock size={13} />{timeOf(j.start_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Soumissions en attente */}
        <div>
          <SectionTitle><FileText size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Soumissions en attente</SectionTitle>
          <Card>
            {loading ? (
              <Skeleton h={120} />
            ) : data!.pendingQuotes.length === 0 ? (
              <Empty icon={<FileText size={20} />} text="Aucune soumission en attente." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data!.pendingQuotes.map((q) => {
                  const d = daysAgo(q.created_at)
                  return (
                    <div key={q.id} style={rowStyle}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {q.client_name || 'Client inconnu'}
                        </div>
                        <div style={{ fontSize: 12, color: '#6B7280' }}>
                          {q.service_type || q.service_category || 'Soumission'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {q.price != null && <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{money(q.price)}</div>}
                        <div style={{ fontSize: 11, fontWeight: 600, color: d >= 3 ? '#B45309' : '#9CA3AF' }}>
                          {d === 0 ? "aujourd'hui" : `il y a ${d} j`}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

// --- petits composants de présentation -------------------------------------
const grid4: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 8,
}
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, background: '#F9FAFB',
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '24px 0 12px' }}>
      {children}
    </h2>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      {children}
    </div>
  )
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 0', color: '#9CA3AF' }}>
      {icon}
      <span style={{ fontSize: 13 }}>{text}</span>
    </div>
  )
}

function Skeleton({ h }: { h: number }) {
  return (
    <>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
      <div style={{ height: h, borderRadius: 8, background: '#F3F4F6', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </>
  )
}
