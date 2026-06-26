'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { HOME_BY_ROLE } from '@/lib/nav'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
      router.replace(HOME_BY_ROLE[data?.role ?? 'rep'] ?? '/carte')
    })
  }, [router])

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(160deg, #000 0%, #0D1F1F 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 32, height: 32, border: '3px solid rgba(105,201,202,0.2)',
        borderTopColor: '#69C9CA', borderRadius: '50%',
        animation: 'mw-spin 0.8s linear infinite',
      }} />
    </div>
  )
}
