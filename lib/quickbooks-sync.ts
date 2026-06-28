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
}

// Trouve le Customer par DisplayName, sinon le crée. Retourne son Id QBO.
async function findOrCreateCustomer(conn: Conn, c: ClientInfo): Promise<string> {
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
    .select('id, client_id, client_name, service_type, service_category, price, notes, type, quickbooks_id')
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
      .select('name, email, phone, address, city, postal_code')
      .eq('id', q.client_id)
      .maybeSingle()
    if (c) {
      client.name = client.name || c.name
      client.email = c.email; client.phone = c.phone
      client.address = c.address; client.city = c.city; client.postal = c.postal_code
    }
  }
  if (!client.name) return { ok: false, error: 'Nom du client manquant.' }

  const customerId = await findOrCreateCustomer(conn, client)
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

  const isInvoice = q.type === 'facture'
  const res = await qbFetch(conn, isInvoice ? '/invoice' : '/estimate', { method: 'POST', body: JSON.stringify(doc) })
  const obj = isInvoice ? res.Invoice : res.Estimate
  const qbId = obj?.Id as string

  await supabaseAdmin.from('quotes').update({ quickbooks_id: qbId }).eq('id', quoteId)

  return { ok: true, qbId, docNumber: obj?.DocNumber, entity: isInvoice ? 'Invoice' : 'Estimate' }
}
