// ============================================================
// QuickBooks Online — helpers OAuth2.
// Côté serveur uniquement (lit QUICKBOOKS_* + service role).
// Rien ne part tant que les credentials Intuit ne sont pas branchés.
// ============================================================

const CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID
const CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET
const REDIRECT_URI = process.env.QUICKBOOKS_REDIRECT_URI
export const QB_ENV = process.env.QUICKBOOKS_ENV || 'sandbox' // sandbox | production

// Endpoints connus, utilisés seulement si le discovery document (source de
// vérité, cf. fetchDiscovery ci-dessous) est injoignable — recommandation
// Intuit : lire les endpoints OAuth2 depuis le discovery document plutôt que
// de les coder en dur, pour suivre automatiquement tout changement côté Intuit.
const FALLBACK_AUTH_ENDPOINT = 'https://appcenter.intuit.com/connect/oauth2'
const FALLBACK_TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const FALLBACK_REVOKE_ENDPOINT = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'

const DISCOVERY_URL =
  QB_ENV === 'production'
    ? 'https://developer.api.intuit.com/.well-known/openid_configuration'
    : 'https://developer.api.intuit.com/.well-known/openid_sandbox_configuration'

const SCOPE = 'com.intuit.quickbooks.accounting'

// Base de l'API comptable selon l'environnement.
export const QB_API_BASE =
  QB_ENV === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'

export function qbConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI)
}

// Levée quand Intuit signale que l'autorisation elle-même n'est plus valide
// (refresh token expiré/révoqué → invalid_grant, ou 401 persistant après
// retry). L'appelant doit alors effacer la connexion locale et proposer à
// l'utilisateur de se reconnecter — jamais retenter en boucle sur ce cas.
export class QuickBooksAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuickBooksAuthError'
  }
}

interface Discovery {
  authorization_endpoint: string
  token_endpoint: string
  revocation_endpoint: string
}

let discoveryCache: { data: Discovery; fetchedAt: number } | null = null
const DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000 // 24h — les endpoints Intuit changent rarement

// Récupère les endpoints OAuth2 depuis le discovery document officiel
// d'Intuit (mis en cache en mémoire par instance) ; repli sur les endpoints
// connus ci-dessus si le document est injoignable (offline dev, incident réseau).
async function fetchDiscovery(): Promise<Discovery> {
  if (discoveryCache && Date.now() - discoveryCache.fetchedAt < DISCOVERY_TTL_MS) {
    return discoveryCache.data
  }
  try {
    const res = await fetch(DISCOVERY_URL)
    if (!res.ok) throw new Error(`discovery ${res.status}`)
    const data = (await res.json()) as Discovery
    discoveryCache = { data, fetchedAt: Date.now() }
    return data
  } catch (e) {
    console.error('[QuickBooks] discovery document injoignable, repli sur les endpoints connus:', e)
    return {
      authorization_endpoint: FALLBACK_AUTH_ENDPOINT,
      token_endpoint: FALLBACK_TOKEN_ENDPOINT,
      revocation_endpoint: FALLBACK_REVOKE_ENDPOINT,
    }
  }
}

export async function authorizeUrl(state: string): Promise<string> {
  const { authorization_endpoint } = await fetchDiscovery()
  const p = new URLSearchParams({
    client_id: CLIENT_ID!,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: REDIRECT_URI!,
    state,
  })
  return `${authorization_endpoint}?${p.toString()}`
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

// Lit le corps d'une réponse token en erreur. Distingue les cas où
// l'autorisation elle-même est morte (refresh token expiré/révoqué, code déjà
// consommé → invalid_grant/invalid_request) — auquel cas on lève
// QuickBooksAuthError pour que l'appelant efface la connexion et redemande une
// reconnexion, plutôt qu'une Error générique qui inviterait à retenter.
async function throwTokenError(res: Response, context: string): Promise<never> {
  const text = await res.text()
  let code = ''
  try { code = JSON.parse(text)?.error ?? '' } catch { /* corps non-JSON */ }
  if (res.status === 400 && (code === 'invalid_grant' || code === 'invalid_request')) {
    throw new QuickBooksAuthError(`QuickBooks ${context}: ${code} — reconnexion requise`)
  }
  throw new Error(`QuickBooks ${context}: ${res.status} ${text}`)
}

// Échange le code d'autorisation contre des tokens.
export async function exchangeCode(code: string): Promise<TokenResponse> {
  const { token_endpoint } = await fetchDiscovery()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI!,
  })
  const res = await fetch(token_endpoint, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  })
  if (!res.ok) return throwTokenError(res, 'token')
  return res.json()
}

// Rafraîchit les tokens (à appeler avant un appel API si expiré, ou en retry
// après un 401). Lève QuickBooksAuthError si le refresh token est expiré/révoqué.
export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const { token_endpoint } = await fetchDiscovery()
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  const res = await fetch(token_endpoint, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  })
  if (!res.ok) return throwTokenError(res, 'refresh')
  return res.json()
}

// Révoque un token (refresh ou access) chez Intuit — best-effort.
export async function revokeToken(token: string): Promise<void> {
  const { revocation_endpoint } = await fetchDiscovery()
  const res = await fetch(revocation_endpoint, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) throw new Error(`QuickBooks revoke: ${res.status} ${await res.text()}`)
}
