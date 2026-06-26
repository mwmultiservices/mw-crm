import { createClient } from '@supabase/supabase-js'

// Client Supabase service-role — UNIQUEMENT côté serveur (routes API).
// Contourne la RLS : ne jamais importer dans du code client.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
