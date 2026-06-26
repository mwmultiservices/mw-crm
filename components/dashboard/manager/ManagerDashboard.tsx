'use client'
import React, { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, Cell,
} from 'recharts'
import {
  DoorOpen, CheckCircle, DollarSign, Users, Shield, X, RefreshCw,
  ChevronLeft, ChevronRight, Trash2, Bell, MapPin, Phone,
} from 'lucide-react'
import StatCard from '@/components/dashboard/shared/StatCard'
import VendeurCard from '@/components/dashboard/shared/VendeurCard'
import AlertBadge from '@/components/dashboard/shared/AlertBadge'
import SkeletonDashboard from '@/components/dashboard/shared/SkeletonDashboard'
import PeriodNavigator from '@/components/dashboard/PeriodNavigator'
import { useDashboardManager } from '@/lib/hooks/useDashboardManager'
import * as Q from '@/lib/queries/dashboard'
import {
  WORKING_HOURS_START,
  WORKING_HOURS_END,
  LOW_CONVERSION_THRESHOLD,
} from '@/lib/config'
import { supabase } from '@/lib/supabase'
import DoorForm from '@/components/DoorForm'
import { getPinBadge } from '@/lib/colors'
import ObjectifsModal from '@/components/dashboard/manager/ObjectifsModal'

type Tab = 'global' | 'equipe' | 'analytiques' | 'alertes' | 'portes'
type RevenusPeriod = 'today' | '3j' | '7j' | '30j' | 'mois'

const DOORS_PAGE_SIZE = 20

const STATUS_LABELS: Record<string, string> = {
  pas_repondu: 'Sans réponse',
  pas_interesse: 'Pas intéressé',
  interesse: 'Intéressé',
  a_rappeler: 'À rappeler',
  soumission: 'Soumission',
  vendu: 'Vendu',
}

// ── Date range helpers ────────────────────────────────────────

function getPortesVendeurDateRange(
  periodDays: number,
  offset: number
): { dateDebut: string; dateFin: string; label: string } {
  const now = new Date()
  const endDate = new Date(now)
  endDate.setDate(now.getDate() + offset * periodDays)
  const startDate = new Date(endDate)
  startDate.setDate(endDate.getDate() - periodDays + 1)
  return {
    dateDebut: startDate.toISOString().slice(0, 10),
    dateFin: endDate.toISOString().slice(0, 10),
    label: `${startDate.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })} – ${endDate.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}`,
  }
}

function getRevenuDateRange(
  period: RevenusPeriod,
  offset: number
): { dateDebut: string; dateFin: string; label: string } {
  const now = new Date()
  if (period === 'mois') {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return {
      dateDebut: d.toISOString().slice(0, 10),
      dateFin: lastDay.toISOString().slice(0, 10),
      label: d.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' }),
    }
  }
  const daysMap: Record<string, number> = { today: 1, '3j': 3, '7j': 7, '30j': 30 }
  const days = daysMap[period] ?? 7
  const endDate = new Date(now)
  endDate.setDate(now.getDate() + offset * days)
  const startDate = new Date(endDate)
  startDate.setDate(endDate.getDate() - days + 1)
  const label =
    period === 'today'
      ? endDate.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })
      : `${startDate.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })} – ${endDate.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}`
  return {
    dateDebut: startDate.toISOString().slice(0, 10),
    dateFin: endDate.toISOString().slice(0, 10),
    label,
  }
}

// ── Chart data processors ─────────────────────────────────────

interface VendeurRevenuSummary {
  name: string
  color: string
  nbVentes: number
  revenus: number
  commission_type: string
  commission_value: number
}

function processPortesParVendeur(
  rawData: any[],
  dateDebut: string,
  dateFin: string
): { chartData: any[]; vendeurList: { name: string; color: string }[] } {
  const vendeurMap: Record<string, { name: string; color: string }> = {}
  rawData.forEach((d) => {
    const prof = d.profiles as any
    if (prof?.full_name && !vendeurMap[d.user_id]) {
      vendeurMap[d.user_id] = { name: prof.full_name, color: prof.color || '#69C9CA' }
    }
  })

  const dateMap: Record<string, Record<string, number>> = {}
  const cursor = new Date(dateDebut + 'T12:00:00')
  const end = new Date(dateFin + 'T12:00:00')
  while (cursor <= end) {
    dateMap[cursor.toISOString().slice(0, 10)] = {}
    cursor.setDate(cursor.getDate() + 1)
  }

  rawData.forEach((d) => {
    const date = (d.created_at as string).slice(0, 10)
    const prof = d.profiles as any
    const vendeurName = prof?.full_name
    if (dateMap[date] !== undefined && vendeurName) {
      dateMap[date][vendeurName] = (dateMap[date][vendeurName] || 0) + 1
    }
  })

  const chartData = Object.entries(dateMap).map(([date, counts]) => ({
    date: new Date(date + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }),
    ...counts,
  }))

  return { chartData, vendeurList: Object.values(vendeurMap) }
}

function processRevenusParVendeur(rawData: any[]): {
  chartData: any[]
  summaryList: VendeurRevenuSummary[]
  totalRevenus: number
} {
  const summaryMap: Record<string, VendeurRevenuSummary> = {}
  rawData.forEach((d) => {
    const prof = d.profiles as any
    if (!prof?.full_name) return
    if (!summaryMap[d.user_id]) {
      summaryMap[d.user_id] = {
        name: prof.full_name,
        color: prof.color || '#69C9CA',
        nbVentes: 0,
        revenus: 0,
        commission_type: prof.commission_type || 'percent',
        commission_value: Number(prof.commission_value) || 0,
      }
    }
    summaryMap[d.user_id].nbVentes++
    summaryMap[d.user_id].revenus += Number(d.contract_value) || 0
  })
  const summaryList = Object.values(summaryMap)
  const totalRevenus = summaryList.reduce((sum, v) => sum + v.revenus, 0)
  const chartData = summaryList.map((v) => ({ name: v.name.split(' ')[0], revenus: v.revenus, fill: v.color }))
  return { chartData, summaryList, totalRevenus }
}

function getCommissionEstimee(v: VendeurRevenuSummary): number {
  if (v.commission_type === 'percent') return v.revenus * (v.commission_value / 100)
  if (v.commission_type === 'fixed') return v.nbVentes * v.commission_value
  return 0
}

function formatCAD(val: number): string {
  return `${val.toLocaleString('fr-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $`
}

function followUpDateBadge(dateStr: string | null): { text: string; color: string } {
  if (!dateStr) return { text: '', color: '#6B7280' }
  const today = new Date().toISOString().slice(0, 10)
  const d = dateStr.slice(0, 10)
  const label = new Date(d + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })
  if (d < today) return { text: `⚠ En retard — À faire le ${label}`, color: '#EF4444' }
  return { text: `À faire le ${label}`, color: '#F59E0B' }
}

// ═══════════════════════════════════════════════════════════

export default function ManagerDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('global')
  const [selectedVendeur, setSelectedVendeur] = useState<any>(null)
  const [showObjectifsModal, setShowObjectifsModal] = useState(false)
  const [vendeursList, setVendeursList] = useState<any[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [chart30Data, setChart30Data] = useState<Array<{ date: string; portes: number; ventes: number }>>([])
  const [hourData, setHourData] = useState<Array<{ heure: number; count: number }>>([])
  const [vendeurDoors, setVendeurDoors] = useState<any[]>([])
  // objectifs locaux supprimés — objectifsJour vient du hook useDashboardManager

  // Portes tab
  const [allDoors, setAllDoors] = useState<any[]>([])
  const [doorsLoading, setDoorsLoading] = useState(false)
  const [doorsLoaded, setDoorsLoaded] = useState(false)
  const [editDoor, setEditDoor] = useState<any | null>(null)
  const [doorsSearch, setDoorsSearch] = useState('')
  const [doorsVendeur, setDoorsVendeur] = useState('')
  const [doorsStatus, setDoorsStatus] = useState('')
  const [doorsDateFrom, setDoorsDateFrom] = useState('')
  const [doorsDateTo, setDoorsDateTo] = useState('')
  const [doorsPage, setDoorsPage] = useState(1)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteToast, setDeleteToast] = useState('')

  // Analytics: portes par vendeur par jour (Mod 2)
  const [portesVendeurPeriodDays, setPortesVendeurPeriodDays] = useState<7 | 14 | 30>(7)
  const [portesVendeurOffset, setPortesVendeurOffset] = useState(0)
  const [portesParVendeurRaw, setPortesParVendeurRaw] = useState<any[]>([])
  const [portesParVendeurLoading, setPortesParVendeurLoading] = useState(false)

  // Analytics: revenus par vendeur (Mod 3)
  const [revenusVendeurPeriod, setRevenusVendeurPeriod] = useState<RevenusPeriod>('7j')
  const [revenusVendeurOffset, setRevenusVendeurOffset] = useState(0)
  const [revenusParVendeurRaw, setRevenusParVendeurRaw] = useState<any[]>([])
  const [revenusParVendeurLoading, setRevenusParVendeurLoading] = useState(false)

  // Alertes: suivis nécessaires (Mod 5)
  const [followUpDoors, setFollowUpDoors] = useState<any[]>([])
  const [followUpDoorsLoading, setFollowUpDoorsLoading] = useState(false)

  const { stats, vendeurStats, dernieresPortes, chartData, vendeurs, objectifsJour, loading, refetch } =
    useDashboardManager()

  // ── Sync vendeursList from hook data
  useEffect(() => {
    if (vendeurs.length === 0) return
    setVendeursList(vendeurs)
  }, [vendeurs])

  const loadAll = useCallback(async () => {
    setIsRefreshing(true)
    await refetch()
    setIsRefreshing(false)
  }, [refetch])

  // ── Analytics tab data
  useEffect(() => {
    if (activeTab !== 'analytiques') return
    const today = new Date().toISOString().slice(0, 10)
    Q.getPortes30Jours().then(setChart30Data)
    Q.getPortesParHeure(today).then(setHourData)
  }, [activeTab])

  // ── Analytics: portes par vendeur fetch
  const fetchPortesParVendeur = useCallback(async () => {
    if (activeTab !== 'analytiques') return
    setPortesParVendeurLoading(true)
    const { dateDebut, dateFin } = getPortesVendeurDateRange(portesVendeurPeriodDays, portesVendeurOffset)
    const data = await Q.getPortesParVendeurParJour(dateDebut, dateFin)
    setPortesParVendeurRaw(data)
    setPortesParVendeurLoading(false)
  }, [activeTab, portesVendeurPeriodDays, portesVendeurOffset])

  useEffect(() => { fetchPortesParVendeur() }, [fetchPortesParVendeur])

  // ── Analytics: revenus par vendeur fetch
  const fetchRevenusParVendeur = useCallback(async () => {
    if (activeTab !== 'analytiques') return
    setRevenusParVendeurLoading(true)
    const { dateDebut, dateFin } = getRevenuDateRange(revenusVendeurPeriod, revenusVendeurOffset)
    const data = await Q.getRevenusParVendeur(dateDebut, dateFin)
    setRevenusParVendeurRaw(data)
    setRevenusParVendeurLoading(false)
  }, [activeTab, revenusVendeurPeriod, revenusVendeurOffset])

  useEffect(() => { fetchRevenusParVendeur() }, [fetchRevenusParVendeur])

  // ── Alertes: follow-up doors
  useEffect(() => {
    if (activeTab !== 'alertes') return
    setFollowUpDoorsLoading(true)
    Q.getFollowUpDoors().then((data) => {
      setFollowUpDoors(data)
      setFollowUpDoorsLoading(false)
    })
  }, [activeTab])

  const handleVendeurClick = async (v: any) => {
    setSelectedVendeur(v)
    const doors = await Q.getDernieresPortes(10, v.id)
    setVendeurDoors(doors)
  }

  const loadAllDoors = async () => {
    setDoorsLoading(true)
    const { data } = await supabase
      .from('doors')
      .select('*, profiles(full_name, color)')
      .order('created_at', { ascending: false })
    setAllDoors(data || [])
    setDoorsLoading(false)
    setDoorsLoaded(true)
  }

  useEffect(() => {
    if (activeTab === 'portes' && !doorsLoaded) loadAllDoors()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const handleDeleteDoor = async (id: string) => {
    setDeletingId(id)
    await supabase.from('doors').delete().eq('id', id)
    setAllDoors((prev) => prev.filter((d) => d.id !== id))
    setDeletingId(null)
    setConfirmDeleteId(null)
    setDeleteToast('Porte supprimée')
    setTimeout(() => setDeleteToast(''), 2000)
    refetch()
  }

  const todayDate = new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })

  // Performance alerts
  const now = new Date()
  const currentHour = now.getHours()
  const isWorkingHours = currentHour >= WORKING_HOURS_START && currentHour < WORKING_HOURS_END

  const perfAlerts: Array<{ vendeur: any; type: 'warning' | 'danger' | 'info'; alertType: string; description: string }> = []
  vendeurStats.forEach((v) => {
    const totalReponses = v.total_reponses ?? 0
    const totalVentes = v.total_ventes ?? 0
    const portesAujourdhui = v.portes_aujourd_hui ?? 0
    if (isWorkingHours && portesAujourdhui === 0) {
      perfAlerts.push({ vendeur: v, type: 'warning', alertType: 'Inactif', description: `${v.full_name} n'a enregistré aucune porte aujourd'hui.` })
    }
    // Alerte si taux de closing < seuil (sur les réponses, pas les portes totales)
    if (totalReponses > 3 && (totalVentes / totalReponses) * 100 < LOW_CONVERSION_THRESHOLD) {
      perfAlerts.push({ vendeur: v, type: 'danger', alertType: 'Closing faible', description: `Taux de closing: ${Math.round((totalVentes / totalReponses) * 100)}% sur ${totalReponses} réponses (seuil: ${LOW_CONVERSION_THRESHOLD}%)` })
    }
  })

  const totalAlertCount = stats.followUpCount + perfAlerts.length

  const TABS: { key: Tab; label: string }[] = [
    { key: 'global',      label: 'Global' },
    { key: 'equipe',      label: 'Équipe' },
    { key: 'analytiques', label: 'Analytiques' },
    { key: 'alertes',     label: `Alertes${totalAlertCount > 0 ? ` (${totalAlertCount})` : ''}` },
    { key: 'portes',      label: 'Portes' },
  ]

  // Portes tab computed
  const doorsVendeurOptions = Array.from(
    new Map(allDoors.filter((d) => d.profiles?.full_name).map((d: any) => [d.user_id, d.profiles.full_name])).entries()
  ).map(([id, name]) => ({ id: id as string, name: name as string }))

  const doorsFiltered = allDoors.filter((door) => {
    if (doorsSearch && !door.address?.toLowerCase().includes(doorsSearch.toLowerCase())) return false
    if (doorsVendeur && door.user_id !== doorsVendeur) return false
    if (doorsStatus && door.status !== doorsStatus) return false
    if (doorsDateFrom && door.created_at < doorsDateFrom) return false
    if (doorsDateTo && door.created_at > doorsDateTo + 'T23:59:59') return false
    return true
  })
  const doorsTotalPages = Math.max(1, Math.ceil(doorsFiltered.length / DOORS_PAGE_SIZE))
  const doorsPaginated = doorsFiltered.slice((doorsPage - 1) * DOORS_PAGE_SIZE, doorsPage * DOORS_PAGE_SIZE)

  if (loading) return <SkeletonDashboard />

  // Analytics chart data
  const chartDays = chartData.map((d) => ({
    ...d,
    label: new Date(d.date + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric' }),
  }))
  const chart30Days = chart30Data.map((d) => ({
    ...d,
    label: new Date(d.date + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }),
  }))
  const hourChartData = hourData
    .filter((h) => h.heure >= 7 && h.heure <= 21)
    .map((h) => ({ heure: `${h.heure}h`, count: h.count }))
  // Taux de closing RÉEL = ventes / réponses (jamais ventes / portes)
  const conversionByVendeur = vendeurStats
    .filter((v) => (v.total_reponses ?? 0) > 0)
    .map((v) => ({
      name: (v.full_name || '').split(' ')[0],
      taux: Math.round(((v.total_ventes ?? 0) / (v.total_reponses ?? 1)) * 100),
      fill: v.color || '#69C9CA',
    }))

  // Analytics: portes par vendeur processed
  const portesVendeurRange = getPortesVendeurDateRange(portesVendeurPeriodDays, portesVendeurOffset)
  const { chartData: portesParVendeurChart, vendeurList: portesVendeurList } = processPortesParVendeur(
    portesParVendeurRaw,
    portesVendeurRange.dateDebut,
    portesVendeurRange.dateFin
  )

  // Analytics: revenus par vendeur processed
  const revenusVendeurRange = getRevenuDateRange(revenusVendeurPeriod, revenusVendeurOffset)
  const { chartData: revenusChart, summaryList, totalRevenus } = processRevenusParVendeur(revenusParVendeurRaw)

  const CARD_STYLE: React.CSSProperties = {
    background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12,
    padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  }
  const SECTION_TITLE: React.CSSProperties = {
    color: '#374151', fontWeight: 600, fontSize: 13, margin: '0 0 12px',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F1F2F2', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '16px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h1 style={{ color: '#111827', fontWeight: 700, fontSize: 20, margin: '0 0 2px', letterSpacing: '-0.02em' }}>
              Dashboard Manager
            </h1>
            <p style={{ color: '#374151', fontSize: 12, margin: 0 }}>{todayDate}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <style>{`@keyframes mw-spin { to { transform: rotate(360deg) } }`}</style>
            <button onClick={loadAll} disabled={isRefreshing} style={{ background: 'none', border: 'none', cursor: isRefreshing ? 'not-allowed' : 'pointer', padding: 6, color: '#6B7280', display: 'flex', alignItems: 'center', opacity: isRefreshing ? 0.6 : 1 }} title="Actualiser">
              <RefreshCw size={16} style={{ animation: isRefreshing ? 'mw-spin 0.8s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={() => setShowObjectifsModal(true)}
              style={{ background: '#69C9CA', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}
            >
              Objectifs
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flexShrink: 0, padding: '10px 14px', border: 'none', background: 'none',
                borderBottom: activeTab === tab.key ? '2px solid #69C9CA' : '2px solid transparent',
                color: activeTab === tab.key ? '#69C9CA' : '#6B7280',
                fontWeight: activeTab === tab.key ? 600 : 500,
                fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                transition: 'color 150ms ease, border-color 150ms ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ─── GLOBAL ─── */}
        {activeTab === 'global' && (
          <div style={{ padding: '16px 16px 40px' }}>
            {/* Stats 2x2 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <StatCard title="Portes" value={stats.portesToday} icon={<DoorOpen size={18} />} delta={stats.portesToday - stats.portesHier} color="#69C9CA" />
              <StatCard title="Ventes" value={stats.ventesToday} icon={<CheckCircle size={18} />} delta={stats.ventesToday - stats.ventesHier} color="#10B981" />
              <StatCard
                title="Revenus"
                value={stats.revenusToday > 0 ? `${stats.revenusToday.toLocaleString('fr-CA')} $` : '—'}
                icon={<DollarSign size={18} />}
                color="#8B5CF6"
              />
              <StatCard title="Vendeurs" value={vendeursList.length} icon={<Users size={18} />} color="#F59E0B" />
            </div>

            {/* Mod 6: Suivis nécessaires */}
            <div
              onClick={() => setActiveTab('alertes')}
              style={{
                ...CARD_STYLE,
                marginBottom: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 14,
                borderLeft: `4px solid ${stats.followUpCount > 0 ? '#F59E0B' : '#10B981'}`,
              }}
            >
              <Bell size={22} color={stats.followUpCount > 0 ? '#F59E0B' : '#10B981'} />
              <div style={{ flex: 1 }}>
                <p style={{ color: '#6B7280', fontSize: 11, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Suivis nécessaires</p>
                <p style={{ color: stats.followUpCount > 0 ? '#F59E0B' : '#10B981', fontWeight: 700, fontSize: 22, margin: 0 }}>
                  {stats.followUpCount}
                </p>
              </div>
              <ChevronRight size={16} color="#9CA3AF" />
            </div>

            {/* Mod 7: Revenus périodes */}
            <div style={{ ...CARD_STYLE, marginBottom: 16 }}>
              <h2 style={SECTION_TITLE}>Revenus</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: "Aujourd'hui", value: stats.revenusToday },
                  { label: '3 derniers jours', value: stats.revenus3Jours },
                  { label: '7 derniers jours', value: stats.revenus7Jours },
                  { label: 'Mois courant', value: stats.revenusMois },
                ].map((item) => (
                  <div key={item.label} style={{ background: '#F9FAFB', borderRadius: 10, padding: '12px 14px' }}>
                    <p style={{ color: '#6B7280', fontSize: 11, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</p>
                    <p style={{ color: '#111827', fontWeight: 700, fontSize: 16, margin: 0 }}>
                      {item.value > 0 ? formatCAD(item.value) : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 7-day chart */}
            {chartDays.length > 0 && (
              <div style={{ ...CARD_STYLE, marginBottom: 16 }}>
                <h2 style={SECTION_TITLE}>7 derniers jours</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartDays} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7280' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB', fontFamily: 'Inter, sans-serif' }} />
                    <Bar dataKey="portes" name="Portes" fill="#69C9CA" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="ventes" name="Ventes" fill="#10B981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Activité récente */}
            <h2 style={SECTION_TITLE}>Activité récente</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dernieresPortes.map((door: any) => {
                const badge = getPinBadge(door.status)
                const profile = door.profiles as any
                return (
                  <div key={door.id} style={{ background: '#FFFFFF', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: profile?.color || '#69C9CA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {(profile?.full_name || '??').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#374151', fontSize: 11, margin: '0 0 1px' }}>{profile?.full_name || '—'}</p>
                      <p style={{ color: '#111827', fontSize: 12, fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {door.address || door.client_name || '—'}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.color, marginBottom: 2 }}>
                        {STATUS_LABELS[door.status] || door.status}
                      </span>
                      <p style={{ color: '#6B7280', fontSize: 10, margin: 0 }}>
                        {new Date(door.created_at).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                )
              })}
              {dernieresPortes.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#6B7280', fontSize: 14 }}>
                  Aucune porte enregistrée
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── EQUIPE ─── */}
        {activeTab === 'equipe' && (
          <div style={{ padding: '16px 16px 40px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {vendeurStats.map((v) => (
                <VendeurCard
                  key={v.id}
                  vendeur={v}
                  onClick={() => handleVendeurClick(v)}
                  objectifPortes={objectifsJour[v.id]?.portes}
                  objectifVentes={objectifsJour[v.id]?.ventes}
                />
              ))}
              {vendeurStats.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#6B7280', fontSize: 14 }}>Aucun vendeur</div>
              )}
            </div>
          </div>
        )}

        {/* ─── ANALYTIQUES ─── */}
        {activeTab === 'analytiques' && (
          <div style={{ padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Mod 2: Portes par vendeur par jour */}
            <div style={CARD_STYLE}>
              <h2 style={{ ...SECTION_TITLE, marginBottom: 10 }}>Portes cognées par vendeur par jour</h2>
              {/* Period buttons */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {([7, 14, 30] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => { setPortesVendeurPeriodDays(d); setPortesVendeurOffset(0) }}
                    style={{
                      padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                      border: `1px solid ${portesVendeurPeriodDays === d ? '#69C9CA' : '#E5E7EB'}`,
                      background: portesVendeurPeriodDays === d ? '#E8F8F8' : '#FFFFFF',
                      color: portesVendeurPeriodDays === d ? '#0D6E6F' : '#6B7280',
                      cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    {d} jours
                  </button>
                ))}
              </div>
              <PeriodNavigator
                period="week"
                offset={portesVendeurOffset}
                onOffsetChange={setPortesVendeurOffset}
                label={portesVendeurRange.label}
              />
              {portesParVendeurLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                  <div style={{ width: 24, height: 24, border: '3px solid rgba(105,201,202,0.2)', borderTopColor: '#69C9CA', borderRadius: '50%', animation: 'mw-spin 0.8s linear infinite' }} />
                  <style>{`@keyframes mw-spin { to { transform: rotate(360deg) } }`}</style>
                </div>
              ) : portesParVendeurChart.length === 0 || portesVendeurList.length === 0 ? (
                <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Aucune donnée sur cette période</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={portesParVendeurChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E5E7EB', fontFamily: 'Inter, sans-serif' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {portesVendeurList.map((v) => (
                      <Bar key={v.name} dataKey={v.name} fill={v.color} radius={[2, 2, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Mod 3: Revenus par vendeur */}
            <div style={CARD_STYLE}>
              <h2 style={{ ...SECTION_TITLE, marginBottom: 10 }}>Revenus par vendeur</h2>
              {/* Period buttons */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {([
                  { key: 'today', label: "Aujourd'hui" },
                  { key: '3j', label: '3 jours' },
                  { key: '7j', label: '7 jours' },
                  { key: '30j', label: '30 jours' },
                  { key: 'mois', label: 'Mois courant' },
                ] as { key: RevenusPeriod; label: string }[]).map((item) => (
                  <button
                    key={item.key}
                    onClick={() => { setRevenusVendeurPeriod(item.key); setRevenusVendeurOffset(0) }}
                    style={{
                      padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                      border: `1px solid ${revenusVendeurPeriod === item.key ? '#69C9CA' : '#E5E7EB'}`,
                      background: revenusVendeurPeriod === item.key ? '#E8F8F8' : '#FFFFFF',
                      color: revenusVendeurPeriod === item.key ? '#0D6E6F' : '#6B7280',
                      cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <PeriodNavigator
                period={revenusVendeurPeriod === 'mois' ? 'month' : revenusVendeurPeriod === 'today' ? 'day' : 'week'}
                offset={revenusVendeurOffset}
                onOffsetChange={setRevenusVendeurOffset}
                label={revenusVendeurRange.label}
              />
              {/* Total */}
              {totalRevenus > 0 && (
                <p style={{ color: '#111827', fontWeight: 800, fontSize: 24, margin: '0 0 12px', textAlign: 'center' }}>
                  {formatCAD(totalRevenus)}
                </p>
              )}
              {revenusParVendeurLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                  <div style={{ width: 24, height: 24, border: '3px solid rgba(105,201,202,0.2)', borderTopColor: '#69C9CA', borderRadius: '50%', animation: 'mw-spin 0.8s linear infinite' }} />
                </div>
              ) : revenusChart.length === 0 ? (
                <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Aucune vente sur cette période</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={revenusChart} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
                      <Tooltip formatter={(val) => [formatCAD(Number(val) || 0), 'Revenus']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E5E7EB', fontFamily: 'Inter, sans-serif' }} />
                      <Bar dataKey="revenus" radius={[3, 3, 0, 0]}>
                        {revenusChart.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {/* Summary table */}
                  <div style={{ marginTop: 16, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          {['Vendeur', 'Nb ventes', 'Revenus', 'Commission'].map((h) => (
                            <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: '#6B7280', fontWeight: 600, borderBottom: '1px solid #E5E7EB', fontSize: 11 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {summaryList.map((v) => (
                          <tr key={v.name}>
                            <td style={{ padding: '8px 8px', color: '#111827', fontWeight: 500 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: v.color, flexShrink: 0 }} />
                                {v.name.split(' ')[0]}
                              </span>
                            </td>
                            <td style={{ padding: '8px 8px', color: '#374151' }}>{v.nbVentes}</td>
                            <td style={{ padding: '8px 8px', color: '#374151', fontWeight: 600 }}>{formatCAD(v.revenus)}</td>
                            <td style={{ padding: '8px 8px', color: '#8B5CF6', fontWeight: 600 }}>{formatCAD(getCommissionEstimee(v))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Tendance 30 jours */}
            <div style={CARD_STYLE}>
              <h2 style={SECTION_TITLE}>Tendance 30 jours</h2>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chart30Days} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#6B7280' }} interval={Math.floor(chart30Days.length / 6)} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB', fontFamily: 'Inter, sans-serif' }} />
                  <Line type="monotone" dataKey="portes" name="Portes" stroke="#69C9CA" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ventes" name="Ventes" stroke="#10B981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Conversion par vendeur */}
            {conversionByVendeur.length > 0 && (
              <div style={CARD_STYLE}>
                <h2 style={SECTION_TITLE}>Conversion par vendeur</h2>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart layout="vertical" data={conversionByVendeur} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7280' }} unit="%" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} width={60} />
                    <Tooltip formatter={(val) => [`${val}%`, 'Taux']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB', fontFamily: 'Inter, sans-serif' }} />
                    <Bar dataKey="taux" name="Conversion" radius={[0, 4, 4, 0]}>
                      {conversionByVendeur.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Activité par heure */}
            {hourChartData.length > 0 && (
              <div style={CARD_STYLE}>
                <h2 style={SECTION_TITLE}>Activité par heure (aujourd&apos;hui)</h2>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={hourChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="heure" tick={{ fontSize: 9, fill: '#6B7280' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB', fontFamily: 'Inter, sans-serif' }} />
                    <Bar dataKey="count" name="Portes" fill="#69C9CA" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Objectif vs réalisé */}
            {vendeurStats.length > 0 && (
              <div style={CARD_STYLE}>
                <h2 style={SECTION_TITLE}>Objectif vs réalisé (aujourd&apos;hui)</h2>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart
                    data={vendeurStats.map((v) => ({
                      name: (v.full_name || '').split(' ')[0],
                      réalisé: v.portes_aujourd_hui ?? 0,
                      objectif: objectifsJour[v.id]?.portes ?? 0,
                    }))}
                    margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB', fontFamily: 'Inter, sans-serif' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="objectif" name="Objectif" fill="#E5E7EB" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="réalisé" name="Réalisé" fill="#69C9CA" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ─── ALERTES ─── */}
        {activeTab === 'alertes' && (
          <div style={{ padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Mod 5: Suivis en attente */}
            <div>
              <h2 style={SECTION_TITLE}>Suivis en attente</h2>
              {followUpDoorsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                  <div style={{ width: 24, height: 24, border: '3px solid rgba(105,201,202,0.2)', borderTopColor: '#69C9CA', borderRadius: '50%', animation: 'mw-spin 0.8s linear infinite' }} />
                  <style>{`@keyframes mw-spin { to { transform: rotate(360deg) } }`}</style>
                </div>
              ) : followUpDoors.length === 0 ? (
                <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '24px 16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <p style={{ color: '#10B981', fontWeight: 600, fontSize: 14, margin: 0 }}>Aucun suivi en attente ✓</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {followUpDoors.map((door: any) => {
                    const badge = getPinBadge(door.status)
                    const prof = door.profiles as any
                    const fuBadge = followUpDateBadge(door.follow_up_date)
                    return (
                      <div key={door.id} style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                          <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>🔔</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                              {door.client_name && (
                                <p style={{ color: '#111827', fontWeight: 700, fontSize: 14, margin: 0 }}>{door.client_name}</p>
                              )}
                              <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.color }}>
                                {STATUS_LABELS[door.status] || door.status}
                              </span>
                            </div>
                            {door.address && (
                              <p style={{ color: '#374151', fontSize: 12, margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <MapPin size={11} color="#9CA3AF" />
                                {door.address}
                              </p>
                            )}
                            {door.phone && (
                              <p style={{ color: '#374151', fontSize: 12, margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Phone size={11} color="#9CA3AF" />
                                {door.phone}
                              </p>
                            )}
                            {prof?.full_name && (
                              <p style={{ color: '#6B7280', fontSize: 12, margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: prof.color || '#69C9CA', flexShrink: 0 }} />
                                {prof.full_name}
                              </p>
                            )}
                            {fuBadge.text && (
                              <p style={{ color: fuBadge.color, fontSize: 12, margin: '4px 0 0', fontWeight: 500 }}>{fuBadge.text}</p>
                            )}
                            {door.follow_up_note && (
                              <p style={{ color: '#9CA3AF', fontSize: 11, margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {door.follow_up_note}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setEditDoor(door)}
                          style={{ width: '100%', background: '#69C9CA', color: '#000', border: 'none', borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                        >
                          Voir / Modifier
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Alertes performance vendeurs */}
            {perfAlerts.length > 0 && (
              <div>
                <h2 style={SECTION_TITLE}>Alertes vendeurs</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {perfAlerts.map((alert, i) => (
                    <div key={i} style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: alert.vendeur.color || '#69C9CA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                          {(alert.vendeur.full_name || '??').slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ color: '#111827', fontWeight: 600, fontSize: 14, margin: '0 0 2px' }}>{alert.vendeur.full_name}</p>
                          <AlertBadge type={alert.type} label={alert.alertType} />
                        </div>
                      </div>
                      <p style={{ color: '#374151', fontSize: 13, margin: '0 0 10px' }}>{alert.description}</p>
                      <button onClick={() => handleVendeurClick(alert.vendeur)} style={{ background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                        Voir le profil
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {followUpDoors.length === 0 && perfAlerts.length === 0 && !followUpDoorsLoading && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '48px 16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <Shield size={40} color="#10B981" style={{ margin: '0 auto 12px' }} />
                <p style={{ color: '#374151', fontWeight: 600, fontSize: 15, margin: '0 0 4px' }}>Aucune alerte</p>
                <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>Tout se passe bien!</p>
              </div>
            )}
          </div>
        )}

        {/* ─── PORTES ─── */}
        {activeTab === 'portes' && (
          <div style={{ padding: '16px 16px 40px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <input
                type="text" value={doorsSearch} placeholder="Rechercher une adresse..."
                onChange={(e) => { setDoorsSearch(e.target.value); setDoorsPage(1) }}
                style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif', flex: '1 1 180px', minWidth: 0 }}
                onFocus={(e) => { e.target.style.borderColor = '#69C9CA' }}
                onBlur={(e) => { e.target.style.borderColor = '#E5E7EB' }}
              />
              <select value={doorsVendeur} onChange={(e) => { setDoorsVendeur(e.target.value); setDoorsPage(1) }}
                style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif', flex: '1 1 120px', minWidth: 0, background: '#FFF' }}>
                <option value="">Tous les vendeurs</option>
                {doorsVendeurOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <select value={doorsStatus} onChange={(e) => { setDoorsStatus(e.target.value); setDoorsPage(1) }}
                style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif', flex: '1 1 120px', minWidth: 0, background: '#FFF' }}>
                <option value="">Tous les statuts</option>
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input type="date" value={doorsDateFrom} onChange={(e) => { setDoorsDateFrom(e.target.value); setDoorsPage(1) }}
                style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif', flex: '1 1 120px', minWidth: 0 }} />
              <input type="date" value={doorsDateTo} onChange={(e) => { setDoorsDateTo(e.target.value); setDoorsPage(1) }}
                style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif', flex: '1 1 120px', minWidth: 0 }} />
              {(doorsSearch || doorsVendeur || doorsStatus || doorsDateFrom || doorsDateTo) && (
                <button onClick={() => { setDoorsSearch(''); setDoorsVendeur(''); setDoorsStatus(''); setDoorsDateFrom(''); setDoorsDateTo(''); setDoorsPage(1) }}
                  style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer', background: '#F3F4F6', color: '#374151', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
                  Réinitialiser
                </button>
              )}
            </div>

            <p style={{ color: '#6B7280', fontSize: 12, margin: '0 0 10px' }}>{doorsFiltered.length} porte{doorsFiltered.length !== 1 ? 's' : ''}</p>

            {doorsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
                <div style={{ width: 28, height: 28, border: '3px solid rgba(105,201,202,0.2)', borderTopColor: '#69C9CA', borderRadius: '50%', animation: 'mw-spin 0.8s linear infinite' }} />
                <style>{`@keyframes mw-spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : doorsPaginated.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6B7280' }}>
                <p style={{ fontWeight: 500, fontSize: 14, margin: '0 0 4px', color: '#374151' }}>Aucune porte trouvée</p>
                {(doorsSearch || doorsVendeur || doorsStatus || doorsDateFrom || doorsDateTo) && (
                  <p style={{ fontSize: 13, margin: 0 }}>Essayez de réinitialiser les filtres</p>
                )}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {doorsPaginated.map((door: any) => {
                    const badge = getPinBadge(door.status)
                    const prof = door.profiles as any
                    return (
                      <div key={door.id} style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <p style={{ color: '#111827', fontWeight: 600, fontSize: 14, margin: 0, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {door.address || door.client_name || '—'}
                          </p>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.color, flexShrink: 0 }}>
                            {STATUS_LABELS[door.status] || door.status}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: door.service_type || door.client_name ? 4 : 0, flexWrap: 'wrap' }}>
                          {prof?.full_name && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 10, height: 10, borderRadius: '50%', background: prof.color || '#69C9CA' }} />
                              <span style={{ color: '#6B7280', fontSize: 12 }}>{prof.full_name}</span>
                            </span>
                          )}
                          <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                            {new Date(door.created_at).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        {(door.status === 'vendu' && (door.service_type || door.contract_value != null)) && (
                          <p style={{ color: '#065F46', fontSize: 13, margin: '0 0 2px', fontWeight: 600 }}>
                            {door.service_type || ''}{door.contract_value ? ` · ${Number(door.contract_value).toLocaleString('fr-CA')} $` : ''}
                          </p>
                        )}
                        {door.client_name && (
                          <p style={{ color: '#374151', fontSize: 12, margin: '0 0 2px' }}>
                            {door.client_name}{door.phone ? ` · ${door.phone}` : ''}
                          </p>
                        )}
                        {door.notes && (
                          <p style={{ color: '#9CA3AF', fontSize: 11, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {door.notes.length > 60 ? door.notes.slice(0, 60) + '…' : door.notes}
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button onClick={() => setEditDoor(door)} style={{ flex: 1, background: '#69C9CA', color: '#000', border: 'none', borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                            Voir / Modifier
                          </button>
                          <button onClick={() => setConfirmDeleteId(door.id)} style={{ background: 'transparent', border: '1px solid #FCA5A5', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Inter, sans-serif', flexShrink: 0 }}>
                            <Trash2 size={13} />
                            Supprimer
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {doorsTotalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '16px 0 0' }}>
                    <button onClick={() => setDoorsPage((p) => Math.max(1, p - 1))} disabled={doorsPage === 1}
                      style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', cursor: doorsPage === 1 ? 'not-allowed' : 'pointer', opacity: doorsPage === 1 ? 0.5 : 1, display: 'flex', alignItems: 'center' }}>
                      <ChevronLeft size={16} color="#374151" />
                    </button>
                    <span style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>{doorsPage} / {doorsTotalPages}</span>
                    <button onClick={() => setDoorsPage((p) => Math.min(doorsTotalPages, p + 1))} disabled={doorsPage === doorsTotalPages}
                      style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', cursor: doorsPage === doorsTotalPages ? 'not-allowed' : 'pointer', opacity: doorsPage === doorsTotalPages ? 0.5 : 1, display: 'flex', alignItems: 'center' }}>
                      <ChevronRight size={16} color="#374151" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Edit Door Modal */}
      {editDoor && (
        <DoorForm
          coords={{ lat: editDoor.latitude, lng: editDoor.longitude, address: editDoor.address }}
          profile={{}}
          onSave={async () => {
            await loadAllDoors()
            if (activeTab === 'alertes') {
              Q.getFollowUpDoors().then(setFollowUpDoors)
            }
          }}
          onClose={() => setEditDoor(null)}
          mode="edit"
          initialData={editDoor}
        />
      )}

      {/* Delete Confirm Modal */}
      {confirmDeleteId && (() => {
        const door = allDoors.find((d) => d.id === confirmDeleteId)
        if (!door) return null
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 24, maxWidth: 320, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', fontFamily: 'Inter, sans-serif' }}>
              <h3 style={{ color: '#111827', fontWeight: 700, fontSize: 16, margin: '0 0 8px' }}>Supprimer cette porte ?</h3>
              <p style={{ color: '#6B7280', fontSize: 13, margin: '0 0 8px' }}>{door.address || door.client_name || '—'}</p>
              {door.client_name && (
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                  <p style={{ color: '#92400E', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                    ⚠ Cette porte est liée à un client ({door.client_name}). Le client sera retiré de la Base de données.
                  </p>
                </div>
              )}
              <p style={{ color: '#9CA3AF', fontSize: 12, margin: '0 0 20px' }}>Cette action est irréversible.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirmDeleteId(null)} disabled={!!deletingId}
                  style={{ flex: 1, background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif', color: '#374151' }}>
                  Annuler
                </button>
                <button onClick={() => handleDeleteDoor(confirmDeleteId)} disabled={!!deletingId}
                  style={{ flex: 1, background: deletingId ? '#F87171' : '#EF4444', border: 'none', borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 600, cursor: deletingId ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', color: '#FFFFFF' }}>
                  {deletingId ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Delete Toast */}
      {deleteToast && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: '#EF4444', color: '#FFFFFF', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif', zIndex: 10001, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
          ✓ {deleteToast}
        </div>
      )}

      {/* VendeurDetail Modal */}
      {selectedVendeur && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setSelectedVendeur(null)}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px 16px 0 0', width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '20px 16px 40px', fontFamily: 'Inter, sans-serif' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: selectedVendeur.color || '#69C9CA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                {(selectedVendeur.full_name || '??').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ color: '#111827', fontWeight: 700, fontSize: 18, margin: '0 0 2px' }}>{selectedVendeur.full_name}</h2>
                <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>
                  {selectedVendeur.portes_aujourd_hui ?? 0} portes · {selectedVendeur.ventes_aujourd_hui ?? 0} ventes aujourd&apos;hui
                </p>
              </div>
              <button onClick={() => setSelectedVendeur(null)} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} color="#374151" />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Total portes', value: selectedVendeur.total_portes ?? 0, color: '#69C9CA' },
                { label: 'Total ventes', value: selectedVendeur.total_ventes ?? 0, color: '#10B981' },
                {
                  label: 'Taux closing',
                  value: (selectedVendeur.total_reponses ?? 0) > 0
                    ? `${Math.round(((selectedVendeur.total_ventes ?? 0) / (selectedVendeur.total_reponses ?? 1)) * 100)}%`
                    : 'N/A',
                  color: '#3B82F6',
                },
              ].map((s) => (
                <div key={s.label} style={{ background: '#F9FAFB', borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
                  <p style={{ color: s.color, fontWeight: 700, fontSize: 20, margin: '0 0 2px' }}>{s.value}</p>
                  <p style={{ color: '#6B7280', fontSize: 10, margin: 0 }}>{s.label}</p>
                </div>
              ))}
            </div>
            <h3 style={{ color: '#374151', fontWeight: 600, fontSize: 13, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Dernières portes
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {vendeurDoors.map((door: any) => {
                const badge = getPinBadge(door.status)
                return (
                  <div key={door.id} style={{ background: '#F9FAFB', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#111827', fontSize: 13, fontWeight: 500, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {door.client_name || door.address || '—'}
                      </p>
                      <p style={{ color: '#6B7280', fontSize: 11, margin: 0 }}>
                        {new Date(door.created_at).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.color }}>
                        {STATUS_LABELS[door.status] || door.status}
                      </span>
                      {door.contract_value && Number(door.contract_value) > 0 && (
                        <p style={{ color: '#065F46', fontSize: 12, fontWeight: 700, margin: '3px 0 0' }}>
                          {Number(door.contract_value).toLocaleString('fr-CA')} $
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
              {vendeurDoors.length === 0 && (
                <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Aucune porte</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showObjectifsModal && (
        <ObjectifsModal onClose={() => setShowObjectifsModal(false)} />
      )}
    </div>
  )
}
