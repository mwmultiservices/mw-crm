import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { qbConfigured, revokeToken } from '@/lib/quickbooks'

// POST /api/quickbooks/disconnect — révoque le token chez Intuit (best-effort)
// puis efface le singleton `quickbooks_connection`. Permet de rebrancher un
// autre compte QuickBooks ensuite (bouton « Connecter QuickBooks » réapparaît).
export async function POST() {
  const { data } = await supabaseAdmin
    .from('quickbooks_connection')
    .select('refresh_token')
    .eq('id', 1)
    .maybeSingle()

  if (qbConfigured() && data?.refresh_token) {
    try {
      await revokeToken(data.refresh_token)
    } catch (e) {
      console.error('[QuickBooks] revoke:', e)
      // On efface quand même la connexion locale.
    }
  }

  await supabaseAdmin.from('quickbooks_connection').delete().eq('id', 1)
  return Response.json({ ok: true })
}
