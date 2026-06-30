import type { HeadacheRiskLevel } from './types'
import { getNotifState, setNotifState, passesCooldown } from './notif-store'
import { buildNotification } from './notif-content'

/**
 * 通知 (ページ側)。
 * - アプリを開いている間: ここで new Notification() を出す。
 * - 閉じている間: Service Worker の periodicsync (sw.ts) が出す。
 * 有効フラグ/クールダウンは notif-store (IndexedDB) で SW と共有する。
 */

const PERIODIC_TAG = 'headache-check'
const MIN_INTERVAL_MS = 60 * 60 * 1000 // 1時間 (実際の頻度はブラウザが決定。これは下限希望値)

interface PeriodicSyncManager {
  register(tag: string, options: { minInterval: number }): Promise<void>
  unregister(tag: string): Promise<void>
  getTags(): Promise<string[]>
}

function getPeriodicSync(reg: ServiceWorkerRegistration): PeriodicSyncManager | undefined {
  return (reg as unknown as { periodicSync?: PeriodicSyncManager }).periodicSync
}

/** このブラウザが「閉じていても通知」(Periodic Background Sync) に対応しているか */
export function supportsBackgroundNotifications(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PeriodicSyncManager' in window
  )
}

export async function isNotificationEnabled(): Promise<boolean> {
  return (await getNotifState()).enabled
}

export async function enableNotifications(): Promise<boolean> {
  if (!('Notification' in window)) return false
  const granted = (await Notification.requestPermission()) === 'granted'
  await setNotifState({ enabled: granted })
  if (granted) await registerPeriodicSync()
  return granted
}

export async function disableNotifications(): Promise<void> {
  await setNotifState({ enabled: false })
  await unregisterPeriodicSync()
}

/** リスク評価を受けて、必要なら通知を出す (クールダウンは notif-store で判定) */
export async function maybeNotify(
  level: HeadacheRiskLevel,
  label: string,
  summary: string,
): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const state = await getNotifState()
  const now = Date.now()
  if (!passesCooldown(state, level, now)) return

  const content = buildNotification(level, label, summary)
  const notif = new Notification(content.title, {
    body: content.body,
    icon: content.icon,
    tag: content.tag,
  })
  notif.onclick = () => {
    window.focus()
    notif.close()
  }
  await setNotifState({ lastLevel: level, lastNotifAt: now })
}

/** 端末でテスト通知を出す (SW経由 = 閉じている時と同じ経路で確認できる) */
export async function sendTestNotification(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.ready
  reg.active?.postMessage('test-notification')
  return true
}

async function registerPeriodicSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const periodicSync = getPeriodicSync(reg)
    if (!periodicSync) return // Safari等は非対応。開いている時の通知のみ。
    try {
      const status = await navigator.permissions.query({
        name: 'periodic-background-sync' as PermissionName,
      })
      if (status.state === 'denied') return
    } catch {
      // permissions.query が未対応のブラウザもある。register を直接試す。
    }
    const tags = await periodicSync.getTags()
    if (!tags.includes(PERIODIC_TAG)) {
      await periodicSync.register(PERIODIC_TAG, { minInterval: MIN_INTERVAL_MS })
    }
  } catch {
    // 未対応/未インストールでは黙って無視 (開いている時の通知にフォールバック)
  }
}

async function unregisterPeriodicSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    await getPeriodicSync(reg)?.unregister(PERIODIC_TAG)
  } catch {
    // noop
  }
}
