import { supabase } from '@/lib/supabase'

// ============================================================
// Storage — bucket public 'mw-photos' (photos terrains gazon, jobs,
// factures de dépenses). Upload = employé authentifié (RLS storage).
// ============================================================

export const PHOTO_BUCKET = 'mw-photos'

// Upload une image sous `prefix/…` ; renvoie le chemin Storage (pas l'URL).
export async function uploadPhoto(prefix: string, file: File): Promise<{ path: string | null; error: string | null }> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type || 'image/jpeg' })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

export function photoUrl(path: string): string {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function deletePhoto(path: string): Promise<void> {
  await supabase.storage.from(PHOTO_BUCKET).remove([path])
}
