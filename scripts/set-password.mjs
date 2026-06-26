// ============================================================
// Définit un mot de passe + confirme l'email d'un compte (service role).
// Pratique pour débloquer un login quand la confirmation d'email bloque.
//
// USAGE :
//   node --env-file=.env.local scripts/set-password.mjs <email> <motdepasse>
//   node --env-file=.env.local scripts/set-password.mjs --all <motdepasse>   (tous les @mwmultiservices.ca)
// ============================================================

import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (--env-file=.env.local).')
  process.exit(1)
}

const [arg1, arg2] = process.argv.slice(2)
if (!arg1 || !arg2) {
  console.error('Usage : node --env-file=.env.local scripts/set-password.mjs <email|--all> <motdepasse>')
  process.exit(1)
}

const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function allUsers() {
  const users = []
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) break
    page++
  }
  return users
}

async function run() {
  const password = arg2
  const users = await allUsers()
  const targets = arg1 === '--all'
    ? users.filter(u => (u.email || '').endsWith('@mwmultiservices.ca'))
    : users.filter(u => (u.email || '').toLowerCase() === arg1.toLowerCase())

  if (!targets.length) {
    console.error(`Aucun compte trouvé pour "${arg1}".`)
    process.exit(1)
  }

  for (const u of targets) {
    const { error } = await admin.auth.admin.updateUserById(u.id, {
      password,
      email_confirm: true,
    })
    console.log(error ? `  ✗ ${u.email} — ${error.message}` : `  ✓ ${u.email} — mot de passe défini + email confirmé`)
  }
  console.log('\n✓ Terminé.')
}

run().catch(e => { console.error('❌', e); process.exit(1) })
