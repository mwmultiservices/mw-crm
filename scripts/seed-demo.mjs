// ============================================================
// Données DÉMO pour tester l'Accueil (Phase 2) — réversible.
// Insère clients / leads / jobs / quotes et enregistre les IDs créés dans
// scripts/.seed-demo-ids.json. `--wipe` supprime exactement ces lignes.
//
// USAGE :
//   node --env-file=.env.local scripts/seed-demo.mjs          (insère)
//   node --env-file=.env.local scripts/seed-demo.mjs --wipe    (supprime)
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (--env-file=.env.local).')
  process.exit(1)
}

const sb = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const __dirname = dirname(fileURLToPath(import.meta.url))
const IDS_FILE = join(__dirname, '.seed-demo-ids.json')

// --- helpers dates ---
const now = new Date()
const at = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString() }
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

// ============================================================
// WIPE
// ============================================================
if (process.argv.includes('--wipe')) {
  if (!existsSync(IDS_FILE)) { console.log('Rien à supprimer (pas de fichier IDs).'); process.exit(0) }
  const ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'))
  // ordre inverse des dépendances : quotes/jobs/leads avant clients
  for (const table of ['quotes', 'jobs', 'leads', 'clients']) {
    const list = ids[table] || []
    if (list.length) {
      const { error } = await sb.from(table).delete().in('id', list)
      console.log(error ? `❌ ${table}: ${error.message}` : `🗑️  ${table}: ${list.length} supprimés`)
    }
  }
  writeFileSync(IDS_FILE, JSON.stringify({}, null, 2))
  console.log('✅ Données démo supprimées.')
  process.exit(0)
}

// ============================================================
// SEED
// ============================================================
const created = { clients: [], leads: [], jobs: [], quotes: [] }

async function insert(table, rows) {
  const { data, error } = await sb.from(table).insert(rows).select('id')
  if (error) { console.error(`❌ ${table}: ${error.message}`); process.exit(1) }
  const ids = data.map((r) => r.id)
  created[table].push(...ids)
  console.log(`✅ ${table}: ${ids.length} insérés`)
  return ids
}

// 1. clients
const [c1, c2, c3, c4] = await insert('clients', [
  { name: 'Tremblay Réno', address: '120 rue des Pins, Magog', phone: '819-555-0101', services: ['fenetre'] },
  { name: 'Boulangerie Côté', address: '8 av. Principale, Sherbrooke', phone: '819-555-0102', services: ['paysagement'] },
  { name: 'Résidence Gagnon', address: '45 ch. du Lac, Orford', phone: '819-555-0103', services: ['projet'] },
  { name: 'Condos Belvédère', address: '300 boul. Bourque, Sherbrooke', phone: '819-555-0104', services: ['paysagement', 'fenetre'] },
])

// 2. leads (répartis dans les stages ; 2 entrants aujourd'hui)
await insert('leads', [
  { name: 'Marc Lavoie', phone: '819-555-0201', source: 'site_web', service: 'Fenêtres', service_category: 'fenetre', stage: 'new', created_at: at(9, 12) },
  { name: 'Julie Roy', phone: '819-555-0202', source: 'meta_ads', service: 'Gazon', service_category: 'paysagement', stage: 'new', created_at: at(11, 30) },
  { name: 'Patrice Hébert', phone: '819-555-0203', source: 'reference', service: 'Fenêtres', service_category: 'fenetre', stage: 'contacted', created_at: daysAgo(2) },
  { name: 'Sophie Bernard', phone: '819-555-0204', source: 'd2d', service: 'Projet', service_category: 'projet', stage: 'quoted', created_at: daysAgo(4) },
  { name: 'Luc Fortin', phone: '819-555-0205', source: 'google_ads', service: 'Gazon', service_category: 'paysagement', stage: 'scheduled', created_at: daysAgo(6) },
  { name: 'Annie Caron', phone: '819-555-0206', source: 'site_web', service: 'Fenêtres', service_category: 'fenetre', stage: 'won', created_at: daysAgo(10) },
  { name: 'David Pelletier', phone: '819-555-0207', source: 'flyers', service: 'Gazon', service_category: 'paysagement', stage: 'lost', created_at: daysAgo(12) },
])

// 3. jobs du jour (différentes heures / équipes / types)
await insert('jobs', [
  { client_id: c1, title: 'Installation 8 fenêtres', service: 'Fenêtres', type: 'fenetre', team: 'equipe1', start_at: at(8, 0), end_at: at(11, 0), status: 'scheduled' },
  { client_id: c4, title: 'Tonte + plate-bandes', service: 'Gazon', type: 'gazon', team: 'equipe2', start_at: at(9, 30), end_at: at(12, 0), status: 'scheduled' },
  { client_id: c3, title: 'Pose de pavé uni', service: 'Aménagement', type: 'projet', team: 'equipe1', start_at: at(13, 0), end_at: at(17, 0), status: 'scheduled' },
  { client_id: c2, title: 'Mesure fenêtres', service: 'Fenêtres', type: 'fenetre', team: 'equipe2', start_at: at(15, 0), end_at: at(16, 0), status: 'scheduled' },
])

// 4. quotes — envoyées en attente (status 'sent') + concrétisées ce mois (revenus)
await insert('quotes', [
  // en attente (âges variés)
  { client_id: c1, client_name: 'Tremblay Réno', service_type: 'Fenêtres', service_category: 'fenetre', price: 8400, status: 'sent', created_at: daysAgo(1) },
  { client_id: c3, client_name: 'Résidence Gagnon', service_type: 'Aménagement paysager', service_category: 'projet', price: 22500, status: 'sent', created_at: daysAgo(5) },
  { client_id: c2, client_name: 'Boulangerie Côté', service_type: 'Entretien gazon (saison)', service_category: 'paysagement', price: 3200, status: 'sent', created_at: daysAgo(0) },
  // concrétisées ce mois-ci → revenus par service
  { client_id: c4, client_name: 'Condos Belvédère', service_type: 'Fenêtres', service_category: 'fenetre', price: 15600, status: 'signed', created_at: daysAgo(8) },
  { client_id: c2, client_name: 'Boulangerie Côté', service_type: 'Gazon', service_category: 'paysagement', price: 4100, status: 'paid', created_at: daysAgo(15) },
  { client_id: c3, client_name: 'Résidence Gagnon', service_type: 'Projet pavé', service_category: 'projet', price: 18900, status: 'invoiced', created_at: daysAgo(20) },
  { client_id: c1, client_name: 'Tremblay Réno', service_type: 'Fenêtres', service_category: 'fenetre', price: 9200, status: 'signed', created_at: daysAgo(3) },
])

writeFileSync(IDS_FILE, JSON.stringify(created, null, 2))
console.log('\n✅ Seed terminé. IDs enregistrés dans scripts/.seed-demo-ids.json')
console.log('   Pour annuler : node --env-file=.env.local scripts/seed-demo.mjs --wipe')
