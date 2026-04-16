import type { HeadacheRiskLevel } from './types'

const STORAGE_KEY = 'tenki-notif-state'
const COOLDOWN_MS = 3 * 3_600_000 // 3 hours between same-level notifications

interface NotifState {
  enabled: boolean
  lastLevel: HeadacheRiskLevel | null
  lastNotifAt: number
}

function loadState(): NotifState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* use default */ }
  return { enabled: false, lastLevel: null, lastNotifAt: 0 }
}

function saveState(state: NotifState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function isNotificationEnabled(): boolean {
  return loadState().enabled
}

export async function enableNotifications(): Promise<boolean> {
  if (!('Notification' in window)) return false
  const perm = await Notification.requestPermission()
  const granted = perm === 'granted'
  const state = loadState()
  state.enabled = granted
  saveState(state)
  return granted
}

export function disableNotifications(): void {
  const state = loadState()
  state.enabled = false
  saveState(state)
}

export function shouldNotify(level: HeadacheRiskLevel): boolean {
  if (level === 'safe' || level === 'low') return false
  const state = loadState()
  if (!state.enabled) return false
  if ('Notification' in window && Notification.permission !== 'granted') return false

  const now = Date.now()
  // Don't re-notify for same or lower level within cooldown
  const severity: Record<HeadacheRiskLevel, number> = {
    safe: 0, low: 1, moderate: 2, high: 3, critical: 4,
  }
  if (
    state.lastLevel &&
    severity[level] <= severity[state.lastLevel] &&
    now - state.lastNotifAt < COOLDOWN_MS
  ) {
    return false
  }

  return true
}

export function sendHeadacheNotification(
  level: HeadacheRiskLevel,
  label: string,
  summary: string,
): void {
  if (!shouldNotify(level)) return

  const icons: Record<HeadacheRiskLevel, string> = {
    safe: '', low: '', moderate: '\u26A0\uFE0F', high: '\u{1F6A8}', critical: '\u{1F198}',
  }

  const notif = new Notification(`${icons[level]} TenkiTracker: 頭痛リスク${label}`, {
    body: summary,
    icon: '/weather-tracker/icon-192.svg',
    tag: 'headache-risk',
  })

  notif.onclick = () => {
    window.focus()
    notif.close()
  }

  const state = loadState()
  state.lastLevel = level
  state.lastNotifAt = Date.now()
  saveState(state)
}
