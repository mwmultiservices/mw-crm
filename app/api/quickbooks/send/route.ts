import { sendQuoteToClient } from '@/lib/quickbooks-sync'

// POST /api/quickbooks/send — envoie le devis/la facture PAR COURRIEL au client
// via QuickBooks (pousse d'abord dans QB si nécessaire). Anti double-envoi.
// Body : { quoteId }
export async function POST(request: Request) {
  let body: { quoteId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'JSON invalide' }, { status: 400 })
  }
  if (!body.quoteId) return Response.json({ ok: false, error: 'quoteId requis' }, { status: 400 })

  try {
    const result = await sendQuoteToClient(body.quoteId)
    return Response.json(result, { status: result.ok ? 200 : 400 })
  } catch (e) {
    console.error('[QuickBooks] send:', e)
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur QuickBooks' },
      { status: 500 }
    )
  }
}
