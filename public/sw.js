/// <reference lib="webworker" />

const CACHE_NAME = 'tenki-tracker-v3'
const STATIC_ASSETS = [
  '/weather-tracker/',
  '/weather-tracker/index.html',
  '/weather-tracker/manifest.json',
  '/weather-tracker/icon-192.png',
  '/weather-tracker/icon-512.png',
]

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// Fetch: network-first for API, stale-while-revalidate for assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // API calls + postal code lookup: always network
  if (
    url.hostname.includes('open-meteo.com') ||
    url.hostname.includes('jma.go.jp') ||
    url.hostname.includes('zipcloud')
  ) {
    event.respondWith(fetch(event.request))
    return
  }

  // App shell: stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => cached)

      return cached || fetchPromise
    })
  )
})
