import { pushQuoteToQuickBooks } from '@/lib/quickbooks-sync'

// POST /api/quickbooks/push — envoie une soumission dans QuickBooks.
//   devis → Estimate · facture → Invoice (+ client créé si absent)
// Body : { quoteId }
// Gating : UI réservée aux managers (cf. autres routes : service role, pas de JWT).
export async function POST(request: Request) {
  let body: { quoteId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'JSON invalide' }, { status: 400 })
  }
  if (!body.quoteId) return Response.json({ ok: false, error: 'quoteId requis' }, { status: 400 })

  try {
    const result = await pushQuoteToQuickBooks(body.quoteId)
    return Response.json(result, { status: result.ok ? 200 : 400 })
  } catch (e) {
    console.error('[QuickBooks] push:', e)
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur QuickBooks' },
      { status: 500 }
    )
  }
}
