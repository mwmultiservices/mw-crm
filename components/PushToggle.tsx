'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Bell, BellOff } from 'lucide-react'

// ============================================================
// Bouton « Notifications » — abonne l'appareil au Web Push
// (notification sur l'écran d'accueil quand un client répond par SMS
// ou qu'un nouveau lead entre au pipeline).
// Invisible si non supporté (iOS: la PWA doit être installée) ou si
// les clés VAPID ne sont pas configurées. Sur localhost le service
// worker n'est pas enregistré → le bouton ne s'affiche pas en dev.
// ============================================================

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

type State = 'hidden' | 'off' | 'on' | 'denied' | 'busy'

export default function PushToggle() {
  const [state, setState] = useState<State>('hidden')

  useEffect(() => {
    if (typeof window === 'undefined' || !VAPID_PUBLIC) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      if (!reg) return // pas de SW (dev/localhost)
      if (Notification.permission === 'denied') { setState('denied'); return }
      const sub = await reg.pushManager.getSubscription()
      setState(sub ? 'on' : 'off')
    })
  }, [])

  const enable = async () => {
    setState('busy')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return }
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg) { setState('off'); return }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC!) as BufferSource,
      })
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setState('off'); return }
      const json = sub.toJSON()
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          profile_id: user.id,
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
        },
        { onConflict: 'endpoint' }
      )
      setState(error ? 'off' : 'on')
    } catch {
      setState('off')
    }
  }

  const disable = async () => {
    setState('busy')
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
    } finally {
      setState('off')
    }
  }

  if (state === 'hidden') return null

  const on = state === 'on'
  return (
    <button
      onClick={on ? disable : enable}
      disabled={state === 'busy' || state === 'denied'}
      title={
        state === 'denied'
          ? 'Notifications bloquées dans les réglages du navigateur'
          : on ? 'Notifications activées sur cet appareil — cliquer pour désactiver'
          : 'Recevoir une notification quand un client répond par SMS'
      }
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
        border: `1px solid ${on ? '#69C9CA' : '#D1D5DB'}`, cursor: state === 'denied' ? 'not-allowed' : 'pointer',
        background: on ? 'rgba(105,201,202,0.12)' : '#FFF', color: on ? '#0F766E' : '#374151',
        fontSize: 13, fontWeight: 600, opacity: state === 'busy' ? 0.6 : 1,
      }}
    >
      {on ? <Bell size={15} /> : <BellOff size={15} />}
      {on ? 'Notifs ON' : 'Notifs'}
    </button>
  )
}
