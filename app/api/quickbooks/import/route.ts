import { importFromQuickBooks } from '@/lib/quickbooks-sync'
import { QuickBooksAuthError } from '@/lib/quickbooks'

// POST /api/quickbooks/import — importe QB → CRM :
//   Customers → clients · Estimates → quotes (devis) · Invoices → quotes (factures)
// Idempotent (relançable) : match par quickbooks_id, ne réécrit pas les données CRM.
// Gating : UI réservée aux managers (cf. autres routes : service role, pas de JWT).
export async function POST() {
  try {
    const result = await importFromQuickBooks()
    return Response.json(result, { status: result.ok ? 200 : 400 })
  } catch (e) {
    console.error('[QuickBooks] import:', e)
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
