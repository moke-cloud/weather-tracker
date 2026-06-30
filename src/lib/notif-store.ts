import { openDB, type IDBPDatabase } from 'idb'
import type { HeadacheRiskLevel } from './types'

/**
 * 通知の状態 (有効フラグ + クールダウン) を IndexedDB に保存する。
 *
 * なぜ localStorage ではなく IndexedDB か:
 *   Service Worker からは localStorage にアクセスできない。
 *   ページ(開いている時)と SW(閉じている時の定期同期)の両方から
 *   同じ状態を読み書きする必要があるため、両方で使える IndexedDB に置く。
 *
 * 登録地点の `tenki-tracker` DB とは別DB (`tenki-notif`) にして、
 * 既存の locations DB のスキーマ/バージョンに一切触れない (データ保全)。
 */
const DB_NAME = 'tenki-notif'
const DB_VERSION = 1
const STORE = 'state'
const KEY = 'singleton'
const COOLDOWN_MS = 3 * 3_600_000 // 同レベル以下は3時間あけて再通知

export interface NotifState {
  enabled: boolean
  lastLevel: HeadacheRiskLevel | null
  lastNotifAt: number
}

const DEFAULT_STATE: NotifState = { enabled: false, lastLevel: null, lastNotifAt: 0 }

const SEVERITY: Record<HeadacheRiskLevel, number> = {
  safe: 0, low: 1, moderate: 2, high: 3, critical: 4,
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      },
    })
  }
  return dbPromise
}

export async function getNotifState(): Promise<NotifState> {
  try {
    const db = await getDB()
    const value = (await db.get(STORE, KEY)) as Partial<NotifState> | undefined
    return { ...DEFAULT_STATE, ...(value ?? {}) }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export async function setNotifState(patch: Partial<NotifState>): Promise<void> {
  const current = await getNotifState()
  const db = await getDB()
  await db.put(STORE, { ...current, ...patch }, KEY)
}

/**
 * このレベルの通知を出してよいか (純粋関数)。
 * - safe/low は通知しない
 * - 無効なら通知しない
 * - 直近通知と同レベル以下 かつ クールダウン中なら通知しない
 */
export function passesCooldown(
  state: NotifState,
  level: HeadacheRiskLevel,
  now: number,
): boolean {
  if (level === 'safe' || level === 'low') return false
  if (!state.enabled) return false
  if (
    state.lastLevel &&
    SEVERITY[level] <= SEVERITY[state.lastLevel] &&
    now - state.lastNotifAt < COOLDOWN_MS
  ) {
    return false
  }
  return true
}

export { SEVERITY }
