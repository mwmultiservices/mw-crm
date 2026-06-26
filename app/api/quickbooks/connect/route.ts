import { qbConfigured, authorizeUrl } from '@/lib/quickbooks'
import { randomUUID } from 'crypto'

// GET /api/quickbooks/connect — démarre l'OAuth2 Intuit.
// Pose un cookie `qb_state` (anti-CSRF) puis redirige vers l'écran de consentement.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin

  if (!qbConfigured()) {
    return Response.redirect(`${origin}/soumissions?qb=unconfigured`, 302)
  }

  const state = randomUUID()
  const res = new Response(null, { status: 302, headers: { Location: authorizeUrl(state) } })
  res.headers.append('Set-Cookie', `qb_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`)
  return res
}
