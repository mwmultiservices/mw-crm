'use client'
import { useState } from 'react'
import { RotateCw } from 'lucide-react'

/**
 * Bouton flottant « Rafraîchir » (bas-droite).
 * Sert surtout en PWA installée : pas de barre d'adresse donc pas de bouton
 * de rechargement natif — l'employé devait fermer/rouvrir l'app.
 * Demande aussi au service worker de vérifier une nouvelle version avant le reload.
 */
export default function RefreshButton() {
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      await reg?.update()
    } catch { /* best-effort */ }
    window.location.reload()
  }

  return (
    <button onClick={refresh} disabled={busy} aria-label="Rafraîchir" title="Rafraîchir"
      className="mw-refresh" style={{
        position: 'fixed', right: 'calc(16px + env(safe-area-inset-right))',
        width: 46, height: 46, borderRadius: '50%',
        background: '#0D1F1F', border: '1px solid rgba(105,201,202,0.45)',
        color: '#69C9CA', cursor: busy ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 14px rgba(0,0,0,0.28)', zIndex: 40,
        opacity: busy ? 0.6 : 1,
      }}>
      <RotateCw size={20} style={busy ? { animation: 'mw-spin 0.8s linear infinite' } : undefined} />
    </button>
  )
}
