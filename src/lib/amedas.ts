import type { AmedasObservation } from './types'

const BASE = 'https://www.jma.go.jp/bosai/amedas/data'

interface AmedasStationRaw {
  lat: [number, number]
  lon: [number, number]
  kjName: string
  knName: string
  enName: string
}

export interface AmedasStation {
  id: string
  name: string
  latitude: number
  longitude: number
}

let stationCache: AmedasStation[] | null = null

function toDecimal(dms: [number, number]): number {
  return dms[0] + dms[1] / 60
}

export async function fetchAmedasStations(): Promise<AmedasStation[]> {
  if (stationCache) return stationCache
  const res = await fetch(
    'https://www.jma.go.jp/bosai/amedas/const/amedastable.json'
  )
  const data: Record<string, AmedasStationRaw> = await res.json()
  stationCache = Object.entries(data).map(([id, s]) => ({
    id,
    name: s.kjName,
    latitude: toDecimal(s.lat),
    longitude: toDecimal(s.lon),
  }))
  return stationCache
}

export function findNearestStation(
  stations: AmedasStation[],
  lat: number,
  lon: number
): AmedasStation | null {
  if (stations.length === 0) return null
  let best = stations[0]
  let bestDist = Infinity
  for (const s of stations) {
    const d = (s.latitude - lat) ** 2 + (s.longitude - lon) ** 2
    if (d < bestDist) {
      bestDist = d
      best = s
    }
  }
  // Only use if within ~30km (roughly 0.3 degrees)
  if (bestDist > 0.09) return null
  return best
}

export async function fetchAmedasLatest(
  stationId: string
): Promise<AmedasObservation | null> {
  try {
    const timeRes = await fetch(`${BASE}/latest_time.txt`)
    const timeText = await timeRes.text()
    const latestTime = new Date(timeText.trim())

    const yyyy = latestTime.getFullYear()
    const mm = String(latestTime.getMonth() + 1).padStart(2, '0')
    const dd = String(latestTime.getDate()).padStart(2, '0')
    const hh3 = String(Math.floor(latestTime.getHours() / 3) * 3).padStart(
      2,
      '0'
    )
    const dateStr = `${yyyy}${mm}${dd}`
    const url = `${BASE}/point/${stationId}/${dateStr}_${hh3}.json`

    const res = await fetch(url)
    if (!res.ok) return null
    const data: Record<string, Record<string, [number, number] | undefined>> =
      await res.json()

    const entries = Object.entries(data).sort(([a], [b]) => b.localeCompare(a))
    if (entries.length === 0) return null

    const [timeKey, obs] = entries[0]
    const t = `${timeKey.slice(0, 4)}-${timeKey.slice(4, 6)}-${timeKey.slice(6, 8)}T${timeKey.slice(8, 10)}:${timeKey.slice(10, 12)}:00`

    return {
      time: t,
      temp: obs.temp?.[0] ?? null,
      humidity: obs.humidity?.[0] ?? null,
      pressureSea: obs.normalPressure?.[0] ?? null,
      pressureStation: obs.pressure?.[0] ?? null,
      precipitation1h: obs.precipitation1h?.[0] ?? null,
      windSpeed: obs.wind?.[0] ?? null,
      windDirection: obs.windDirection?.[0] !== undefined
        ? String(obs.windDirection[0])
        : null,
    }
  } catch {
    return null
  }
}
