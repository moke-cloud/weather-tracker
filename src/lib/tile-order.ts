import { useState, useCallback } from 'react'

export type TileId =
  | 'weather'
  | 'headache'
  | 'hourly'
  | 'forecast'
  | 'pressure'
  | 'airquality'
  | 'models'
  | 'diary'

export const TILE_LABELS: Record<TileId, string> = {
  weather: '現在の天気',
  headache: '頭痛リスク予測',
  hourly: '時間ごと予報',
  forecast: '週間予報',
  pressure: '気圧トレンド・アンサンブル',
  airquality: 'UV・大気質',
  models: 'マルチモデル比較',
  diary: '頭痛日記',
}

const DEFAULT_ORDER: TileId[] = [
  'weather',
  'headache',
  'hourly',
  'forecast',
  'pressure',
  'airquality',
  'models',
  'diary',
]

const STORAGE_KEY = 'tenki-tile-order'

function loadOrder(): TileId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_ORDER
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_ORDER
    // Ensure all default tiles are present, discard unknown ones
    const valid = parsed.filter(
      (id): id is TileId => typeof id === 'string' && id in TILE_LABELS
    )
    for (const id of DEFAULT_ORDER) {
      if (!valid.includes(id)) valid.push(id)
    }
    return valid
  } catch {
    return DEFAULT_ORDER
  }
}

function saveOrder(order: TileId[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
}

export function useTileOrder() {
  const [order, setOrder] = useState<TileId[]>(loadOrder)

  const reorder = useCallback((from: number, to: number) => {
    setOrder((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      saveOrder(next)
      return next
    })
  }, [])

  const resetOrder = useCallback(() => {
    saveOrder(DEFAULT_ORDER)
    setOrder(DEFAULT_ORDER)
  }, [])

  return { order, reorder, resetOrder }
}
