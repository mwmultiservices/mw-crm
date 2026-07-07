import { supabase } from '@/lib/supabase'

// ============================================================
// Requêtes Soumissions (devis / factures) — table quotes.
// status : draft | sent | signed | invoiced | paid · type : devis | facture
// ============================================================

export interface Quote {
  id: string
  client_id: string | null
  client_name: string | null
  client_email: string | null
  service_type: string | null
  service_category: string | null
  plan: string | null
  price: number | null
  notes: string | null
  status: string
  type: string
  rep_id: string | null
  quickbooks_id: string | null
  quickbooks_emailed_at: string | null
  created_at: string
}

export interface StatusDef { id: string; label: string; bg: string; color: string }

// Cycle de vie d'une soumission (ordre = progression).
export const QUOTE_STATUSES: StatusDef[] = [
  { id: 'draft',    label: 'Brouillon', bg: '#F3F4F6', color: '#6B7280' },
  { id: 'sent',     label: 'Envoyé',    bg: '#FEF3C7', color: '#92400E' },
  { id: 'signed',   label: 'Signé',     bg: '#D1FAE5', color: '#065F46' },
  { id: 'invoiced', label: 'Facturé',   bg: '#DBEAFE', color: '#1E40AF' },
  { id: 'paid',     label: 'Payé',      bg: '#CFFAE1', color: '#047857' },
]
export const STATUS_BY_ID: Record<string, StatusDef> = Object.fromEntries(QUOTE_STATUSES.map((s) => [s.id, s]))
export const STATUS_ORDER = QUOTE_STATUSES.map((s) => s.id)

export function nextStatus(current: string): string | null {
  const i = STATUS_ORDER.indexOf(current)
  return i >= 0 && i < STATUS_ORDER.length - 1 ? STATUS_ORDER[i + 1] : null
}

export const CATEGORY_LABELS: Record<string, string> = {
  fenetre: 'Fenêtres', paysagement: 'Paysagement', projet: 'Projet',
}

const COLS =
  'id, client_id, client_name, client_email, service_type, service_category, plan, price, notes, status, type, rep_id, quickbooks_id, quickbooks_emailed_at, created_at'

export async function getQuotes(repId?: string): Promise<Quote[]> {
  let q = supabase.from('quotes').select(COLS).order('created_at', { ascending: false })
  if (repId) q = q.eq('rep_id', repId)
  const { data } = await q
  return (data as Quote[]) ?? []
}

export interface QuoteInput {
  client_name?: string | null
  client_email?: string | null
  service_type?: string | null
  service_category?: string | null
  plan?: string | null
  price?: number | null
  notes?: string | null
  status?: string
  type?: string
  rep_id?: string | null
}

export async function createQuote(input: QuoteInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('quotes').insert(input)
  return { error: error?.message ?? null }
}
export async function updateQuote(id: string, input: Partial<QuoteInput>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('quotes').update(input).eq('id', id)
  return { error: error?.message ?? null }
}
export async function deleteQuote(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('quotes').delete().eq('id', id)
  return { error: error?.message ?? null }
}
