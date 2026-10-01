import { supabase } from '@/lib/supabase'

// ============================================================
// Storage — bucket public 'mw-photos' (photos terrains gazon, jobs,
// factures de dépenses). Upload = employé authentifié (RLS storage).
// Supprimer exige AUSSI une policy SELECT (migration_crm_fermeture_factures.sql) :
// sans elle, remove() ne voit pas le fichier et le laisse dans le bucket.
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

// URL qui TÉLÉCHARGE le fichier au lieu de l'afficher (Supabase répond
// Content-Disposition: attachment) : un simple <a href> l'envoie direct dans
// Téléchargements, sans ouvrir l'image. `filename` : ASCII de préférence.
export function photoDownloadUrl(path: string, filename: string): string {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path, { download: filename }).data.publicUrl
}

// Téléchargement par script (« Tout télécharger ») : le fichier est lu puis
// enregistré sous `filename`. Une suite de liens cross-origin s'annulerait
// (chaque navigation coupe la précédente) — un blob local, non.
export async function downloadPhoto(path: string, filename: string): Promise<void> {
  const res = await fetch(photoUrl(path))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const href = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 30000)
}

export async function deletePhoto(path: string): Promise<void> {
  await supabase.storage.from(PHOTO_BUCKET).remove([path])
}
