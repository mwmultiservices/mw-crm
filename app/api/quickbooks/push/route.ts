import { pushQuoteToQuickBooks } from '@/lib/quickbooks-sync'
import { QuickBooksAuthError } from '@/lib/quickbooks'

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
    // Connexion morte côté Intuit (refresh token expiré/révoqué) : la connexion
    // locale a déjà été effacée par lib/quickbooks-sync — on le signale
    // clairement pour que l'utilisateur se reconnecte plutôt que de retenter.
    if (e instanceof QuickBooksAuthError) {
      return Response.json(
        { ok: false, error: 'Connexion QuickBooks expirée — reconnecte-toi via la barre QuickBooks ci-dessus.' },
        { status: 401 }
      )
    }
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur QuickBooks' },
      { status: 500 }
    )
  }
}
