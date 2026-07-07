// ============================================================
// QuickBooks Online — sync CRM → QB (Phase 7+).
// Côté serveur UNIQUEMENT (service role + tokens). Ne jamais importer côté client.
// Pousse une soumission (table quotes) dans QuickBooks :
//   type 'devis'   → Estimate
//   type 'facture' → Invoice
// Crée au passage le client (Customer) et un article de service si absents.
// Pas de retour de paiement (décision : envoi unidirectionnel pour l'instant).
// ============================================================
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { refreshTokens, QB_API_BASE } from '@/lib/quickbooks'

const MINOR = '70' // minorversion de l'API comptable QBO

interface Conn { accessToken: string; realmId: string }

const CATEGORY_LABELS: Record<string, string> = {
  fenetre: 'Fenêtres', paysagement: 'Paysagement', projet: 'Projet',
}

// Lit la connexion QB (singleton id=1), rafraîchit le token si expiré, persiste.
// Retourne null si QuickBooks n'est pas connecté.
export async function getValidConnection(): Promise<Conn | null> {
  const { data } = await supabaseAdmin
    .from('quickbooks_connection')
    .select('realm_id, access_token, refresh_token, token_expires_at')
    .eq('id', 1)
    .maybeSingle()
  if (!data?.realm_id || !data.refresh_token) return null

  const exp = data.token_expires_at ? new Date(data.token_expires_at).getTime() : 0
  // token encore valide (marge de 60 s) → on le réutilise
  if (data.access_token && exp > Date.now() + 60_000) {
    return { accessToken: data.access_token, realmId: data.realm_id }
  }
  // sinon on rafraîchit (QBO fait tourner le refresh_token) et on persiste
  const t = await refreshTokens(data.refresh_token)
  const expiresAt = new Date(Date.now() + t.expires_in * 1000).toISOString()
  await supabaseAdmin
    .from('quickbooks_connection')
    .update({ access_token: t.access_token, refresh_token: t.refresh_token, token_expires_at: expiresAt })
    .eq('id', 1)
  return { accessToken: t.access_token, realmId: data.realm_id }
}

// Appel générique à l'API comptable QBO. Throw avec le corps en cas d'erreur.
async function qbFetch(conn: Conn, path: string, init?: RequestInit): Promise<any> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${QB_API_BASE}/v3/company/${conn.realmId}${path}${sep}minorversion=${MINOR}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`QuickBooks ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

// Requête SQL-like QBO (lecture).
function qbQuery(conn: Conn, query: string): Promise<any> {
  return qbFetch(conn, `/query?query=${encodeURIComponent(query)}`)
}

const esc = (s: string) => s.replace(/'/g, "''") // échappe les apostrophes pour le QBO-SQL

interface ClientInfo {
  name: string; email?: string | null; phone?: string | null
  address?: string | null; city?: string | null; postal?: string | null
  qbId?: string | null // clients.quickbooks_id si déjà mappé
}

// Trouve le Customer (par quickbooks_id mappé, sinon DisplayName), sinon le crée.
async function findOrCreateCustomer(conn: Conn, c: ClientInfo): Promise<string> {
  // mapping direct si le client CRM a déjà son Id QBO (vérifié : la connexion a pu changer de compagnie)
  if (c.qbId) {
    const byId = await qbQuery(conn, `select Id from Customer where Id = '${esc(c.qbId)}'`)
    if (byId?.QueryResponse?.Customer?.[0]?.Id) return c.qbId
  }
  const found = await qbQuery(conn, `select Id from Customer where DisplayName = '${esc(c.name)}'`)
  const hit = found?.QueryResponse?.Customer?.[0]
  if (hit?.Id) return hit.Id

  const body: any = { DisplayName: c.name }
  if (c.email) body.PrimaryEmailAddr = { Address: c.email }
  if (c.phone) body.PrimaryPhone = { FreeFormNumber: c.phone }
  if (c.address || c.city || c.postal) {
    body.BillAddr = {
      ...(c.address ? { Line1: c.address } : {}),
      ...(c.city ? { City: c.city } : {}),
      ...(c.postal ? { PostalCode: c.postal } : {}),
    }
  }
  const created = await qbFetch(conn, '/customer', { method: 'POST', body: JSON.stringify(body) })
  return created.Customer.Id
}

// Réutilise le 1er article de type Service ; sinon en crée un rattaché à un compte de revenu.
async function findOrCreateServiceItem(conn: Conn): Promise<string> {
  const found = await qbQuery(conn, `select Id from Item where Type = 'Service' MAXRESULTS 1`)
  const hit = found?.QueryResponse?.Item?.[0]
  if (hit?.Id) return hit.Id

  const acc = await qbQuery(conn, `select Id from Account where AccountType = 'Income' MAXRESULTS 1`)
  const accId = acc?.QueryResponse?.Account?.[0]?.Id
  if (!accId) throw new Error('Aucun compte de revenu dans QuickBooks pour créer un article.')
  const created = await qbFetch(conn, '/item', {
    method: 'POST',
    body: JSON.stringify({ Name: 'Services MW', Type: 'Service', IncomeAccountRef: { value: accId } }),
  })
  return created.Item.Id
}

export interface PushResult {
  ok: boolean
  already?: boolean
  qbId?: string
  docNumber?: string
  entity?: 'Estimate' | 'Invoice'
  error?: string
}

// Pousse une soumission dans QuickBooks. Idempotent : refuse si déjà envoyée (quickbooks_id présent).
export async function pushQuoteToQuickBooks(quoteId: string): Promise<PushResult> {
  const conn = await getValidConnection()
  if (!conn) return { ok: false, error: 'QuickBooks non connecté.' }

  const { data: q } = await supabaseAdmin
    .from('quotes')
    .select('id, client_id, client_name, client_email, service_type, service_category, price, notes, type, quickbooks_id')
    .eq('id', quoteId)
    .single()
  if (!q) return { ok: false, error: 'Soumission introuvable.' }
  if (q.quickbooks_id) return { ok: false, already: true, qbId: q.quickbooks_id, error: 'Déjà envoyée dans QuickBooks.' }

  const amount = Number(q.price)
  if (!amount || amount <= 0) return { ok: false, error: 'Ajoute un prix (> 0) avant d’envoyer dans QuickBooks.' }

  // infos client : table clients si liée, sinon nom libre saisi sur la soumission
  const client: ClientInfo = { name: (q.client_name || '').trim() }
  if (q.client_id) {
    const { data: c } = await supabaseAdmin
      .from('clients')
      .select('name, email, phone, address, city, postal_code, quickbooks_id')
      .eq('id', q.client_id)
      .maybeSingle()
    if (c) {
      client.name = client.name || c.name
      client.email = c.email; client.phone = c.phone
      client.address = c.address; client.city = c.city; client.postal = c.postal_code
      client.qbId = c.quickbooks_id
    }
  }
  if (!client.name) return { ok: false, error: 'Nom du client manquant.' }

  const customerId = await findOrCreateCustomer(conn, client)
  // mémorise le mapping client CRM <-> Customer QBO (utile aux prochains push + à l'import)
  if (q.client_id && client.qbId !== customerId) {
    await supabaseAdmin.from('clients').update({ quickbooks_id: customerId }).eq('id', q.client_id)
  }
  const itemId = await findOrCreateServiceItem(conn)

  const description =
    q.service_type || (q.service_category ? CATEGORY_LABELS[q.service_category] : '') || 'Service'

  const doc: any = {
    CustomerRef: { value: customerId },
    Line: [{
      DetailType: 'SalesItemLineDetail',
      Amount: amount,
      Description: description,
      SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: 1, UnitPrice: amount },
    }],
  }
  if (q.notes) doc.CustomerMemo = { value: q.notes }
  // courriel du destinataire (BillEmail) : celui de la soumission, sinon celui du client
  const billEmail = (q.client_email || client.email || '').trim()
  if (billEmail) doc.BillEmail = { Address: billEmail }

  const isInvoice = q.type === 'facture'
  const res = await qbFetch(conn, isInvoice ? '/invoice' : '/estimate', { method: 'POST', body: JSON.stringify(doc) })
  const obj = isInvoice ? res.Invoice : res.Estimate
  const qbId = obj?.Id as string

  await supabaseAdmin.from('quotes').update({ quickbooks_id: qbId }).eq('id', quoteId)

  return { ok: true, qbId, docNumber: obj?.DocNumber, entity: isInvoice ? 'Invoice' : 'Estimate' }
}

// ============================================================
// Envoi du devis/facture PAR COURRIEL au client, via QuickBooks
// (endpoint /send : QBO génère le PDF et envoie le courriel).
// Pousse d'abord la soumission dans QB si pas encore fait.
// Garde anti double-envoi : quotes.quickbooks_emailed_at.
// ============================================================

export interface SendResult {
  ok: boolean
  already?: boolean // déjà envoyée par courriel
  email?: string
  pushed?: boolean  // la soumission a été poussée dans QB au passage
  error?: string
}

export async function sendQuoteToClient(quoteId: string): Promise<SendResult> {
  const { data: q } = await supabaseAdmin
    .from('quotes')
    .select('id, client_id, client_email, type, status, quickbooks_id, quickbooks_emailed_at')
    .eq('id', quoteId)
    .single()
  if (!q) return { ok: false, error: 'Soumission introuvable.' }
  if (q.quickbooks_emailed_at) return { ok: false, already: true, error: 'Courriel déjà envoyé au client.' }

  // destinataire : courriel de la soumission, sinon celui de la fiche client
  let email = (q.client_email || '').trim()
  if (!email && q.client_id) {
    const { data: c } = await supabaseAdmin.from('clients').select('email').eq('id', q.client_id).maybeSingle()
    email = (c?.email || '').trim()
  }
  if (!email) return { ok: false, error: 'Aucun courriel client (ajoute-le sur la soumission ou la fiche client).' }

  // pousse dans QuickBooks si pas encore synchronisée
  let qbId: string | null = q.quickbooks_id
  let pushed = false
  if (!qbId) {
    const p = await pushQuoteToQuickBooks(quoteId)
    if (!p.ok || !p.qbId) return { ok: false, error: p.error || 'Échec de l’envoi vers QuickBooks.' }
    qbId = p.qbId
    pushed = true
  }

  const conn = await getValidConnection()
  if (!conn) return { ok: false, error: 'QuickBooks non connecté.' }
  const entity = q.type === 'facture' ? 'invoice' : 'estimate'
  // l'endpoint /send exige Content-Type: application/octet-stream (corps vide)
  await qbFetch(conn, `/${entity}/${qbId}/send?sendTo=${encodeURIComponent(email)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
  })

  const patch: Record<string, unknown> = { quickbooks_emailed_at: new Date().toISOString() }
  if (q.status === 'draft') patch.status = 'sent' // un envoi au client = soumission « Envoyée »
  await supabaseAdmin.from('quotes').update(patch).eq('id', quoteId)

  return { ok: true, email, pushed }
}

// ============================================================
// Import QB → CRM : Customers → clients, Estimates/Invoices → quotes.
// Idempotent : match clients par quickbooks_id (puis nom), quotes par
// (quickbooks_id, type). Ne réécrit JAMAIS une donnée CRM existante —
// remplit seulement les champs vides.
// ============================================================

// Pagination QBO (max 1000 lignes par requête).
async function qbQueryAll(conn: Conn, entity: string): Promise<any[]> {
  const PAGE = 1000
  const out: any[] = []
  for (let start = 1; ; start += PAGE) {
    const res = await qbQuery(conn, `select * from ${entity} STARTPOSITION ${start} MAXRESULTS ${PAGE}`)
    const rows = res?.QueryResponse?.[entity] ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

// Même logique que categoryOf (lib/queries/accueil.ts) / mw_service_category() SQL.
function categoryOf(raw: string | null | undefined): string | null {
  const s = (raw || '')
    .toLowerCase()
    .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a')
    .replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o').replace(/[ûüù]/g, 'u')
  if (!s) return null
  if (/fenetre|vitre|window/.test(s)) return 'fenetre'
  if (/gazon|pelouse|paysag|tonte|haie|lawn|landscap/.test(s)) return 'paysagement'
  if (/projet|pave|amenag|muret/.test(s)) return 'projet'
  return null
}

export interface ImportResult {
  ok: boolean
  error?: string
  clientsCreated: number
  clientsUpdated: number
  quotesImported: number   // devis (Estimates)
  invoicesImported: number // factures (Invoices)
  skipped: number          // transactions déjà présentes dans le CRM
}

const EMPTY_IMPORT: ImportResult = {
  ok: false, clientsCreated: 0, clientsUpdated: 0, quotesImported: 0, invoicesImported: 0, skipped: 0,
}

interface CrmClientRow {
  id: string; name: string; quickbooks_id: string | null
  email: string | null; phone: string | null
  address: string | null; city: string | null; postal_code: string | null
  services: string[] | null
}

export async function importFromQuickBooks(): Promise<ImportResult> {
  const conn = await getValidConnection()
  if (!conn) return { ...EMPTY_IMPORT, error: 'QuickBooks non connecté.' }
  const r: ImportResult = { ...EMPTY_IMPORT, ok: true }

  // --- 1. Customers → clients ---
  const customers = await qbQueryAll(conn, 'Customer')
  const { data: crmClients } = await supabaseAdmin
    .from('clients')
    .select('id, name, quickbooks_id, email, phone, address, city, postal_code, services')
  const byQbId = new Map<string, CrmClientRow>()
  const byName = new Map<string, CrmClientRow>()
  for (const c of (crmClients as CrmClientRow[]) ?? []) {
    if (c.quickbooks_id) byQbId.set(c.quickbooks_id, c)
    byName.set(c.name.trim().toLowerCase(), c)
  }

  for (const cu of customers) {
    const name = (cu.DisplayName || '').trim()
    if (!name) continue
    const fields = {
      email: cu.PrimaryEmailAddr?.Address ?? null,
      phone: cu.PrimaryPhone?.FreeFormNumber ?? null,
      address: cu.BillAddr?.Line1 ?? null,
      city: cu.BillAddr?.City ?? null,
      postal_code: cu.BillAddr?.PostalCode ?? null,
    }
    const existing = byQbId.get(cu.Id) ?? byName.get(name.toLowerCase())
    if (existing) {
      // complète seulement ce qui manque côté CRM (jamais d'écrasement)
      const patch: Record<string, unknown> = {}
      if (!existing.quickbooks_id) patch.quickbooks_id = cu.Id
      for (const [k, v] of Object.entries(fields)) {
        if (v && !existing[k as keyof typeof fields]) patch[k] = v
      }
      if (Object.keys(patch).length) {
        const { error } = await supabaseAdmin.from('clients').update(patch).eq('id', existing.id)
        if (!error) { Object.assign(existing, patch); r.clientsUpdated++ }
      }
      existing.quickbooks_id = existing.quickbooks_id || cu.Id
      byQbId.set(cu.Id, existing)
    } else {
      const { data: created, error } = await supabaseAdmin
        .from('clients')
        .insert({ name, quickbooks_id: cu.Id, ...fields, services: [] })
        .select('id, name, quickbooks_id, email, phone, address, city, postal_code, services')
        .single()
      if (!error && created) {
        r.clientsCreated++
        byQbId.set(cu.Id, created as CrmClientRow)
        byName.set(name.toLowerCase(), created as CrmClientRow)
      }
    }
  }

  // --- 2. Estimates + Invoices → quotes (historique des contrats) ---
  const { data: existingQuotes } = await supabaseAdmin
    .from('quotes')
    .select('quickbooks_id, type')
    .not('quickbooks_id', 'is', null)
  const seen = new Set((existingQuotes ?? []).map((q) => `${q.type}:${q.quickbooks_id}`))

  const [estimates, invoices] = await Promise.all([
    qbQueryAll(conn, 'Estimate'),
    qbQueryAll(conn, 'Invoice'),
  ])
  const rows: Record<string, unknown>[] = []
  const servicesToAdd = new Map<string, Set<string>>() // client id → catégories vues

  const collect = (txn: any, type: 'devis' | 'facture') => {
    if (seen.has(`${type}:${txn.Id}`)) { r.skipped++; return }
    // devis converti en facture (LinkedTxn Invoice) : la facture porte déjà le montant
    if (type === 'devis' && (txn.LinkedTxn ?? []).some((l: any) => l.TxnType === 'Invoice')) { r.skipped++; return }
    const client = txn.CustomerRef?.value ? byQbId.get(String(txn.CustomerRef.value)) : undefined
    const desc = (txn.Line ?? []).find((l: any) => l.SalesItemLineDetail)?.Description ?? null
    const category = categoryOf(desc) ?? categoryOf(txn.CustomerMemo?.value)
    const status =
      type === 'facture'
        ? (Number(txn.Balance) === 0 ? 'paid' : 'invoiced')
        : (['Accepted', 'Closed'].includes(txn.TxnStatus) ? 'signed' : 'sent')
    rows.push({
      client_id: client?.id ?? null,
      client_name: client?.name ?? txn.CustomerRef?.name ?? null,
      client_email: txn.BillEmail?.Address ?? null,
      service_type: desc,
      service_category: category,
      price: txn.TotalAmt != null ? Number(txn.TotalAmt) : null,
      notes: txn.CustomerMemo?.value ?? null,
      status,
      type,
      quickbooks_id: txn.Id,
      quickbooks_emailed_at: txn.EmailStatus === 'EmailSent' ? (txn.TxnDate ?? new Date().toISOString()) : null,
      created_at: txn.TxnDate ?? undefined, // date réelle de la transaction QBO
    })
    if (type === 'facture') r.invoicesImported++; else r.quotesImported++
    if (client && category) {
      if (!servicesToAdd.has(client.id)) servicesToAdd.set(client.id, new Set(client.services ?? []))
      servicesToAdd.get(client.id)!.add(category)
    }
  }
  for (const e of estimates) collect(e, 'devis')
  for (const inv of invoices) collect(inv, 'facture')

  if (rows.length) {
    const { error } = await supabaseAdmin.from('quotes').insert(rows)
    if (error) return { ...r, ok: false, error: `Insertion des soumissions : ${error.message}` }
  }

  // --- 3. pastilles de services des clients (fenetre/paysagement/projet) ---
  for (const [clientId, cats] of servicesToAdd) {
    const current = (crmClients as CrmClientRow[] | null)?.find((c) => c.id === clientId)?.services ?? []
    if (Array.from(cats).some((c) => !current.includes(c))) {
      await supabaseAdmin.from('clients').update({ services: Array.from(new Set([...current, ...cats])) }).eq('id', clientId)
    }
  }

  return r
}
