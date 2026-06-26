'use client'
import { useState, useEffect, useCallback } from 'react'
import * as Q from '@/lib/queries/dashboard'
import { REFRESH_INTERVAL_MS } from '@/lib/config'

export interface ManagerStats {
  portesToday: number
  portesHier: number
  ventesToday: number
  ventesHier: number
  revenusToday: number
  followUpCount: number
  revenus3Jours: number
  revenus7Jours: number
  revenusMois: number
  loading: boolean
}

export function useDashboardManager() {
  const [stats, setStats] = useState<ManagerStats>({
    portesToday: 0,
    portesHier: 0,
    ventesToday: 0,
    ventesHier: 0,
    revenusToday: 0,
    followUpCount: 0,
    revenus3Jours: 0,
    revenus7Jours: 0,
    revenusMois: 0,
    loading: true,
  })
  const [vendeurStats, setVendeurStats] = useState<any[]>([])
  const [dernieresPortes, setDernieresPortes] = useState<any[]>([])
  const [chartData, setChartData] = useState<Array<{ date: string; portes: number; ventes: number }>>([])
  const [vendeurs, setVendeurs] = useState<any[]>([])
  // objectifsJour: objectifs manager du jour par vendeur_id
  const [objectifsJour, setObjectifsJour] = useState<Record<string, { portes: number | null; ventes: number | null }>>({})
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

    const [
      portesToday,
      ventesToday,
      portesHier,
      ventesHier,
      vendeurStatsData,
      dernieresPortesData,
      chartDataResult,
      vendeursData,
      followUpCount,
      revenuePeriods,
      objectifsData,
    ] = await Promise.all([
      Q.getPortesCount(today),
      Q.getVentesCount(today),
      Q.getPortesCount(yesterday),
      Q.getVentesCount(yesterday),
      Q.getVendeurStats(),
      Q.getDernieresPortes(10),
      Q.getPortes7Jours(),
      Q.getAllVendeurs(),
      Q.getFollowUpCount(),
      Q.getRevenuesPeriods(),
      Q.getObjectifsAujourdhui(today),
    ])

    setStats({
      portesToday,
      portesHier,
      ventesToday,
      ventesHier,
      revenusToday: revenuePeriods.today,
      followUpCount,
      revenus3Jours: revenuePeriods.trois_jours,
      revenus7Jours: revenuePeriods.sept_jours,
      revenusMois: revenuePeriods.mois,
      loading: false,
    })
    setVendeurStats(vendeurStatsData)
    setDernieresPortes(dernieresPortesData)
    setChartData(chartDataResult)
    setVendeurs(vendeursData)

    // Indexer les objectifs par vendeur_id
    const objMap: Record<string, { portes: number | null; ventes: number | null }> = {}
    ;(objectifsData as any[]).forEach((o) => {
      if (!objMap[o.vendeur_id]) objMap[o.vendeur_id] = { portes: null, ventes: null }
      if (o.type === 'portes') objMap[o.vendeur_id].portes = o.valeur
      if (o.type === 'ventes') objMap[o.vendeur_id].ventes = o.valeur
    })
    setObjectifsJour(objMap)

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchAll])

  return { stats, vendeurStats, dernieresPortes, chartData, vendeurs, objectifsJour, loading, refetch: fetchAll }
}
