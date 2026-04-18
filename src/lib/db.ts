import { openDB, type IDBPDatabase } from 'idb'
import type { Location } from './types'

/**
 * IndexedDB: 登録地点ストア
 *
 * ⚠️ データ永続化に関する重要な注意事項 ⚠️
 * ユーザーが登録した観測地点はブラウザのIndexedDB (`tenki-tracker` DB) に保存される。
 * 既存ユーザーのデータを失わないためのルール:
 *
 * 1. DB_NAME を変更しない。変更すると旧DBが孤立し、既存データが読めなくなる。
 * 2. DB_VERSION を上げる際は upgrade() 内で既存データを保持しつつ移行する。
 *    - 新しい objectStore の追加は安全 (既存ストアは触らない)
 *    - 既存ストアの keyPath 変更や削除は絶対禁止。必要なら一度全データを読み出し、
 *      新スキーマに変換して書き戻すマイグレーションを書く。
 * 3. Location 型に新フィールドを追加するときは必ず optional (`?`) にするか、
 *    読み出し時にデフォルト値を補完する。既存レコードに無いと undefined になる。
 * 4. objectStore.clear() / deleteObjectStore() は絶対に呼ばない。
 */
const DB_NAME = 'tenki-tracker'
const DB_VERSION = 1

interface TenkiDB {
  locations: {
    key: string
    value: Location
  }
}

let dbPromise: Promise<IDBPDatabase<TenkiDB>> | null = null

function getDB(): Promise<IDBPDatabase<TenkiDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TenkiDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // 新規インストール or 初回 v1 作成
        if (!db.objectStoreNames.contains('locations')) {
          db.createObjectStore('locations', { keyPath: 'id' })
        }
        // 将来 DB_VERSION を上げるときは oldVersion を見て段階的に upgrade する。
        // 例:
        //   if (oldVersion < 2) { /* v1 → v2 の差分のみ。既存データは保持 */ }
        //   if (oldVersion < 3) { /* v2 → v3 の差分のみ */ }
        void oldVersion
      },
    })
  }
  return dbPromise
}

export async function getLocations(): Promise<Location[]> {
  const db = await getDB()
  return db.getAll('locations')
}

export async function addLocation(location: Location): Promise<void> {
  const db = await getDB()
  await db.put('locations', location)
}

export async function removeLocation(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('locations', id)
}
