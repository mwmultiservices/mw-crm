import webpush from 'web-push'
import { supabaseAdmin } from './supabaseAdmin'

// ============================================================
// Web Push — UNIQUEMENT côté serveur (routes API).
// Envoie une notification aux appareils abonnés (push_subscriptions).
// Sans clés VAPID : no-op silencieux (comme Twilio sans clés).
// Clés : NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT.
// ============================================================

export interface PushPayload {
  title: string
  body: string
  url?: string // page ouverte au clic (défaut /pipeline)
}

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

interface SubRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  profile_id: string
  profiles: { role: string | null } | { role: string | null }[] | null
}

function roleOf(row: SubRow): string {
  const p = row.profiles
  if (!p) return ''
  return (Array.isArray(p) ? p[0]?.role : p.role) ?? ''
}

const MANAGER_ROLES = ['admin', 'lead', 'manager']

// Envoie la notification aux managers (admin/lead) + éventuellement au rep
// assigné (repId). Purge les abonnements morts (endpoint expiré 404/410).
export async function sendPushToTeam(payload: PushPayload, repId?: string | null): Promise<void> {
  if (!pushConfigured()) return

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@mwmultiservices.ca',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )

  const { data } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, profile_id, profiles(role)')
  const subs = ((data as SubRow[]) ?? []).filter(
    (s) => MANAGER_ROLES.includes(roleOf(s)) || (repId && s.profile_id === repId)
  )
  if (subs.length === 0) return

  const body = JSON.stringify({ url: '/pipeline', ...payload })
  const dead: string[] = []

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        )
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) dead.push(s.id)
        else console.error('[push]', code, e)
      }
    })
  )

  if (dead.length > 0) {
    await supabaseAdmin.from('push_subscriptions').delete().in('id', dead)
  }
}
