import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { qbConfigured, QB_ENV } from '@/lib/quickbooks'

// GET /api/quickbooks/status — état de la connexion (sans exposer les tokens).
export async function GET() {
  const configured = qbConfigured()
  let connected = false

  if (configured) {
    const { data } = await supabaseAdmin
      .from('quickbooks_connection')
      .select('realm_id')
      .eq('id', 1)
      .maybeSingle()
    connected = Boolean(data?.realm_id)
  }

  return Response.json({ configured, connected, env: QB_ENV })
}
