// ============================================================
// Phase 0 — Migration des employés du CRM vanille vers Supabase Auth
// ------------------------------------------------------------
// Crée un compte auth.users + une ligne profiles pour chaque employé,
// avec le mapping de rôles unifié. Idempotent : relançable sans dupliquer.
//
// PRÉREQUIS : avoir exécuté migration_crm_core.sql (colonnes profiles).
//
// USAGE (Node 20+) :
//   node --env-file=.env.local scripts/migrate-crm-users.mjs
//
// Variables d'env requises (voir .env.local.example) :
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   <-- clé "service_role" (jamais côté client !)
//
// ⚠️ Les emails sont des PLACEHOLDERS (username@mwmultiservices.ca).
//    Remplace-les par les vrais emails (colonne EMAILS ci-dessous) avant
//    de distribuer les accès, ou demande aux employés un reset de mot de passe.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.')
  console.error('   Lance avec : node --env-file=.env.local scripts/migrate-crm-users.mjs')
  process.exit(1)
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Palette (alignée sur lib/colors.ts VENDOR_COLORS)
const COLORS = [
  '#69C9CA', '#0D6E6F', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#3B82F6', '#EC4899', '#F97316', '#14B8A6', '#6366F1', '#84CC16',
]

// Vrais emails (à compléter). Clé = username. Sinon placeholder généré.
const EMAILS = {
  // 'william.yelle': 'william@mwmultiservices.ca',
}

// Rôle unifié + équipes + défauts de paye, dérivés des USERS du CRM vanille.
// roles: admin | lead | rep | tech | terrain   (legacy manager/vendeur normalisés en Phase 1)
const EMPLOYEES = [
  { username: 'william.yelle',      name: 'William Yelle',        role: 'admin',   teams: ['admin'] },
  { username: 'matis.boulay',       name: 'Matis Boulay',         role: 'admin',   teams: ['admin'] },
  { username: 'will.lowe',          name: 'Will Lowe',            role: 'lead',    teams: ['ventes'],                 commission_type: 'percent', commission_value: 13 },
  { username: 'nathan.quintal',     name: 'Nathan Quintal',       role: 'rep',     teams: ['ventes'],                 commission_type: 'percent', commission_value: 13 },
  { username: 'maxime.santander',   name: 'Maxime Santander',     role: 'rep',     teams: ['ventes'],                 commission_type: 'percent', commission_value: 13 },
  { username: 'marc.yankov',        name: 'Marc Yankov',          role: 'rep',     teams: ['ventes', 'paysagement'],  secondary_role: 'terrain', commission_type: 'percent', commission_value: 13 },
  { username: 'edouard.dufault',    name: 'Édouard Dufault',      role: 'terrain', teams: ['paysagement'],            hourly_rate: 0 },
  { username: 'laurier.st-germain', name: 'Laurier St-Germain',   role: 'terrain', teams: ['paysagement'],            hourly_rate: 0 },
  { username: 'justin.barriere',    name: 'Justin Barrière',      role: 'terrain', teams: ['paysagement'],            hourly_rate: 0 },
  { username: 'maxime.beaupre',     name: 'Maxime Beaupré',       role: 'terrain', teams: ['paysagement'],            hourly_rate: 0 },
  { username: 'otavio.haygert',     name: 'Otavio Haygert Roxo',  role: 'terrain', teams: ['paysagement'],            hourly_rate: 0 },
  { username: 'xavier.chagnon',     name: 'Xavier Chagnon',       role: 'terrain', teams: ['paysagement'],            hourly_rate: 0 },
  { username: 'adrian.bonspille',   name: 'Adrian Bonspille',     role: 'terrain', teams: ['paysagement'],            hourly_rate: 0 },
  { username: 'felix.scully',       name: 'Félix-Antoine Scully', role: 'terrain', teams: ['paysagement'],            hourly_rate: 0 },
  { username: 'victor.mathieu',     name: 'Victor Mathieu',       role: 'tech',    teams: ['fenetres'],               commission_type: 'percent', commission_value: 18 },
  { username: 'manuel.martinez',    name: 'Manuel Martinez',      role: 'tech',    teams: ['fenetres'],               commission_type: 'percent', commission_value: 18 },
  { username: 'maxime.jeffrey',     name: 'Maxime Jeffrey',       role: 'tech',    teams: ['fenetres'],               commission_type: 'percent', commission_value: 18 },
  { username: 'vincent.caya',       name: 'Vincent Caya',         role: 'tech',    teams: ['fenetres'],               commission_type: 'percent', commission_value: 18 },
  { username: 'charles.yelle',      name: 'Charles Yelle',        role: 'tech',    teams: ['fenetres'],               commission_type: 'percent', commission_value: 18 },
  { username: 'robin.bousquet',     name: 'Robin Bousquet',       role: 'tech',    teams: ['fenetres'],               commission_type: 'percent', commission_value: 18 },
]

const emailFor = (u) => EMAILS[u] || `${u}@mwmultiservices.ca`
const tempPassword = () => 'Mw!' + randomBytes(6).toString('base64url')

// Construit la map email -> id des utilisateurs existants (pagination).
async function existingUsersByEmail() {
  const map = new Map()
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) if (u.email) map.set(u.email.toLowerCase(), u.id)
    if (data.users.length < 1000) break
    page++
  }
  return map
}

async function run() {
  console.log(`→ Migration de ${EMPLOYEES.length} employés vers ${URL}\n`)
  const existing = await existingUsersByEmail()
  const credentials = []

  for (let i = 0; i < EMPLOYEES.length; i++) {
    const e = EMPLOYEES[i]
    const email = emailFor(e.username)
    const color = COLORS[i % COLORS.length]

    let userId = existing.get(email.toLowerCase())
    let tempPw = null

    if (!userId) {
      tempPw = tempPassword()
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: tempPw,
        email_confirm: true,
        user_metadata: { full_name: e.name, username: e.username },
      })
      if (error) {
        console.error(`  ✗ ${e.name} (${email}) — création auth échouée : ${error.message}`)
        continue
      }
      userId = data.user.id
      console.log(`  + ${e.name} (${email}) — compte créé`)
    } else {
      console.log(`  = ${e.name} (${email}) — compte existant, profil mis à jour`)
    }

    const profile = {
      id: userId,
      full_name: e.name,
      username: e.username,
      email,
      role: e.role,
      secondary_role: e.secondary_role ?? null,
      teams: e.teams ?? [],
      color,
      active: true,
      commission_type: e.commission_type ?? 'percent',
      commission_value: e.commission_value ?? 0,
      hourly_rate: e.hourly_rate ?? 0,
    }

    const { error: pErr } = await admin.from('profiles').upsert(profile, { onConflict: 'id' })
    if (pErr) console.error(`    ⚠ profil non sauvegardé pour ${e.name} : ${pErr.message}`)

    if (tempPw) credentials.push({ username: e.username, email, tempPw })
  }

  if (credentials.length) {
    console.log('\n=== MOTS DE PASSE TEMPORAIRES (à distribuer, puis reset) ===')
    for (const c of credentials) console.log(`  ${c.email.padEnd(36)}  ${c.tempPw}`)
  }
  console.log('\n✓ Terminé.')
}

run().catch((err) => {
  console.error('❌ Erreur fatale :', err)
  process.exit(1)
})
