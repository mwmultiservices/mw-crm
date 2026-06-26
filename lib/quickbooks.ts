// ============================================================
// QuickBooks Online — helpers OAuth2 (Phase 7, squelette).
// Côté serveur uniquement (lit QUICKBOOKS_* + service role).
// Rien ne part tant que les credentials Intuit ne sont pas branchés.
// ============================================================

const CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID
const CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET
const REDIRECT_URI = process.env.QUICKBOOKS_REDIRECT_URI
export const QB_ENV = process.env.QUICKBOOKS_ENV || 'sandbox' // sandbox | production

const AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2'
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const SCOPE = 'com.intuit.quickbooks.accounting'

// Base de l'API comptable selon l'environnement.
export const QB_API_BASE =
  QB_ENV === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'

export function qbConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI)
}

export function authorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: CLIENT_ID!,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: REDIRECT_URI!,
    state,
  })
  return `${AUTH_BASE}?${p.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  x_refresh_token_expires_in?: number
}

function basicAuth(): string {
  return 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
}

// Échange le code d'autorisation contre des tokens.
export async function exchangeCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI!,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`QuickBooks token: ${res.status} ${await res.text()}`)
  return res.json()
}

// Rafraîchit les tokens (à appeler avant un appel API si expiré).
export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`QuickBooks refresh: ${res.status} ${await res.text()}`)
  return res.json()
}
