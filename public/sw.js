// Service worker MW Multiservices — cache offline léger pour le terrain.
// Stratégie : statiques immuables = cache-first ; navigations = network-first
// avec repli sur le cache. JAMAIS les /api ni le cross-origin (Supabase, tuiles).
const CACHE = 'mw-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Web Push — notification sur l'écran d'accueil (SMS entrant, nouveau lead).
// Payload JSON : { title, body, url }
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* payload non-JSON */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'MW Multiservices', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.url || 'mw-crm', // regroupe les notifs de la même page
      data: { url: data.url || '/pipeline' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus() }
      }
      return clients.openWindow(url)
    })
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return       // pas de cross-origin
  if (url.pathname.startsWith('/api/')) return           // jamais les routes API

  // Assets immuables (build Next + icônes) → cache-first
  if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((hit) =>
        hit || fetch(request).then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy))
          return res
        })
      )
    )
    return
  }

  // Navigations (pages) → réseau d'abord, repli cache si hors-ligne
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy))
          return res
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/')))
    )
  }
})
