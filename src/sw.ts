/// <reference lib="webworker" />
import { getLocations } from './lib/db'
import { fetchWeatherForLocation } from './lib/weather-service'
import { calculateHeadacheRisk } from './lib/headache-model'
import { getNotifState, setNotifState, passesCooldown, SEVERITY } from './lib/notif-store'
import { buildNotification } from './lib/notif-content'

declare const self: ServiceWorkerGlobalScope

const CACHE_NAME = 'tenki-tracker-v4'
const BASE = '/weather-tracker/'
const STATIC_ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
]
const PERIODIC_TAG = 'headache-check'

/* ── Install / Activate / Fetch (オフラインキャッシュ) ── */

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // 天気/郵便番号API は常にネットワーク
  if (
    url.hostname.includes('open-meteo.com') ||
    url.hostname.includes('jma.go.jp') ||
    url.hostname.includes('zipcloud')
  ) {
    event.respondWith(fetch(event.request))
    return
  }

  // アプリシェル: stale-while-revalidate
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
        .catch(() => cached as Response)
      return cached || fetchPromise
    }),
  )
})

/* ── 定期バックグラウンド同期: 閉じていてもリスクを評価して通知 ── */

interface PeriodicSyncEvent extends ExtendableEvent {
  readonly tag: string
}

self.addEventListener('periodicsync', (event) => {
  const e = event as PeriodicSyncEvent
  if (e.tag === PERIODIC_TAG) {
    e.waitUntil(runHeadacheCheck())
  }
})

// ページからの手動メッセージ
self.addEventListener('message', (event) => {
  if (event.data === 'run-headache-check') {
    event.waitUntil(runHeadacheCheck())
  } else if (event.data === 'test-notification') {
    // ユーザーが端末で「閉じていても届く形式」を確認するためのテスト通知
    event.waitUntil(
      self.registration.showNotification('TenkiTracker 通知テスト', {
        body: 'この形式で届きます。対応ブラウザにPWAを追加しておくと、アプリを閉じていても定期的に頭痛リスクをお知らせします。',
        icon: '/weather-tracker/icon-192.png',
        badge: '/weather-tracker/icon-192.png',
        tag: 'headache-risk',
      }),
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow(BASE)
    }),
  )
})

/**
 * 登録地点それぞれの頭痛リスクを評価し、最も高いものが閾値+クールダウンを満たせば通知する。
 * ページ側の maybeNotify と同じ notif-store / buildNotification を使うので文言・判定は一元化。
 */
async function runHeadacheCheck(): Promise<void> {
  const state = await getNotifState()
  if (!state.enabled) return

  const locations = await getLocations()
  if (locations.length === 0) return

  let top: { level: ReturnType<typeof calculateHeadacheRisk>['level']; label: string; summary: string; sev: number } | null = null

  for (const loc of locations) {
    try {
      const data = await fetchWeatherForLocation(loc)
      const risk = calculateHeadacheRisk(data.models, data.ensemble)
      const sev = SEVERITY[risk.level]
      if (!top || sev > top.sev) {
        top = { level: risk.level, label: risk.label, summary: `${loc.name}: ${risk.summary}`, sev }
      }
    } catch {
      // 1地点の取得失敗は無視して続行
    }
  }
  if (!top) return

  const now = Date.now()
  const fresh = await getNotifState() // 取得中に変わっている可能性
  if (!passesCooldown(fresh, top.level, now)) return

  const content = buildNotification(top.level, top.label, top.summary)
  await self.registration.showNotification(content.title, {
    body: content.body,
    icon: content.icon,
    badge: content.icon,
    tag: content.tag,
  })
  await setNotifState({ lastLevel: top.level, lastNotifAt: now })
}
