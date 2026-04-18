import { useState, useCallback } from 'react'

/**
 * タイル並び順の永続化 (localStorage)
 *
 * ⚠️ データ永続化に関する注意事項 ⚠️
 * ユーザーがカスタマイズした並び順は localStorage の `tenki-tile-order` キーに保存される。
 * 既存ユーザー設定を失わないためのルール:
 *
 * 1. STORAGE_KEY を変更しない。変更すると既存の並び順が消え、デフォルトに戻る。
 * 2. TileId に新しいタイルを追加するのは安全 (loadOrder() が不足分を末尾に追加する)。
 * 3. TileId から既存タイルを削除すると、保存データが valid フィルタで弾かれるため、
 *    削除前にユーザー通知やマイグレーションを検討すること。
 * 4. アプリ全体で localStorage を使う際は必ず `tenki-` 接頭辞を付けること
 *    (既存: tenki-tile-order, tenki-notif-state, theme はレガシー例外)。
 */

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
