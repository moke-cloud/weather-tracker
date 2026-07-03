import { describe, it, expect } from 'vitest'
import {
  parseJmaTime,
  latLonToTilePixel,
  classifyRainColor,
  buildNowcastSummary,
} from './rain-nowcast'

describe('parseJmaTime', () => {
  it('気象庁のbasetime文字列 (UTC) をepochに変換する', () => {
    // 2026-07-03 12:15:00 UTC = 21:15 JST
    expect(parseJmaTime('20260703121500')).toBe(
      Date.UTC(2026, 6, 3, 12, 15, 0)
    )
  })
})

describe('latLonToTilePixel', () => {
  it('東京 (35.69, 139.692) は z10 でタイル (909, 403) になる', () => {
    const t = latLonToTilePixel(35.69, 139.692, 10)
    expect(t.x).toBe(909)
    expect(t.y).toBe(403)
    expect(t.px).toBeGreaterThanOrEqual(0)
    expect(t.px).toBeLessThanOrEqual(255)
    expect(t.py).toBeGreaterThanOrEqual(0)
    expect(t.py).toBeLessThanOrEqual(255)
  })

  it('経度180度付近でもピクセル位置が範囲内に収まる', () => {
    const t = latLonToTilePixel(35, 179.9999, 10)
    expect(t.px).toBeLessThanOrEqual(255)
  })
})

describe('classifyRainColor', () => {
  it('透明ピクセルは降水なし (0)', () => {
    expect(classifyRainColor(0, 0, 0, 0)).toBe(0)
  })

  it('気象庁パレットの実色を正しいレベルに割り当てる', () => {
    expect(classifyRainColor(242, 242, 255, 255)).toBe(1) // 0.1〜1
    expect(classifyRainColor(160, 210, 255, 255)).toBe(2) // 1〜5
    expect(classifyRainColor(0, 65, 255, 255)).toBe(4) // 10〜20
    expect(classifyRainColor(180, 0, 104, 255)).toBe(8) // 80+
  })

  it('パレットに近い色は最近傍に丸める', () => {
    expect(classifyRainColor(245, 240, 250, 255)).toBe(1)
  })

  it('パレットから極端に遠い未知色は保守的に弱い雨以下にする', () => {
    expect(classifyRainColor(0, 255, 0, 255)).toBeLessThanOrEqual(1)
  })
})

describe('buildNowcastSummary', () => {
  const frames = (levels: number[]) =>
    levels.map((level, i) => ({ minutesFromNow: (i + 1) * 5, level }))

  it('降っていない・降らない → 雨の心配なし', () => {
    expect(buildNowcastSummary(0, frames([0, 0, 0, 0]))).toContain('心配はありません')
  })

  it('降っていないが途中から降る → 何分後に降り出すか', () => {
    const s = buildNowcastSummary(0, frames([0, 0, 2, 2]))
    expect(s).toContain('約15分後')
    expect(s).toContain('降り出す')
  })

  it('降っていて途中でやむ → 何分後にやむか', () => {
    const s = buildNowcastSummary(2, frames([2, 1, 0, 0]))
    expect(s).toContain('現在雨')
    expect(s).toContain('約15分後にやむ')
  })

  it('降り続く → 1時間続く見込み', () => {
    const s = buildNowcastSummary(1, frames([1, 1, 1, 1]))
    expect(s).toContain('少なくとも1時間')
  })

  it('強まりながら降り続く → 強まる旨を出す', () => {
    const s = buildNowcastSummary(1, frames([2, 4, 5, 5]))
    expect(s).toContain('強まり')
  })
})
