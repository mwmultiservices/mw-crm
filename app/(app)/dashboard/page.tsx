'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import SkeletonDashboard from '@/components/dashboard/shared/SkeletonDashboard'
import VendeurDashboard from '@/components/dashboard/vendeur/VendeurDashboard'
import ManagerDashboard from '@/components/dashboard/manager/ManagerDashboard'
import { isManager } from '@/lib/roles'

export default function DashboardPage() {
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setLoading(false)
        return
      }
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setRole(data?.role ?? 'rep')
          setLoading(false)
        })
    })
  }, [])

  if (loading) return <SkeletonDashboard />

  if (isManager(role)) return <ManagerDashboard />
  return <VendeurDashboard />
}
