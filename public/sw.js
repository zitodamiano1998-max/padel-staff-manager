// Padel Staff Manager - Service Worker
// Versione: 1.0.0

const CACHE_NAME = 'padel-staff-v1'

// Install: salta wait, attiva subito il nuovo SW
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// Activate: prendi il controllo subito + pulisci cache vecchie
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

// Fetch: strategia mista
//  - chiamate Supabase / API → network only (mai cache)
//  - assets statici (immagini, font, css, js) → cache-first con fallback network
//  - tutto il resto → network-first
self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Skip Supabase - sempre network
  if (url.hostname.includes('supabase')) return

  // Skip auth/API - sempre network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  const dest = request.destination

  // Cache-first per asset statici
  if (
    dest === 'image' || dest === 'font' || dest === 'style' ||
    dest === 'script' || dest === 'manifest'
  ) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((c) => c.put(request, clone))
          }
          return response
        }).catch(() => cached)
      )
    )
    return
  }

  // Network-first per HTML/document
  if (dest === 'document' || request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((c) => c || caches.match('/')))
    )
    return
  }
})

// ----------------------------------------------------------------------------
// PUSH NOTIFICATIONS (placeholder per Fase 3)
// In Fase 3 implementeremo il vero push handler. Per ora è uno stub che
// gestisce il caso in cui un push arrivi: mostra una notifica generica.
// ----------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = { title: 'Padel Staff', body: event.data?.text() || '' }
  }

  const title = payload.title || 'Padel Staff'
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.link || '/dashboard' },
    tag: payload.type || 'default',
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Click su notifica → apri/focalizza la pagina
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Se c'è già una finestra aperta della nostra app, focalizzala
      for (const client of allClients) {
        const url = new URL(client.url)
        if (url.origin === self.location.origin) {
          await client.focus()
          if ('navigate' in client) {
            client.navigate(targetUrl)
          }
          return
        }
      }
      // Altrimenti apri una nuova finestra
      await self.clients.openWindow(targetUrl)
    })()
  )
})
