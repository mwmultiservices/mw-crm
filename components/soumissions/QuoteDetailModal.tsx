'use client'
import { useEffect, useState } from 'react'
import { getQuote, STATUS_BY_ID, CATEGORY_LABELS, type Quote } from '@/lib/queries/soumissions'
import { money } from '@/lib/payes'
import { X } from 'lucide-react'

// ============================================================
// Fiche soumission en LECTURE SEULE.
// Ouverte depuis l'historique d'un client (page Clients) et depuis une job de
// projet au calendrier (bouton « Prévisualiser la soumission », ADMIN seulement
// — elle affiche le prix, que les employés ne doivent pas voir).
// zIndex 60 = au-dessus d'un drawer, au même niveau qu'un modal ; le paramètre
// `stacked` la remonte quand elle s'ouvre PAR-DESSUS un autre modal.
// ============================================================

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })

export default function QuoteDetailModal({ quoteId, stacked = false, onClose }: {
  quoteId: string
  stacked?: boolean
  onClose: () => void
}) {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getQuote(quoteId).then((q) => {
      if (cancelled) return
      setQuote(q)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [quoteId])

  const st = quote ? STATUS_BY_ID[quote.status] : null

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClose() }}
      className="mw-modal-overlay"
      style={stacked ? { zIndex: 70 } : undefined}
    >
      <div onClick={(e) => e.stopPropagation()} className="mw-modal-card" style={{ width: 'min(420px, 100%)' }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Chargement…</div>
        ) : !quote ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Soumission introuvable.</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
                  {quote.type === 'facture' ? 'Facture' : 'Devis'}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>{fmtDate(quote.created_at)}</div>
              </div>
              <button onClick={onClose} aria-label="Fermer" style={iconBtn}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0' }}>
              {st && <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>}
              {quote.price != null && <span style={{ marginLeft: 'auto', fontSize: 22, fontWeight: 800, color: '#0D6E6F' }}>{money(Number(quote.price))}</span>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <DetailRow label="Client" value={quote.client_name || '—'} />
              {quote.client_email && <DetailRow label="Courriel" value={quote.client_email} />}
              <DetailRow label="Service" value={quote.service_type || '—'} />
              {quote.service_category && <DetailRow label="Catégorie" value={CATEGORY_LABELS[quote.service_category] ?? quote.service_category} />}
              {quote.plan && <DetailRow label="Plan" value={quote.plan} />}
              <DetailRow label="QuickBooks" value={quote.quickbooks_id ? `Synchronisé${quote.quickbooks_emailed_at ? ` · envoyé le ${fmtDate(quote.quickbooks_emailed_at)}` : ''}` : 'Non synchronisé'} />
            </div>

            {quote.notes && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Notes</div>
                <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', background: '#F9FAFB', borderRadius: 8, padding: 10 }}>{quote.notes}</div>
              </div>
            )}

            <button onClick={onClose} style={{ ...primaryBtn, width: '100%', justifyContent: 'center', marginTop: 18 }}>Fermer</button>
          </>
        )}
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13 }}>
      <span style={{ flex: '0 0 96px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      {/* pre-wrap : les soumissions importées de QuickBooks ont une description multi-lignes dans service_type */}
      <span style={{ flex: 1, color: '#374151', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{value}</span>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
const iconBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFF', cursor: 'pointer', color: '#374151',
}
