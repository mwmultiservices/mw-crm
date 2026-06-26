'use client'
import { supabase } from '@/lib/supabase'
import { isSeller } from '@/lib/roles'

// SQL to create objectifs table (run in Supabase SQL editor if not exists):
// CREATE TABLE IF NOT EXISTS objectifs (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   vendeur_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
//   manager_id UUID REFERENCES profiles(id),
//   date DATE NOT NULL,
//   objectif_portes INTEGER NOT NULL DEFAULT 20,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   UNIQUE(vendeur_id, date)
// );

export async function getPortesCount(date: string, userId?: string): Promise<number> {
  let query = supabase
    .from('doors')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', `${date}T00:00:00`)
    .lt('created_at', `${date}T23:59:59.999`)

  if (userId) query = query.eq('user_id', userId)

  const { count } = await query
  return count ?? 0
}

export async function getVentesCount(date: string, userId?: string): Promise<number> {
  let query = supabase
    .from('doors')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'vendu')
    .gte('created_at', `${date}T00:00:00`)
    .lt('created_at', `${date}T23:59:59.999`)

  if (userId) query = query.eq('user_id', userId)

  const { count } = await query
  return count ?? 0
}

// Réponses = portes où quelqu'un a ouvert (tout statut sauf 'pas_repondu')
export async function getReponsesCount(date: string, userId?: string): Promise<number> {
  let query = supabase
    .from('doors')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'pas_repondu')
    .gte('created_at', `${date}T00:00:00`)
    .lt('created_at', `${date}T23:59:59.999`)

  if (userId) query = query.eq('user_id', userId)

  const { count } = await query
  return count ?? 0
}

export async function getRevenusToday(date: string, userId?: string): Promise<number> {
  let query = supabase
    .from('doors')
    .select('contract_value')
    .eq('status', 'vendu')
    .gte('created_at', `${date}T00:00:00`)
    .lt('created_at', `${date}T23:59:59.999`)

  if (userId) query = query.eq('user_id', userId)

  const { data } = await query
  if (!data) return 0
  return data.reduce((sum, d) => sum + (Number(d.contract_value) || 0), 0)
}

export async function getPortes7Jours(
  userId?: string
): Promise<Array<{ date: string; portes: number; ventes: number }>> {
  const end = new Date()
  const start = new Date(Date.now() - 6 * 86400000)
  const startStr = start.toISOString().slice(0, 10)
  const endStr = end.toISOString().slice(0, 10)

  let query = supabase
    .from('doors')
    .select('created_at, status')
    .gte('created_at', `${startStr}T00:00:00`)
    .lte('created_at', `${endStr}T23:59:59.999`)

  if (userId) query = query.eq('user_id', userId)

  const { data } = await query
  if (!data) return []

  const map: Record<string, { portes: number; ventes: number }> = {}
  for (let i = 0; i <= 6; i++) {
    const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10)
    map[d] = { portes: 0, ventes: 0 }
  }

  for (const door of data) {
    const day = door.created_at.slice(0, 10)
    if (map[day]) {
      map[day].portes++
      if (door.status === 'vendu') map[day].ventes++
    }
  }

  return Object.entries(map).map(([date, v]) => ({ date, ...v }))
}

export async function getPortes30Jours(
  userId?: string
): Promise<Array<{ date: string; portes: number; ventes: number }>> {
  const end = new Date()
  const start = new Date(Date.now() - 29 * 86400000)
  const startStr = start.toISOString().slice(0, 10)
  const endStr = end.toISOString().slice(0, 10)

  let query = supabase
    .from('doors')
    .select('created_at, status')
    .gte('created_at', `${startStr}T00:00:00`)
    .lte('created_at', `${endStr}T23:59:59.999`)

  if (userId) query = query.eq('user_id', userId)

  const { data } = await query
  if (!data) return []

  const map: Record<string, { portes: number; ventes: number }> = {}
  for (let i = 0; i <= 29; i++) {
    const d = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10)
    map[d] = { portes: 0, ventes: 0 }
  }

  for (const door of data) {
    const day = door.created_at.slice(0, 10)
    if (map[day]) {
      map[day].portes++
      if (door.status === 'vendu') map[day].ventes++
    }
  }

  return Object.entries(map).map(([date, v]) => ({ date, ...v }))
}

export async function getObjectifJour(vendeurId: string, date: string): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('objectifs')
      .select('objectif_portes')
      .eq('vendeur_id', vendeurId)
      .eq('date', date)
      .maybeSingle()

    if (error) return null
    return data?.objectif_portes ?? null
  } catch {
    return null
  }
}

export async function upsertObjectif(
  vendeurId: string,
  managerId: string,
  date: string,
  objectif: number
): Promise<void> {
  try {
    await supabase.from('objectifs').upsert(
      { vendeur_id: vendeurId, manager_id: managerId, date, objectif_portes: objectif },
      { onConflict: 'vendeur_id,date' }
    )
  } catch {
    // silently fail if table doesn't exist
  }
}

export async function getSuivisVendeur(userId: string): Promise<any[]> {
  const { data } = await supabase
    .from('doors')
    .select('id, address, client_name, phone, follow_up_date, status, notes')
    .eq('user_id', userId)
    .eq('follow_up_needed', true)
    .not('follow_up_date', 'is', null)
    .order('follow_up_date', { ascending: true })
    .limit(5)

  return data ?? []
}

export async function getDernieresPortes(limit: number, userId?: string): Promise<any[]> {
  let query = supabase
    .from('doors')
    .select('id, address, status, contract_value, created_at, client_name, user_id, profiles(full_name, color)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (userId) query = query.eq('user_id', userId)

  const { data } = await query
  return data ?? []
}

export async function getAllVendeurs(): Promise<any[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, color, created_at, daily_goal, commission_type, commission_value, role')

  return (data ?? []).filter((p: any) => isSeller(p.role))
}

export async function getObjectifsAujourdhui(date: string): Promise<Array<{ vendeur_id: string; type: string; valeur: number }>> {
  try {
    const { data, error } = await supabase
      .from('objectifs')
      .select('vendeur_id, type, valeur')
      .eq('date', date)

    if (error) return []
    return data ?? []
  } catch {
    return []
  }
}

export async function upsertObjectifTyped(
  vendeurId: string,
  type: 'portes' | 'ventes',
  date: string,
  valeur: number
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('objectifs').upsert(
      { vendeur_id: vendeurId, type, date, valeur },
      { onConflict: 'vendeur_id,date,type' }
    )
    return { error: error?.message ?? null }
  } catch (e: any) {
    return { error: e?.message ?? 'Erreur inconnue' }
  }
}

export async function getObjectifsVendeurJour(
  userId: string,
  date: string
): Promise<{ portes: number | null; ventes: number | null }> {
  try {
    const { data, error } = await supabase
      .from('objectifs')
      .select('type, valeur')
      .eq('vendeur_id', userId)
      .eq('date', date)

    console.log('[DEBUG VENDEUR] user.id:', userId)
    console.log('[DEBUG VENDEUR] objectifs récupérés:', data)
    console.log('[DEBUG VENDEUR] erreur:', error)

    if (error || !data) return { portes: null, ventes: null }

    let portes: number | null = null
    let ventes: number | null = null
    for (const row of data) {
      if (row.type === 'portes') portes = row.valeur
      if (row.type === 'ventes') ventes = row.valeur
    }
    return { portes, ventes }
  } catch {
    return { portes: null, ventes: null }
  }
}

export async function getVendeurStats(): Promise<any[]> {
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('vendeur_stats')
    .select('id, full_name, color, portes_aujourd_hui, ventes_aujourd_hui, montant_aujourd_hui, reponses_aujourd_hui, total_portes, total_ventes, total_reponses')

  if (!error && data && data.length > 0) return data

  // Fallback JS si la vue n'est pas encore créée en base
  // (exécuter supabase/migration_dashboard.sql dans Supabase SQL Editor pour corriger)
  const [{ data: vendeurs }, { data: doors }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, color').in('role', ['rep', 'vendeur']),
    supabase.from('doors').select('id, user_id, status, contract_value, created_at'),
  ])

  if (!vendeurs) return []
  const allDoors = (doors ?? []) as any[]

  return vendeurs.map((v: any) => {
    const mine = allDoors.filter((d) => d.user_id === v.id)
    const todayDoors = mine.filter((d) => (d.created_at as string).startsWith(today))
    const todaySold = todayDoors.filter((d) => d.status === 'vendu')
    const todayRep = todayDoors.filter((d) => d.status !== 'pas_repondu')
    return {
      id: v.id,
      full_name: v.full_name,
      color: v.color,
      portes_aujourd_hui: todayDoors.length,
      ventes_aujourd_hui: todaySold.length,
      montant_aujourd_hui: todaySold.reduce((s: number, d: any) => s + (Number(d.contract_value) || 0), 0),
      reponses_aujourd_hui: todayRep.length,
      total_portes: mine.length,
      total_ventes: mine.filter((d) => d.status === 'vendu').length,
      total_reponses: mine.filter((d) => d.status !== 'pas_repondu').length,
    }
  })
}

export async function getProfileForDashboard(userId: string): Promise<any | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, commission_type, commission_value, daily_goal, color, personal_goal_doors, personal_goal_revenue')
    .eq('id', userId)
    .single()
  return data ?? null
}

export async function getVentesParDateRange(
  userId: string,
  dateDebut: string,
  dateFin: string
): Promise<Array<{ date: string; montant: number; nbVentes: number }>> {
  const { data } = await supabase
    .from('doors')
    .select('created_at, contract_value')
    .eq('user_id', userId)
    .eq('status', 'vendu')
    .not('contract_value', 'is', null)
    .gte('created_at', `${dateDebut}T00:00:00`)
    .lte('created_at', `${dateFin}T23:59:59.999`)

  if (!data) return []

  const map: Record<string, { montant: number; nbVentes: number }> = {}
  const cursor = new Date(dateDebut + 'T12:00:00')
  const end = new Date(dateFin + 'T12:00:00')
  while (cursor <= end) {
    map[cursor.toISOString().slice(0, 10)] = { montant: 0, nbVentes: 0 }
    cursor.setDate(cursor.getDate() + 1)
  }

  for (const door of data) {
    const day = (door.created_at as string).slice(0, 10)
    if (map[day] !== undefined) {
      map[day].montant += Number(door.contract_value) || 0
      map[day].nbVentes++
    }
  }

  return Object.entries(map).map(([date, v]) => ({ date, ...v }))
}

export async function getFollowUpDoors(): Promise<any[]> {
  const { data } = await supabase
    .from('doors')
    .select('*, profiles(full_name, color)')
    .eq('follow_up_needed', true)
    .order('follow_up_date', { ascending: true, nullsFirst: false })
  return data ?? []
}

export async function getFollowUpCount(): Promise<number> {
  const { count } = await supabase
    .from('doors')
    .select('*', { count: 'exact', head: true })
    .eq('follow_up_needed', true)
  return count ?? 0
}

export async function getPortesParVendeurParJour(dateDebut: string, dateFin: string): Promise<any[]> {
  const { data } = await supabase
    .from('doors')
    .select('created_at, user_id, profiles(full_name, color)')
    .gte('created_at', `${dateDebut}T00:00:00`)
    .lte('created_at', `${dateFin}T23:59:59.999`)
  return data ?? []
}

export async function getRevenusParVendeur(dateDebut: string, dateFin: string): Promise<any[]> {
  const { data } = await supabase
    .from('doors')
    .select('created_at, contract_value, user_id, profiles(full_name, color, commission_type, commission_value)')
    .eq('status', 'vendu')
    .not('contract_value', 'is', null)
    .gte('created_at', `${dateDebut}T00:00:00`)
    .lte('created_at', `${dateFin}T23:59:59.999`)
  return data ?? []
}

export async function getVentesParJour7(userId: string): Promise<Array<{ date: string; montant: number; nbVentes: number }>> {
  const end = new Date()
  const start = new Date(Date.now() - 6 * 86400000)
  const startStr = start.toISOString().slice(0, 10)
  const endStr = end.toISOString().slice(0, 10)

  const { data } = await supabase
    .from('doors')
    .select('created_at, contract_value')
    .eq('user_id', userId)
    .eq('status', 'vendu')
    .not('contract_value', 'is', null)
    .gte('created_at', `${startStr}T00:00:00`)
    .lte('created_at', `${endStr}T23:59:59.999`)

  if (!data) return []

  const map: Record<string, { montant: number; nbVentes: number }> = {}
  for (let i = 0; i <= 6; i++) {
    const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10)
    map[d] = { montant: 0, nbVentes: 0 }
  }

  for (const door of data) {
    const day = door.created_at.slice(0, 10)
    if (map[day] !== undefined) {
      map[day].montant += Number(door.contract_value) || 0
      map[day].nbVentes++
    }
  }

  return Object.entries(map).map(([date, v]) => ({ date, ...v }))
}

export async function getRevenuesPeriods(): Promise<{
  today: number
  trois_jours: number
  sept_jours: number
  mois: number
}> {
  const now = new Date()
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1)

  const { data } = await supabase
    .from('doors')
    .select('contract_value, created_at')
    .eq('status', 'vendu')
    .not('contract_value', 'is', null)
    .gte('created_at', debutMois.toISOString())

  if (!data) return { today: 0, trois_jours: 0, sept_jours: 0, mois: 0 }

  const todayStr = now.toISOString().slice(0, 10)
  const il3 = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
  const il7 = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)

  let today = 0, trois_jours = 0, sept_jours = 0, mois = 0
  for (const d of data) {
    const day = (d.created_at as string).slice(0, 10)
    const val = Number(d.contract_value) || 0
    mois += val
    if (day >= il7) sept_jours += val
    if (day >= il3) trois_jours += val
    if (day === todayStr) today += val
  }

  return { today, trois_jours, sept_jours, mois }
}

export async function updateDailyGoal(userId: string, goal: number): Promise<void> {
  await supabase.from('profiles').update({ daily_goal: goal }).eq('id', userId)
}

export async function updateAllVendeurDailyGoal(goal: number): Promise<void> {
  await supabase.from('profiles').update({ daily_goal: goal }).eq('role', 'vendeur')
}

export async function getPortesParHeure(
  date: string,
  userId?: string
): Promise<Array<{ heure: number; count: number }>> {
  let query = supabase
    .from('doors')
    .select('created_at')
    .gte('created_at', `${date}T00:00:00`)
    .lt('created_at', `${date}T23:59:59.999`)

  if (userId) query = query.eq('user_id', userId)

  const { data } = await query
  if (!data) return []

  const map: Record<number, number> = {}
  for (let h = 0; h <= 23; h++) map[h] = 0

  for (const door of data) {
    const h = new Date(door.created_at).getHours()
    map[h] = (map[h] || 0) + 1
  }

  return Object.entries(map).map(([heure, count]) => ({ heure: Number(heure), count }))
}
