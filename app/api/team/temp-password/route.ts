import { randomInt } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// ============================================================
// POST /api/team/temp-password — génère des mots de passe temporaires.
//
// Body : { profile_ids: string[] }  (ou { all: true } pour toute l'équipe)
// Auth : Authorization: Bearer <access_token> de la session appelante.
//        ⚠ Contrairement aux autres routes du projet, celle-ci VÉRIFIE le
//        jeton : elle change des mots de passe, donc une route ouverte
//        serait une prise de contrôle de compte en un curl.
//
// Le mot de passe est appliqué dans Supabase Auth ET stocké en clair dans
// `temp_credentials` (lisible par les admins seulement) pour que le patron
// puisse l'envoyer. Il disparaît dès que l'employé choisit le sien.
// ============================================================

// Alphabet sans caractères ambigus (pas de O/0, I/l/1) — dictable par texto.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function makePassword(): string {
  const pick = (n: number) =>
    Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  return `MW-${pick(4)}-${pick(4)}`
}

export async function POST(request: Request) {
  // --- 1. authentifier l'appelant ---
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) return Response.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
  const caller = userData?.user
  if (userErr || !caller) return Response.json({ error: 'Session invalide' }, { status: 401 })

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', caller.id).single()
  if (!['admin', 'lead', 'manager'].includes(callerProfile?.role ?? '')) {
    return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 })
  }

  // --- 2. cibles ---
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON invalide' }, { status: 400 })
  }

  let ids = Array.isArray(body.profile_ids) ? (body.profile_ids as string[]) : []
  if (body.all === true) {
    const { data } = await supabaseAdmin.from('profiles').select('id').neq('id', caller.id)
    ids = (data ?? []).map((p) => p.id as string)
  }
  ids = [...new Set(ids.filter(Boolean))]
  if (!ids.length) return Response.json({ error: 'Aucun employé ciblé' }, { status: 400 })

  // --- 3. vérifier AVANT de toucher à quoi que ce soit ---
  // Sans la table, on changerait les mots de passe dans Auth sans pouvoir les
  // enregistrer : personne ne pourrait plus se connecter, et le patron n'aurait
  // aucun mot de passe à envoyer. On refuse plutôt que de barrer l'équipe dehors.
  const probe = await supabaseAdmin.from('temp_credentials').select('profile_id').limit(1)
  if (probe.error) {
    return Response.json(
      {
        error: 'Table `temp_credentials` introuvable — applique d\u2019abord ' +
          'migration_crm_salaires.sql dans Supabase → SQL Editor. ' +
          'Aucun mot de passe n\u2019a été changé.',
        detail: probe.error.message,
      },
      { status: 503 },
    )
  }

  // --- 4. générer + appliquer, un employé à la fois ---
  // L'enregistrement suit immédiatement le changement : si un appel échoue en
  // cours de route, les mots de passe déjà changés restent visibles côté admin.
  const results: { profile_id: string; password?: string; error?: string }[] = []
  let count = 0

  for (const id of ids) {
    const password = makePassword()
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password,
      email_confirm: true,
    })
    if (authErr) {
      results.push({ profile_id: id, error: authErr.message })
      continue
    }
    const { error: dbErr } = await supabaseAdmin
      .from('temp_credentials')
      .upsert(
        { profile_id: id, password, created_by: caller.id, created_at: new Date().toISOString() },
        { onConflict: 'profile_id' },
      )
    if (dbErr) {
      // le mot de passe EST changé : le renvoyer pour qu'il ne soit pas perdu
      results.push({ profile_id: id, password, error: `non enregistré : ${dbErr.message}` })
      continue
    }
    count++
    results.push({ profile_id: id, password })
  }

  return Response.json({ ok: true, count, results })
}
