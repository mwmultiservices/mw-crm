'use client'
import { useEffect } from 'react'

// Enregistre le service worker — uniquement hors localhost pour ne pas
// perturber le dev (cache turbopack). Actif en prod (Vercel).
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return
    navigator.serviceWorker.register('/sw.js').catch(() => { /* silencieux */ })
  }, [])
  return null
}
