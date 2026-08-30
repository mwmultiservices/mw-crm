import { supabaseAdmin } from '@/lib/supabaseAdmin'

// ============================================================
// Authentification des routes API sensibles (équipe, mots de passe).
// La plupart des routes du projet se contentent du gating UI ; celles qui
// créent, suppriment ou réinitialisent un compte DOIVENT vérifier le jeton,
// sinon c'est une prise de contrôle en un curl.
// ============================================================

export interface AdminCaller { id: string; role: string }

// Renvoie l'appelant s'il est admin, sinon la Response d'erreur à retourner tel quel.
export async function requireAdmin(
  request: Request,
): Promise<{ caller: AdminCaller; error?: undefined } | { caller?: undefined; error: Response }> {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) return { error: Response.json({ error: 'Non authentifié' }, { status: 401 }) }

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  const user = data?.user
  if (error || !user) return { error: Response.json({ error: 'Session invalide' }, { status: 401 }) }

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? ''
  if (!['admin', 'lead', 'manager'].includes(role)) {
    return { error: Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 }) }
  }
  return { caller: { id: user.id, role } }
}
