import { openDB, type IDBPDatabase } from 'idb'
import type { Location } from './types'

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
      upgrade(db) {
        if (!db.objectStoreNames.contains('locations')) {
          db.createObjectStore('locations', { keyPath: 'id' })
        }
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
