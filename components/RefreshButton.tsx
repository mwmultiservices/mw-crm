'use client'
import { useState } from 'react'
import { RotateCw } from 'lucide-react'

/**
 * Bouton « Rafraîchir ».
 * Sert surtout en PWA installée : pas de barre d'adresse donc pas de bouton
 * de rechargement natif — l'employé devait fermer/rouvrir l'app.
 * Demande aussi au service worker de vérifier une nouvelle version avant le reload.
 *
 * - `floating` (bureau) : rond flottant bas-droite, affiché par .mw-refresh
 *   seulement quand la sidebar est là (cf. globals.css).
 * - `header` (téléphone/tablette) : icône à droite de l'en-tête — rien ne
 *   flotte par-dessus le contenu.
 */
export default function RefreshButton({ variant = 'floating' }: { variant?: 'floating' | 'header' }) {
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      await reg?.update()
    } catch { /* best-effort */ }
    window.location.reload()
  }

  const icon = <RotateCw size={20} style={busy ? { animation: 'mw-spin 0.8s linear infinite' } : undefined} />

  if (variant === 'header') return (
    <button onClick={refresh} disabled={busy} aria-label="Rafraîchir" title="Rafraîchir" style={{
      width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', justifySelf: 'end',
      background: 'transparent', border: 'none', borderRadius: 10, padding: 0,
      color: '#69C9CA', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
    }}>{icon}</button>
  )

  return (
    <button onClick={refresh} disabled={busy} aria-label="Rafraîchir" title="Rafraîchir"
      className="mw-refresh" style={{
        position: 'fixed', right: 'calc(16px + env(safe-area-inset-right))',
        width: 46, height: 46, borderRadius: '50%',
        background: '#0D1F1F', border: '1px solid rgba(105,201,202,0.45)',
        color: '#69C9CA', cursor: busy ? 'default' : 'pointer',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 14px rgba(0,0,0,0.28)', zIndex: 40,
        opacity: busy ? 0.6 : 1,
      }}>
      {icon}
    </button>
  )
}
