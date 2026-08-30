import { supabase } from '@/lib/supabase'

// ============================================================
// Mots de passe temporaires (table `temp_credentials`).
// RLS : SELECT réservé aux admins, DELETE = sa propre ligne ou admin.
// L'écriture passe par /api/team/temp-password (service role, jeton vérifié).
// ============================================================

export interface TempCredential {
  profile_id: string
  password: string
  created_at: string
}

// Map profile_id → mot de passe temporaire encore actif. Vide (sans planter)
// si la migration n'est pas appliquée ou si l'appelant n'est pas admin.
export async function getTempPasswords(): Promise<Map<string, TempCredential>> {
  const { data } = await supabase.from('temp_credentials').select('*')
  return new Map((data as TempCredential[] | null ?? []).map((c) => [c.profile_id, c]))
}

// Génère de nouveaux mots de passe temporaires (admin). `all` = toute l'équipe.
export async function generateTempPasswords(
  target: { profileIds?: string[]; all?: boolean },
): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, count: 0, error: 'Session expirée' }

  const res = await fetch('/api/team/temp-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ profile_ids: target.profileIds ?? [], all: target.all === true }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, count: 0, error: json?.error ?? `Erreur ${res.status}` }
  return { ok: true, count: json.count ?? 0 }
}

// Change SON propre mot de passe (session authentifiée → sûr) puis efface la
// ligne temporaire : le mot de passe choisi n'est jamais visible sur le site.
export async function setMyPassword(password: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Session expirée' }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { ok: false, error: error.message }

  // best-effort : la ligne peut ne pas exister (ou la table pas encore créée)
  await supabase.from('temp_credentials').delete().eq('profile_id', user.id)
  return { ok: true }
}
