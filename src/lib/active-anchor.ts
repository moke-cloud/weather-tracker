import type { TileId } from './tile-order'

/**
 * BottomNav の「いま見ているタイル」判定 (純ロジック)。
 * DOM 計測は BottomNav 側で行い、ここは選択アルゴリズムのみを持つ。
 */

export interface TileAnchor {
  tile: TileId
  locId: string
}

export interface MeasuredAnchor extends TileAnchor {
  /** ビューポート上端からのタイル上辺位置 (px)。画面外上方は負値 */
  top: number
}

/**
 * 縦積みタイルの中から現在地タイルを選ぶ。
 * 基準線 (probe) 以上に上へ達した最後のタイル = いま見ているタイル。
 * anchors は文書順 (= 縦積み順) で渡すこと。どのタイルも基準線に達していなければ null。
 */
export function pickActiveAnchor(
  anchors: readonly MeasuredAnchor[],
  probe: number
): TileAnchor | null {
  let current: TileAnchor | null = null
  for (const anchor of anchors) {
    if (anchor.top > probe) break
    current = { tile: anchor.tile, locId: anchor.locId }
  }
  return current
}
