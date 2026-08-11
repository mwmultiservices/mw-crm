// ============================================================
// Import du tableau Excel « Run de gazon » (CSV) → gazon_terrains + gazon_passages.
// Prérequis : migration_crm_gazon_paye.sql appliquée dans Supabase SQL Editor.
//
// USAGE :
//   node --env-file=.env.local scripts/import-gazon-csv.mjs Run_Gazon_2026_Suivi.csv
//   node --env-file=.env.local scripts/import-gazon-csv.mjs Run_Gazon_2026_Suivi.csv --dry   (parse seulement, rien écrit)
//   node --env-file=.env.local scripts/import-gazon-csv.mjs --wipe                            (vide les 2 tables gazon)
//
// Format attendu (export Excel du client, encodage Windows/Latin-1) :
//   Nom, <notes>, Adresse, P/NP semaine active, 04 May, 11 May, …
//   - ligne SECTEUR = nom en MAJUSCULES sans adresse (ST-LAMBERT, LONGUEUIL, …)
//   - cellule semaine : P/p = fait · NP = pas fait (évité) · ? = incertain (pas importé)
// Ré-exécutable : un terrain déjà présent (même secteur+nom+adresse) est sauté.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (--env-file=.env.local).')
  process.exit(1)
}
const sb = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const WIPE = args.includes('--wipe')
const csvFile = args.find((a) => !a.startsWith('--'))

if (WIPE) {
  const { error: e1 } = await sb.from('gazon_passages').delete().not('id', 'is', null)
  const { error: e2 } = await sb.from('gazon_terrains').delete().not('id', 'is', null)
  if (e1 || e2) { console.error('❌', (e1 ?? e2).message); process.exit(1) }
  console.log('🧹 Tables gazon_passages et gazon_terrains vidées.')
  process.exit(0)
}

if (!csvFile) {
  console.error('❌ Chemin du CSV requis. Ex: node --env-file=.env.local scripts/import-gazon-csv.mjs Run_Gazon_2026_Suivi.csv')
  process.exit(1)
}

// --- lecture + décodage (export Excel = Windows-1252, pas UTF-8) ---
const raw = readFileSync(csvFile)
const text = raw[0] === 0xef && raw[1] === 0xbb
  ? raw.toString('utf8')
  : new TextDecoder('windows-1252').decode(raw)

// --- mini parseur CSV (guillemets, virgules et retours de ligne dans les cellules) ---
function parseCSV(src) {
  const rows = []
  let row = [], cell = '', inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ } else inQuotes = false
      } else cell += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

const rows = parseCSV(text)
if (!rows.length) { console.error('❌ CSV vide.'); process.exit(1) }

// --- en-têtes de semaines : « 04 May » → lundi 2026-05-04 ---
const YEAR = 2026
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const header = rows[0]
const weekCols = [] // { col, week_of }
for (let c = 4; c < header.length; c++) {
  const m = (header[c] ?? '').trim().match(/^(\d{1,2})\s+([A-Za-z]{3})/)
  if (!m) continue
  const month = MONTHS[m[2].toLowerCase()]
  if (!month) continue
  weekCols.push({ col: c, week_of: `${YEAR}-${String(month).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}` })
}
if (!weekCols.length) { console.error('❌ Aucune colonne de semaine reconnue dans l’en-tête.'); process.exit(1) }

// --- parcours des lignes ---
const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const terrains = [] // { secteur, position, name, address, phone, notes, frequency, passages: [{week_of,status,note}] }
let secteur = null
let position = 0

for (let r = 1; r < rows.length; r++) {
  const row = rows[r]
  const name = clean(row[0])
  if (!name) continue
  const notes = clean(row[1])
  const address = clean(row[2])
  const frequency = clean(row[3])

  // ligne secteur : MAJUSCULES, pas d'adresse
  if (!address && name === name.toUpperCase() && /[A-ZÀ-Ü]/.test(name)) {
    secteur = name
    continue
  }
  if (!secteur) secteur = 'AUTRES'

  const passages = []
  for (const { col, week_of } of weekCols) {
    const v = clean(row[col])
    if (!v) continue
    const first = v[0].toUpperCase()
    if (v.toUpperCase().startsWith('NP')) {
      passages.push({ week_of, status: 'evite', note: v.length > 2 ? v : 'NP (import)' })
    } else if (first === 'P') {
      passages.push({ week_of, status: 'fait', note: v.replace(/^p\s*/i, '') ? v : null })
    }
    // '?' et le reste : incertain — pas importé
  }

  position += 10 // pas de 10 → insertion facile entre deux terrains plus tard
  terrains.push({ secteur, position, name, address: address || null, phone: null, notes: notes || null, frequency: frequency || null, passages })
}

const totalPassages = terrains.reduce((s, t) => s + t.passages.length, 0)
const bySector = {}
for (const t of terrains) bySector[t.secteur] = (bySector[t.secteur] ?? 0) + 1
console.log(`📋 Parsé : ${terrains.length} terrains, ${totalPassages} passages, ${weekCols.length} semaines (${weekCols[0].week_of} → ${weekCols[weekCols.length - 1].week_of})`)
for (const [s, n] of Object.entries(bySector)) console.log(`   · ${s} : ${n} terrains`)

if (DRY) {
  for (const t of terrains) console.log(`   [${t.secteur}] ${t.name} — ${t.address ?? 'SANS ADRESSE'} — ${t.passages.length} passages${t.frequency ? ` — (${t.frequency})` : ''}`)
  console.log('🔎 --dry : rien écrit.')
  process.exit(0)
}

// --- import (saute les terrains déjà présents) ---
const { data: existing, error: exErr } = await sb.from('gazon_terrains').select('secteur, name, address')
if (exErr) {
  console.error(`❌ Lecture gazon_terrains impossible : ${exErr.message}`)
  console.error('   → migration_crm_gazon_paye.sql est-elle appliquée dans Supabase SQL Editor ?')
  process.exit(1)
}
const seen = new Set((existing ?? []).map((t) => `${t.secteur}|${t.name}|${t.address ?? ''}`))

let inserted = 0, skipped = 0, passagesInserted = 0
for (const t of terrains) {
  const key = `${t.secteur}|${t.name}|${t.address ?? ''}`
  if (seen.has(key)) { skipped++; continue }
  const { passages, ...terrain } = t
  const { data, error } = await sb.from('gazon_terrains').insert(terrain).select('id').single()
  if (error) { console.error(`❌ ${t.name} : ${error.message}`); continue }
  inserted++
  if (passages.length) {
    const rows = passages.map((p) => ({ terrain_id: data.id, ...p, done_at: `${p.week_of}T12:00:00Z` }))
    const { error: pErr } = await sb.from('gazon_passages').insert(rows)
    if (pErr) console.error(`   ⚠️ passages de ${t.name} : ${pErr.message}`)
    else passagesInserted += rows.length
  }
}

console.log(`✅ Import terminé : ${inserted} terrains insérés, ${skipped} déjà présents (sautés), ${passagesInserted} passages.`)
