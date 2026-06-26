export const VENDOR_COLORS = [
  '#69C9CA', '#0D6E6F', '#10B981', '#F59E0B',
  '#EF4444', '#8B5CF6', '#3B82F6', '#EC4899',
  '#F97316', '#14B8A6', '#6366F1', '#84CC16',
]

export function getPinColor(status: string): string {
  const s = (status || '').toLowerCase()
  if (s === 'vendu') return '#22C55E'
  if (s === 'interesse' || s === 'a_rappeler' || s === 'soumission') return '#F59E0B'
  return '#EF4444'
}

export function getPinBadge(status: string): { bg: string; color: string } {
  const s = (status || '').toLowerCase()
  if (s === 'vendu') return { bg: '#D1FAE5', color: '#065F46' }
  if (s === 'interesse' || s === 'a_rappeler' || s === 'soumission') return { bg: '#FEF3C7', color: '#92400E' }
  return { bg: '#FEE2E2', color: '#991B1B' }
}

export async function getUsedColorProfiles(
  supabaseClient: any,
  excludeUserId?: string
): Promise<{ color: string; name: string }[]> {
  let query = supabaseClient.from('profiles').select('color, full_name').not('color', 'is', null)
  if (excludeUserId) query = query.neq('id', excludeUserId)
  const { data } = await query
  return ((data as any[]) || [])
    .filter((p: any) => p.color)
    .map((p: any) => ({ color: p.color as string, name: (p.full_name || '—') as string }))
}
