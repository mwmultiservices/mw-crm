import { supabase } from '@/lib/supabase'

// ============================================================
// Gestion des comptes employés (création / suppression).
// Passe par /api/team/members : la création d'un compte Auth et sa suppression
// exigent le service role, impossible depuis le navigateur.
// ============================================================

export interface NewEmployeeInput {
  full_name: string
  username: string          // identifiant court OU courriel complet
  role: string
  phone?: string | null
  color?: string | null
}

export interface CreatedEmployee {
  profile_id: string
  full_name: string
  username: string
  email: string
  password: string          // mot de passe temporaire à transmettre
}

async function authHeader(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
}

export async function createEmployee(
  input: NewEmployeeInput,
): Promise<{ ok: true; employee: CreatedEmployee; warning?: string } | { ok: false; error: string }> {
  const headers = await authHeader()
  if (!headers) return { ok: false, error: 'Session expirée' }

  const res = await fetch('/api/team/members', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json?.employee) return { ok: false, error: json?.error ?? `Erreur ${res.status}` }
  return { ok: true, employee: json.employee as CreatedEmployee, warning: json.warning }
}

export async function deleteEmployee(profileId: string): Promise<{ ok: boolean; error?: string }> {
  const headers = await authHeader()
  if (!headers) return { ok: false, error: 'Session expirée' }

  const res = await fetch(`/api/team/members?id=${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
    headers,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: json?.error ?? `Erreur ${res.status}` }
  return { ok: true }
}
