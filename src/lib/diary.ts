import { openDB, type IDBPDatabase } from 'idb'
import type { DiaryEntry } from './types'

/**
 * IndexedDB: 頭痛日記ストア
 *
 * ⚠️ データ永続化に関する重要な注意事項 ⚠️
 * ユーザーが記録した頭痛ログはブラウザのIndexedDB (`tenki-diary` DB) に保存される。
 * 既存ユーザーの日記データを失わないためのルール:
 *
 * 1. DB_NAME を変更しない。変更すると旧DBが孤立し、過去の記録が読めなくなる。
 * 2. DB_VERSION を上げる際は upgrade() で既存 entries を保持しつつ移行すること。
 *    - 新しいインデックスの追加は安全 (既存データは保持される)
 *    - keyPath 変更や objectStore 削除は絶対禁止
 * 3. DiaryEntry 型に新フィールドを追加するときは optional にする。
 *    古いレコードには新フィールドが無いため、null / undefined を想定した読み出しが必要。
 * 4. MAX_ENTRIES を減らす場合は要注意 (古いデータが自動削除される)。
 *    増やすのは安全。現在は500件で運用中。
 * 5. clear() / deleteObjectStore() は絶対に呼ばない。
 */
const DB_NAME = 'tenki-diary'
const DB_VERSION = 1
/** 自動削除の閾値 (古いものから削除)。減らすと既存ユーザーのデータが失われるため増やす方向でのみ変更可 */
const MAX_ENTRIES = 500

interface DiaryDB {
  entries: {
    key: string
    value: DiaryEntry
    indexes: { timestamp: number }
  }
}

let dbPromise: Promise<IDBPDatabase<DiaryDB>> | null = null

function getDB(): Promise<IDBPDatabase<DiaryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DiaryDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // 新規インストール or 初回 v1 作成
        if (!db.objectStoreNames.contains('entries')) {
          const store = db.createObjectStore('entries', { keyPath: 'id' })
          store.createIndex('timestamp', 'timestamp')
        }
        // 将来 DB_VERSION を上げるときは oldVersion を見て段階的に upgrade すること。
        // 既存の entries ストアを削除してはならない。
        void oldVersion
      },
    })
  }
  return dbPromise
}

export async function addDiaryEntry(entry: DiaryEntry): Promise<void> {
  const db = await getDB()
  await db.put('entries', entry)

  // Auto-prune oldest entries if over limit
  const count = await db.count('entries')
  if (count > MAX_ENTRIES) {
    const oldest = await db.getAllKeysFromIndex('entries', 'timestamp', undefined, count - MAX_ENTRIES)
    const tx = db.transaction('entries', 'readwrite')
    for (const key of oldest) {
      tx.store.delete(key)
    }
    await tx.done
  }
}

export async function getDiaryEntries(limit = 50): Promise<DiaryEntry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('entries', 'timestamp')
  return all.reverse().slice(0, limit)
}

export async function removeDiaryEntry(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('entries', id)
}

export async function getDiaryStats(): Promise<{
  totalEntries: number
  avgSeverity: number
  avgRiskScore: number
  commonPressureRange: string
  avgPressureChange3h: string
}> {
  const db = await getDB()
  const all = await db.getAll('entries')
  if (all.length === 0) {
    return {
      totalEntries: 0,
      avgSeverity: 0,
      avgRiskScore: 0,
      commonPressureRange: '--',
      avgPressureChange3h: '--',
    }
  }
  const avgSev = all.reduce((s, e) => s + e.severity, 0) / all.length
  const avgRisk = all.reduce((s, e) => s + e.riskScore, 0) / all.length
  const pressures = all.filter(e => e.pressure !== null).map(e => e.pressure!)
  const commonRange = pressures.length > 0
    ? `${Math.min(...pressures).toFixed(0)}-${Math.max(...pressures).toFixed(0)} hPa`
    : '--'

  const changes = all.filter(e => e.pressureChange3h !== null).map(e => e.pressureChange3h!)
  const avgChange = changes.length > 0
    ? `${(changes.reduce((s, v) => s + v, 0) / changes.length).toFixed(1)} hPa/3h`
    : '--'

  return {
    totalEntries: all.length,
    avgSeverity: Math.round(avgSev * 10) / 10,
    avgRiskScore: Math.round(avgRisk),
    commonPressureRange: commonRange,
    avgPressureChange3h: avgChange,
  }
}

/** Check approximate storage usage */
export async function getStorageInfo(): Promise<{ used: string; quota: string; persisted: boolean } | null> {
  if (!navigator.storage?.estimate) return null
  const est = await navigator.storage.estimate()
  const persisted = await navigator.storage.persisted?.() ?? false
  const fmt = (bytes?: number) => bytes != null ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '?'
  return {
    used: fmt(est.usage),
    quota: fmt(est.quota),
    persisted,
  }
}
