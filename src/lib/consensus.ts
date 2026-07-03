/**
 * コンセンサス予報エンジン
 *
 * 3モデル (JMA MSM / ECMWF IFS / GFS) を加重ブレンドし、さらに
 * AMeDAS実測値との差分で直近12時間をバイアス補正 (ナッジング) した
 * 「単一のベスト予報」を生成する。
 *
 * 重みの根拠:
 * - 短期 (0-48h): 日本域では高解像度領域モデルの JMA MSM が優位
 * - 中期 (60h-): グローバルモデルの ECMWF IFS が最も検証成績が良い
 *   (WMO Lead Centre 検証で一貫して 500hPa AC トップ)
 * - 実測検証ログ (accuracy.ts) が十分溜まれば動的重みが短期側を置き換える
 */

import type { ModelForecast, HourlyPoint, AmedasObservation } from './types'

export const CONSENSUS_LABEL = 'コンセンサス'
export const CONSENSUS_COLOR = '#6366f1'

/** 短期 (0-48h) の既定重み */
const SHORT_WEIGHTS: Record<string, number> = { JMA: 0.45, ECMWF: 0.35, GFS: 0.2 }
/** 中期 (60h以降) の重み: ECMWF優位 */
const MEDIUM_WEIGHTS: Record<string, number> = { JMA: 0.25, ECMWF: 0.5, GFS: 0.25 }
/** 短期→中期へ重みを線形遷移させるリード時間帯 */
const TRANSITION_START_H = 36
const TRANSITION_END_H = 60

/** ナッジング: 実測との差をこの時間かけてゼロに減衰させる */
const NUDGE_DECAY_HOURS = 12
/** 異常観測値でブレンドを汚染しないための補正量上限 */
const NUDGE_CAP = { temp: 5, pressure: 5, humidity: 20 }

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** リード時間に応じたモデル重み (dynamicWeights は短期側を置き換える) */
export function effectiveWeights(
  leadHours: number,
  dynamicWeights?: Record<string, number> | null
): Record<string, number> {
  const short = dynamicWeights ?? SHORT_WEIGHTS
  if (leadHours <= TRANSITION_START_H) return short
  if (leadHours >= TRANSITION_END_H) return MEDIUM_WEIGHTS

  const t = (leadHours - TRANSITION_START_H) / (TRANSITION_END_H - TRANSITION_START_H)
  const blended: Record<string, number> = {}
  for (const key of Object.keys(MEDIUM_WEIGHTS)) {
    blended[key] = (short[key] ?? 0) * (1 - t) + MEDIUM_WEIGHTS[key] * t
  }
  return blended
}

type NumericField =
  | 'temperature'
  | 'apparentTemperature'
  | 'pressureMsl'
  | 'surfacePressure'
  | 'precipitation'
  | 'precipitationProbability'
  | 'humidity'
  | 'windSpeed'

const NUMERIC_FIELDS: NumericField[] = [
  'temperature',
  'apparentTemperature',
  'pressureMsl',
  'surfacePressure',
  'precipitation',
  'precipitationProbability',
  'humidity',
  'windSpeed',
]

/** null を除いた重み付き平均 (重みは非nullモデル分で再正規化) */
function weightedMean(
  values: { value: number | null; weight: number }[]
): number | null {
  let sum = 0
  let wSum = 0
  for (const { value, weight } of values) {
    if (value == null) continue
    sum += value * weight
    wSum += weight
  }
  if (wSum === 0) return null
  return sum / wSum
}

function blendPoint(
  models: ModelForecast[],
  index: number,
  time: string,
  weights: Record<string, number>
): HourlyPoint {
  const point: HourlyPoint = {
    time,
    temperature: null,
    apparentTemperature: null,
    weatherCode: null,
    pressureMsl: null,
    surfacePressure: null,
    precipitation: null,
    precipitationProbability: null,
    humidity: null,
    windSpeed: null,
  }

  for (const field of NUMERIC_FIELDS) {
    point[field] = weightedMean(
      models.map((m) => ({
        value: m.hourly[index]?.[field] ?? null,
        weight: weights[m.model] ?? 0,
      }))
    )
  }

  // weatherCode はカテゴリ値: 最重みの非nullモデルから採用
  const byWeight = [...models].sort(
    (a, b) => (weights[b.model] ?? 0) - (weights[a.model] ?? 0)
  )
  for (const m of byWeight) {
    const code = m.hourly[index]?.weatherCode
    if (code != null) {
      point.weatherCode = code
      break
    }
  }
  return point
}

interface NudgeOffsets {
  temp: number
  pressure: number
  humidity: number
  obsTime: number
}

/** AMeDAS実測とブレンド値の差分 (観測時刻に最も近い時点で算出) */
function computeNudgeOffsets(
  points: HourlyPoint[],
  amedas: AmedasObservation
): NudgeOffsets | null {
  const obsTime = new Date(amedas.time).getTime()
  if (Number.isNaN(obsTime)) return null

  let nearest: HourlyPoint | null = null
  let nearestDt = Infinity
  for (const p of points) {
    const dt = Math.abs(new Date(p.time).getTime() - obsTime)
    if (dt < nearestDt) {
      nearestDt = dt
      nearest = p
    }
  }
  if (!nearest || nearestDt > 90 * 60_000) return null

  const tempOff =
    amedas.temp != null && nearest.temperature != null
      ? clamp(amedas.temp - nearest.temperature, -NUDGE_CAP.temp, NUDGE_CAP.temp)
      : 0
  const pressOff =
    amedas.pressureSea != null && nearest.pressureMsl != null
      ? clamp(amedas.pressureSea - nearest.pressureMsl, -NUDGE_CAP.pressure, NUDGE_CAP.pressure)
      : 0
  const humidOff =
    amedas.humidity != null && nearest.humidity != null
      ? clamp(amedas.humidity - nearest.humidity, -NUDGE_CAP.humidity, NUDGE_CAP.humidity)
      : 0

  if (tempOff === 0 && pressOff === 0 && humidOff === 0) return null
  return { temp: tempOff, pressure: pressOff, humidity: humidOff, obsTime }
}

/** 観測時刻以降のポイントへ、減衰付きでバイアス補正を適用 */
function applyNudge(points: HourlyPoint[], offsets: NudgeOffsets): HourlyPoint[] {
  return points.map((p) => {
    const t = new Date(p.time).getTime()
    const hoursAfterObs = (t - offsets.obsTime) / 3_600_000
    if (hoursAfterObs < -1) return p
    const factor = clamp(1 - Math.max(0, hoursAfterObs) / NUDGE_DECAY_HOURS, 0, 1)
    if (factor === 0) return p
    return {
      ...p,
      temperature:
        p.temperature != null ? p.temperature + offsets.temp * factor : null,
      pressureMsl:
        p.pressureMsl != null ? p.pressureMsl + offsets.pressure * factor : null,
      humidity:
        p.humidity != null
          ? clamp(p.humidity + offsets.humidity * factor, 0, 100)
          : null,
    }
  })
}

/**
 * コンセンサス予報を生成する。
 * @param models 取得できたモデル予報 (1つ以上)
 * @param amedas 実測値 (null可; あればナッジング)
 * @param dynamicWeights accuracy.ts の検証成績由来の重み (null で既定重み)
 * @param now テスト用の現在時刻
 */
export function computeConsensus(
  models: ModelForecast[],
  amedas: AmedasObservation | null,
  dynamicWeights?: Record<string, number> | null,
  now: number = Date.now()
): ModelForecast | null {
  const withData = models.filter((m) => m.hourly.length > 0)
  if (withData.length === 0) return null

  // 時間軸は最長のモデルに合わせる (全モデル同一時間軸が前提だが欠損に備える)
  const base = withData.reduce((a, b) =>
    a.hourly.length >= b.hourly.length ? a : b
  )

  let points = base.hourly.map((h, i) => {
    const leadHours = (new Date(h.time).getTime() - now) / 3_600_000
    const weights = effectiveWeights(Math.max(0, leadHours), dynamicWeights)
    return blendPoint(withData, i, h.time, weights)
  })

  if (amedas) {
    const offsets = computeNudgeOffsets(points, amedas)
    if (offsets) points = applyNudge(points, offsets)
  }

  return { model: CONSENSUS_LABEL, color: CONSENSUS_COLOR, hourly: points }
}
