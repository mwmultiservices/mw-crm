'use client'
import { useState, useEffect, useCallback } from 'react'
import * as Q from '@/lib/queries/dashboard'

export interface VendeurStats {
  portesToday: number
  portesHier: number
  reponsesToday: number
  reponsesHier: number
  ventesToday: number
  ventesHier: number
  revenusToday: number
  revenusHier: number
  // tauxReponse = réponses / portes (quelqu'un a ouvert la porte)
  tauxReponse: number
  tauxReponseHier: number
  // tauxClosing = ventes / réponses (conversion réelle sur les gens qui ont répondu)
  tauxClosing: number | null
  objectifPortes: number | null
  objectifVentes: number | null
  commissions: number
  suivis: any[]
  loading: boolean
  profile: any | null
  ventesParJour7: Array<{ date: string; montant: number; nbVentes: number }>
}

const defaults: VendeurStats = {
  portesToday: 0,
  portesHier: 0,
  reponsesToday: 0,
  reponsesHier: 0,
  ventesToday: 0,
  ventesHier: 0,
  revenusToday: 0,
  revenusHier: 0,
  tauxReponse: 0,
  tauxReponseHier: 0,
  tauxClosing: null,
  objectifPortes: null,
  objectifVentes: null,
  commissions: 0,
  suivis: [],
  loading: true,
  profile: null,
  ventesParJour7: [],
}

export function useDashboardVendeur(userId: string) {
  const [stats, setStats] = useState<VendeurStats>({ ...defaults, loading: true })

  const fetchAll = useCallback(async () => {
    if (!userId) return

    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

    const [
      profile,
      portesToday,
      ventesToday,
      revenusToday,
      portesHier,
      ventesHier,
      revenusHier,
      reponsesToday,
      reponsesHier,
      suivis,
      ventesParJour7,
      objectifs,
    ] = await Promise.all([
      Q.getProfileForDashboard(userId),
      Q.getPortesCount(today, userId),
      Q.getVentesCount(today, userId),
      Q.getRevenusToday(today, userId),
      Q.getPortesCount(yesterday, userId),
      Q.getVentesCount(yesterday, userId),
      Q.getRevenusToday(yesterday, userId),
      Q.getReponsesCount(today, userId),
      Q.getReponsesCount(yesterday, userId),
      Q.getSuivisVendeur(userId),
      Q.getVentesParJour7(userId),
      Q.getObjectifsVendeurJour(userId, today),
    ])

    // Taux de réponse : personnes ayant répondu / portes cognées
    const tauxReponse = portesToday > 0
      ? Math.round((reponsesToday / portesToday) * 1000) / 10
      : 0
    const tauxReponseHier = portesHier > 0
      ? Math.round((reponsesHier / portesHier) * 1000) / 10
      : 0

    // Taux de closing RÉEL : ventes / réponses (jamais division par zéro)
    const tauxClosing = reponsesToday > 0
      ? Math.round((ventesToday / reponsesToday) * 1000) / 10
      : null

    let commissions = 0
    if (profile) {
      if (profile.commission_type === 'percent') {
        commissions = revenusToday * ((profile.commission_value || 0) / 100)
      } else if (profile.commission_type === 'fixed') {
        commissions = ventesToday * (profile.commission_value || 0)
      }
    }

    setStats({
      portesToday,
      portesHier,
      reponsesToday,
      reponsesHier,
      ventesToday,
      ventesHier,
      revenusToday,
      revenusHier,
      tauxReponse,
      tauxReponseHier,
      tauxClosing,
      objectifPortes: objectifs.portes,
      objectifVentes: objectifs.ventes,
      commissions,
      suivis,
      loading: false,
      profile,
      ventesParJour7,
    })
  }, [userId])

  useEffect(() => {
    if (!userId) return
    fetchAll()
  }, [userId, fetchAll])

  // Refresh quand la fenêtre reprend le focus (le manager vient de modifier les objectifs)
  useEffect(() => {
    if (!userId) return
    const handleFocus = () => { fetchAll() }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [userId, fetchAll])

  return { stats, refetch: fetchAll }
}
