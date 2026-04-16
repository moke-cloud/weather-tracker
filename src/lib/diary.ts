import { openDB, type IDBPDatabase } from 'idb'
import type { DiaryEntry } from './types'

const DB_NAME = 'tenki-diary'
const DB_VERSION = 1
const MAX_ENTRIES = 500 // Keep storage bounded

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
      upgrade(db) {
        if (!db.objectStoreNames.contains('entries')) {
          const store = db.createObjectStore('entries', { keyPath: 'id' })
          store.createIndex('timestamp', 'timestamp')
        }
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
