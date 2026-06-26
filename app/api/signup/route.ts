import { supabaseAdmin } from '@/lib/supabaseAdmin'

// ============================================================
// POST /api/signup — inscription sécurisée.
// Le RÔLE n'est plus défini par le client : un rôle élevé (admin/lead) exige
// le code manager validé CÔTÉ SERVEUR (MANAGER_SIGNUP_CODE). Le rôle est posé
// via service role après création (le trigger DB borne le self-signup à rep/tech/terrain).
// Body : { email, password, fullName, color, role, managerCode }
// ============================================================

const SELF_ROLES = ['rep', 'tech', 'terrain']
const ELEVATED_ROLES = ['admin', 'lead']

// Repli sur l'ancien code tant que la variable n'est pas définie (dev).
const MANAGER_CODE = process.env.MANAGER_SIGNUP_CODE || 'MW2024MANAGER'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const fullName = String(body.fullName ?? '').trim()
  const color = (body.color as string) || null
  const role = String(body.role ?? 'rep')
  const managerCode = String(body.managerCode ?? '')

  if (!email || !password) return Response.json({ error: 'Courriel et mot de passe requis' }, { status: 400 })
  if (password.length < 6) return Response.json({ error: 'Mot de passe trop court (min. 6)' }, { status: 400 })
  if (![...SELF_ROLES, ...ELEVATED_ROLES].includes(role)) return Response.json({ error: 'Rôle invalide' }, { status: 400 })

  const elevated = ELEVATED_ROLES.includes(role)
  if (elevated && managerCode !== MANAGER_CODE) {
    return Response.json({ error: 'Code manager invalide' }, { status: 403 })
  }

  // Le trigger handle_new_user bornera le rôle initial à rep/tech/terrain.
  const metaRole = SELF_ROLES.includes(role) ? role : 'rep'
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, color, role: metaRole },
  })
  if (error || !created?.user) {
    return Response.json({ error: error?.message || 'Création du compte impossible' }, { status: 400 })
  }

  // Élévation contrôlée (service role → contourne l'anti-escalade).
  if (elevated) {
    await supabaseAdmin.from('profiles')
      .update({ role, full_name: fullName, color })
      .eq('id', created.user.id)
  }

  return Response.json({ ok: true })
}
