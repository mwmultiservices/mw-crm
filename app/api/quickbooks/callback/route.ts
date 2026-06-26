import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { exchangeCode } from '@/lib/quickbooks'

// GET /api/quickbooks/callback — retour d'Intuit après consentement.
// Vérifie le state (cookie), échange le code contre des tokens, les stocke
// (service role) puis renvoie vers la page Soumissions.
function cookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie') || ''
  const m = raw.match(new RegExp(`(?:^|; )${name}=([^;]+)`))
  return m ? decodeURIComponent(m[1]) : null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = url.origin
  const back = (status: string) => Response.redirect(`${origin}/soumissions?qb=${status}`, 302)

  const code = url.searchParams.get('code')
  const realmId = url.searchParams.get('realmId')
  const state = url.searchParams.get('state')
  const expected = cookie(request, 'qb_state')

  if (!code || !realmId) return back('error')
  if (!state || state !== expected) return back('state')

  try {
    const tokens = await exchangeCode(code)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    await supabaseAdmin.from('quickbooks_connection').upsert(
      {
        id: 1,
        realm_id: realmId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt,
      },
      { onConflict: 'id' }
    )
    return back('connected')
  } catch (e) {
    console.error('[QuickBooks] callback:', e)
    return back('error')
  }
}
