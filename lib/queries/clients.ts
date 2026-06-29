import { supabase } from '@/lib/supabase'

// ============================================================
// Requêtes Clients (base des clients réels) — table clients.
// ============================================================

export interface Client {
  id: string
  name: string
  address: string | null
  city: string | null
  postal_code: string | null
  phone: string | null
  email: string | null
  services: string[] | null
  notes: string | null
  num_vitres: number | null
  superficie_pi2: number | null
  created_at: string
}

export interface ClientHistory {
  leads: { id: string; name: string; stage: string; price: number | null; created_at: string }[]
  quotes: { id: string; status: string; price: number | null; service_type: string | null; created_at: string }[]
  jobs: { id: string; title: string | null; type: string; status: string; start_at: string | null }[]
}

const COLS =
  'id, name, address, city, postal_code, phone, email, services, notes, num_vitres, superficie_pi2, created_at'

export async function getClients(): Promise<Client[]> {
  const { data } = await supabase.from('clients').select(COLS).order('name', { ascending: true })
  return (data as Client[]) ?? []
}

export async function getClientHistory(clientId: string): Promise<ClientHistory> {
  const [leads, quotes, jobs] = await Promise.all([
    supabase.from('leads').select('id, name, stage, price, created_at').eq('client_id', clientId).order('created_at', { ascending: false }),
    supabase.from('quotes').select('id, status, price, service_type, created_at').eq('client_id', clientId).order('created_at', { ascending: false }),
    supabase.from('jobs').select('id, title, type, status, start_at').eq('client_id', clientId).order('start_at', { ascending: false }),
  ])
  return {
    leads: (leads.data as ClientHistory['leads']) ?? [],
    quotes: (quotes.data as ClientHistory['quotes']) ?? [],
    jobs: (jobs.data as ClientHistory['jobs']) ?? [],
  }
}

export interface ClientInput {
  name?: string
  address?: string | null
  city?: string | null
  postal_code?: string | null
  phone?: string | null
  email?: string | null
  services?: string[]
  notes?: string | null
  num_vitres?: number | null
  superficie_pi2?: number | null
}

export async function createClient(input: ClientInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('clients').insert(input)
  return { error: error?.message ?? null }
}
export async function updateClient(id: string, input: ClientInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('clients').update(input).eq('id', id)
  return { error: error?.message ?? null }
}
export async function deleteClient(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('clients').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// Lien Google Maps « itinéraire » vers l'adresse du client (ouvre l'app GPS du tél).
export function directionsUrl(c: Pick<Client, 'address' | 'city' | 'postal_code'>): string | null {
  const dest = [c.address, c.city, c.postal_code].filter(Boolean).join(', ').trim()
  if (!dest) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`
}
