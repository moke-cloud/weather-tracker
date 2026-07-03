/**
 * 頭痛リスクの個人化: 頭痛日記の発症記録から「この人がどの気象因子に
 * 敏感か」を推定し、リスクモデルの因子重みを個人向けに調整する。
 *
 * 方法: 発症時の気象条件の出現率を、一般的な気候での期待出現率
 * (ベースレート) と比較する。例えば「気圧低下中の発症」が期待より
 * 明らかに多ければ、気圧変化率因子の重みを引き上げる。
 * 逆に少なければ引き下げる (最大±60%、リスクの取り過ぎ防止)。
 *
 * 統計的な安定性のため、日記が5件以上たまるまでは既定重みのまま。
 */

import type { DiaryEntry, PersonalWeights } from './types'

/** パーソナライズ発動に必要な最小記録数 */
export const MIN_ENTRIES = 5

/** 重み倍率の下限・上限 (一因子への過剰依存を防ぐ) */
const MULTIPLIER_MIN = 0.6
const MULTIPLIER_MAX = 1.6

/** 既定重み (headache-model.ts と一致させること) */
const BASE_WEIGHTS: Record<string, number> = {
  pressure_rate: 0.35,
  absolute_pressure: 0.08,
  temp_change: 0.18,
  humidity: 0.14,
  front: 0.15,
  consensus: 0.1,
}

interface FactorProbe {
  factorId: string
  /** この条件に該当した発症記録の割合を測る述語 */
  matches: (e: DiaryEntry) => boolean | null
  /** 一般気候での期待出現率 (日本の平均的な頻度の概算) */
  baseRate: number
  noteHigh: string
  noteLow: string
}

const PROBES: FactorProbe[] = [
  {
    factorId: 'pressure_rate',
    matches: (e) =>
      e.pressureChange3h == null ? null : e.pressureChange3h <= -1.5,
    baseRate: 0.15,
    noteHigh: '気圧低下時の発症が多く、気圧変化への感受性が高いようです',
    noteLow: '気圧低下と発症の関連は平均より弱いようです',
  },
  {
    factorId: 'absolute_pressure',
    matches: (e) => (e.pressure == null ? null : e.pressure < 1008),
    baseRate: 0.3,
    noteHigh: '低気圧下 (1008hPa未満) での発症が目立ちます',
    noteLow: '絶対気圧の低さと発症の関連は弱いようです',
  },
  {
    factorId: 'humidity',
    matches: (e) => (e.humidity == null ? null : e.humidity >= 75),
    baseRate: 0.4,
    noteHigh: '高湿度時の発症が多い傾向があります',
    noteLow: '湿度と発症の関連は平均より弱いようです',
  },
]

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * 日記から個人化された因子重みを算出する。
 * 記録が MIN_ENTRIES 未満、または判定可能なデータが無い場合は null。
 */
export function getPersonalWeights(entries: DiaryEntry[]): PersonalWeights | null {
  if (entries.length < MIN_ENTRIES) return null

  const multipliers: Record<string, number> = {}
  const notes: string[] = []
  let anySignal = false

  for (const probe of PROBES) {
    const evaluated = entries
      .map((e) => probe.matches(e))
      .filter((v): v is boolean => v !== null)
    if (evaluated.length < MIN_ENTRIES) continue

    const observedRate = evaluated.filter(Boolean).length / evaluated.length
    // 比率の平方根で緩やかに効かせる (少数記録での過剰反応を抑制)
    const ratio = Math.sqrt(observedRate / probe.baseRate || 0)
    const multiplier = clamp(ratio, MULTIPLIER_MIN, MULTIPLIER_MAX)

    if (Math.abs(multiplier - 1) >= 0.1) {
      multipliers[probe.factorId] = multiplier
      anySignal = true
      notes.push(multiplier > 1 ? probe.noteHigh : probe.noteLow)
    }
  }

  if (!anySignal) return null

  // 倍率適用 → 合計1に再正規化
  const adjusted: Record<string, number> = {}
  for (const [id, base] of Object.entries(BASE_WEIGHTS)) {
    adjusted[id] = base * (multipliers[id] ?? 1)
  }
  const total = Object.values(adjusted).reduce((s, v) => s + v, 0)
  for (const id of Object.keys(adjusted)) {
    adjusted[id] = adjusted[id] / total
  }

  return { weights: adjusted, basis: entries.length, notes }
}
