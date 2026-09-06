import { pushClientToQuickBooks } from '@/lib/quickbooks-sync'
import { QuickBooksAuthError } from '@/lib/quickbooks'

// POST /api/quickbooks/client — crée (ou retrouve) le Customer QuickBooks
// d'un client du CRM. Body : { clientId }
// Appelé après « Ajouter nouveau » dans le calendrier : la fiche est déjà
// enregistrée dans Supabase, cet appel est un BONUS (le front n'échoue pas
// si QuickBooks n'est pas connecté).
// Gating : UI (managers + équipe sur le chantier) — service role, pas de JWT,
// comme les autres routes QuickBooks du projet.
export async function POST(request: Request) {
  let body: { clientId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'JSON invalide' }, { status: 400 })
  }
  if (!body.clientId) return Response.json({ ok: false, error: 'clientId requis' }, { status: 400 })

  try {
    const result = await pushClientToQuickBooks(body.clientId)
    return Response.json(result, { status: result.ok ? 200 : 400 })
  } catch (e) {
    console.error('[QuickBooks] client:', e)
    if (e instanceof QuickBooksAuthError) {
      return Response.json(
        { ok: false, error: 'Connexion QuickBooks expirée — reconnecte-toi dans Soumissions.' },
        { status: 401 }
      )
    }
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'Erreur QuickBooks' },
      { status: 500 }
    )
  }
}
