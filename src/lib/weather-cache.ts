import { openDB, type IDBPDatabase } from 'idb'
import type { LocationWeather } from './types'

/**
 * IndexedDB: 天気データの last-good キャッシュ
 *
 * 全APIが失敗した場合でも「最後に成功したデータ」を stale 表示付きで
 * 提供するための可用性フォールバック。ページ/Service Worker 両方から使う。
 *
 * ⚠️ データ永続化に関する注意事項 ⚠️
 * 1. DB_NAME (`tenki-weather-cache`) を変更しない。
 * 2. キャッシュは揮発的データなので消えても致命的ではないが、
 *    schema 変更時は upgrade() で段階的に移行すること。
 */
const DB_NAME = 'tenki-weather-cache'
const DB_VERSION = 1
/** これより古いキャッシュはフォールバックにも使わない (48時間) */
const MAX_STALE_MS = 48 * 3_600_000

interface WeatherCacheDB {
  snapshots: {
    key: string
    value: LocationWeather
  }
}

let dbPromise: Promise<IDBPDatabase<WeatherCacheDB>> | null = null

function getDB(): Promise<IDBPDatabase<WeatherCacheDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WeatherCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots')
        }
      },
    })
  }
  return dbPromise
}

export async function saveWeatherSnapshot(data: LocationWeather): Promise<void> {
  try {
    const db = await getDB()
    // stale フラグ付きのフォールバックデータは保存しない (鮮度が劣化するため)
    if (data.stale) return
    await db.put('snapshots', data, data.location.id)
  } catch {
    // キャッシュ保存失敗は本体機能に影響させない
  }
}

export async function loadWeatherSnapshot(
  locationId: string
): Promise<LocationWeather | null> {
  try {
    const db = await getDB()
    const snap = await db.get('snapshots', locationId)
    if (!snap) return null
    if (Date.now() - snap.fetchedAt > MAX_STALE_MS) return null
    return snap
  } catch {
    return null
  }
}

export async function removeWeatherSnapshot(locationId: string): Promise<void> {
  try {
    const db = await getDB()
    await db.delete('snapshots', locationId)
  } catch {
    // no-op
  }
}
