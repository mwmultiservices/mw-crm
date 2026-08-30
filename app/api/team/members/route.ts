import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdmin } from '@/lib/apiAuth'
import { makeTempPassword } from '@/lib/tempPassword'
import { ROLE_OPTIONS } from '@/lib/roles'

// ============================================================
// /api/team/members — gestion des comptes employés (admin only).
//
//   POST   { full_name, username, role, phone?, color? }  → crée le compte
//   DELETE ?id=<profile_id>                               → supprime le compte
//
// Auth : Authorization: Bearer <access_token> vérifié côté serveur
// (cf. lib/apiAuth) — ces routes créent/détruisent des accès.
// ============================================================

const EMAIL_DOMAIN = 'mwmultiservices.ca'
const VALID_ROLES = ROLE_OPTIONS.map((o) => o.value as string)

// « Jean-Luc Tremblay » → « jean-luc.tremblay » (convention : username = partie
// locale du courriel @mwmultiservices.ca).
function slugUsername(raw: string): string {
  return raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

export async function POST(request: Request) {
  const { caller, error: authError } = await requireAdmin(request)
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const fullName = String(body.full_name ?? '').trim()
  const rawIdent = String(body.username ?? '').trim()
  const role     = String(body.role ?? 'rep')
  const phone    = String(body.phone ?? '').trim() || null
  const color    = String(body.color ?? '').trim() || null

  if (!fullName) return Response.json({ error: 'Nom complet requis' }, { status: 400 })
  if (!rawIdent) return Response.json({ error: 'Identifiant requis' }, { status: 400 })
  if (!VALID_ROLES.includes(role)) return Response.json({ error: 'Rôle invalide' }, { status: 400 })

  // L'admin peut taper un identifiant court OU un courriel complet.
  const isEmail  = rawIdent.includes('@')
  const username = slugUsername(isEmail ? rawIdent.split('@')[0] : rawIdent)
  const email    = (isEmail ? rawIdent : `${username}@${EMAIL_DOMAIN}`).toLowerCase()
  if (!username) return Response.json({ error: 'Identifiant invalide' }, { status: 400 })

  // Doublon d'identifiant : l'index unique partiel sur profiles.username ferait
  // échouer la mise à jour APRÈS la création du compte Auth → on vérifie avant.
  const { data: clash } = await supabaseAdmin
    .from('profiles').select('id').eq('username', username).maybeSingle()
  if (clash) return Response.json({ error: `L'identifiant « ${username} » est déjà pris.` }, { status: 409 })

  const password = makeTempPassword()

  // Le trigger handle_new_user crée la ligne profiles (rôle borné à rep/tech/terrain).
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, color, role: ['rep', 'tech', 'terrain'].includes(role) ? role : 'rep' },
  })
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? ''
    return Response.json(
      { error: /already been registered|already exists/i.test(msg) ? `Un compte existe déjà pour ${email}.` : (msg || 'Création du compte impossible') },
      { status: 400 },
    )
  }
  const profileId = created.user.id

  // Rôle réel + champs complémentaires (service role → contourne l'anti-escalade).
  const { error: profErr } = await supabaseAdmin
    .from('profiles')
    .update({ full_name: fullName, email, role, phone, color, username })
    .eq('id', profileId)

  // Mot de passe temporaire visible par les admins (table optionnelle).
  const { error: credErr } = await supabaseAdmin
    .from('temp_credentials')
    .upsert(
      { profile_id: profileId, password, created_by: caller.id, created_at: new Date().toISOString() },
      { onConflict: 'profile_id' },
    )

  return Response.json({
    ok: true,
    employee: { profile_id: profileId, full_name: fullName, username, email, password },
    // Le compte EXISTE : on signale ce qui n'a pas suivi plutôt que d'échouer.
    warning: profErr
      ? `Compte créé, mais le profil n'a pas pu être complété : ${profErr.message}`
      : credErr
        ? 'Compte créé — le mot de passe n’a pas pu être enregistré (table `temp_credentials` absente ?). Note-le maintenant.'
        : undefined,
  })
}

export async function DELETE(request: Request) {
  const { caller, error: authError } = await requireAdmin(request)
  if (authError) return authError

  const id = new URL(request.url).searchParams.get('id')?.trim()
  if (!id) return Response.json({ error: 'Employé manquant' }, { status: 400 })
  if (id === caller.id) return Response.json({ error: 'Impossible de supprimer son propre compte.' }, { status: 400 })

  const { data: target } = await supabaseAdmin
    .from('profiles').select('full_name').eq('id', id).maybeSingle()

  // Auth → profiles est en ON DELETE CASCADE, comme toutes les tables liées
  // (commissions, timesheets…). Les leads/quotes/jobs passent en rep_id NULL.
  const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(id)
  if (delErr && !/not found/i.test(delErr.message)) {
    return Response.json({ error: delErr.message }, { status: 400 })
  }
  // Compte Auth déjà absent : nettoyer le profil orphelin.
  if (delErr) await supabaseAdmin.from('profiles').delete().eq('id', id)

  return Response.json({ ok: true, full_name: target?.full_name ?? null })
}
