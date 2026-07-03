/**
 * 傘予報: 「いつからいつまで傘が必要か」を時間帯レンジで出す。
 *
 * 判定はコンセンサス予報 (なければ筆頭モデル) の
 * 降水確率・降水量・風速から3段階:
 * - fold     折りたたみで十分 (降水確率30%以上 or 弱い雨)
 * - umbrella 傘必須 (降水確率60%以上 or 1mm/h以上)
 * - strong   強雨・強風 (4mm/h以上、または雨+風10m/s以上 → 折りたたみ不可)
 *
 * confidence はモデル間合意度: その時刻に「雨」を予測しているモデルの割合。
 */

import type {
  EnsembleBand,
  ModelForecast,
  UmbrellaForecast,
  UmbrellaHour,
  UmbrellaLevel,
  UmbrellaRange,
} from './types'

const DEFAULT_HORIZON_HOURS = 48

/** レンジ間の乾いた1時間は結合する (「15-16時と18時」より「15-18時」が実用的) */
const MERGE_GAP_HOURS = 1

const LEVEL_RANK: Record<UmbrellaLevel, number> = {
  fold: 1,
  umbrella: 2,
  strong: 3,
}

function classifyHour(
  probability: number | null,
  precipitation: number | null,
  windSpeed: number | null
): UmbrellaLevel | null {
  const prob = probability ?? 0
  const rain = precipitation ?? 0
  const wind = windSpeed ?? 0

  if (rain >= 4 || (rain >= 1 && wind >= 10)) return 'strong'
  if (prob >= 60 || rain >= 1) return 'umbrella'
  if (prob >= 30 || rain >= 0.2) return 'fold'
  return null
}

/** その時刻に雨を予測しているモデルの割合 (データのあるモデルのみ母数) */
function modelAgreement(models: ModelForecast[], time: string): number {
  let withData = 0
  let predictRain = 0
  for (const m of models) {
    const p = m.hourly.find((h) => h.time === time)
    if (!p) continue
    const hasData = p.precipitation != null || p.precipitationProbability != null
    if (!hasData) continue
    withData++
    if ((p.precipitation ?? 0) >= 0.1 || (p.precipitationProbability ?? 0) >= 40) {
      predictRain++
    }
  }
  if (withData === 0) return 0
  return predictRain / withData
}

function mergeRanges(ranges: UmbrellaRange[]): UmbrellaRange[] {
  const merged: UmbrellaRange[] = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last) {
      // end はその1時間を含むため、実際に乾いている時間は (start - end) - 1h
      const dryHours =
        (new Date(range.start).getTime() - new Date(last.end).getTime()) / 3_600_000 - 1
      if (dryHours <= MERGE_GAP_HOURS + 0.5) {
        merged[merged.length - 1] = {
          start: last.start,
          end: range.end,
          level: LEVEL_RANK[range.level] > LEVEL_RANK[last.level] ? range.level : last.level,
          maxProbability: Math.max(last.maxProbability, range.maxProbability),
          maxPrecipitation: Math.max(last.maxPrecipitation, range.maxPrecipitation),
          confidence: (last.confidence + range.confidence) / 2,
        }
        continue
      }
    }
    merged.push(range)
  }
  return merged
}

function buildRanges(hours: UmbrellaHour[]): UmbrellaRange[] {
  const ranges: UmbrellaRange[] = []
  let current: (UmbrellaRange & { confSum: number; count: number }) | null = null

  for (const h of hours) {
    if (h.level == null) {
      if (current) {
        ranges.push(finishRange(current))
        current = null
      }
      continue
    }
    if (!current) {
      current = {
        start: h.time,
        end: h.time,
        level: h.level,
        maxProbability: h.probability ?? 0,
        maxPrecipitation: h.precipitation ?? 0,
        confidence: 0,
        confSum: h.confidence,
        count: 1,
      }
    } else {
      current.end = h.time
      if (LEVEL_RANK[h.level] > LEVEL_RANK[current.level]) current.level = h.level
      current.maxProbability = Math.max(current.maxProbability, h.probability ?? 0)
      current.maxPrecipitation = Math.max(current.maxPrecipitation, h.precipitation ?? 0)
      current.confSum += h.confidence
      current.count++
    }
  }
  if (current) ranges.push(finishRange(current))
  return mergeRanges(ranges)
}

function finishRange(
  r: UmbrellaRange & { confSum: number; count: number }
): UmbrellaRange {
  return {
    start: r.start,
    end: r.end,
    level: r.level,
    maxProbability: Math.round(r.maxProbability),
    maxPrecipitation: Math.round(r.maxPrecipitation * 10) / 10,
    confidence: Math.round((r.confSum / r.count) * 100) / 100,
  }
}

const LEVEL_LABEL: Record<UmbrellaLevel, string> = {
  fold: '折りたたみ傘',
  umbrella: '傘必須',
  strong: '傘必須 (強雨・強風注意)',
}

function dayLabel(time: string, now: number): string {
  const d = new Date(time)
  const base = new Date(now)
  base.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((d.getTime() - base.getTime()) / 86_400_000)
  if (diffDays <= 0) return '今日'
  if (diffDays === 1) return '明日'
  return '明後日'
}

function buildSummary(ranges: UmbrellaRange[], now: number): string {
  if (ranges.length === 0) {
    return '48時間以内に傘の出番はなさそうです'
  }
  const parts = ranges.slice(0, 3).map((r) => {
    const startH = new Date(r.start).getHours()
    const endH = new Date(r.end).getHours()
    const day = dayLabel(r.start, now)
    const span =
      dayLabel(r.end, now) === day
        ? `${startH}時〜${endH + 1}時`
        : `${startH}時〜${dayLabel(r.end, now)}${endH + 1}時`
    return `${day} ${span} ${LEVEL_LABEL[r.level]}`
  })
  return parts.join(' / ')
}

/**
 * アンサンブル降水確率 (82メンバー) と決定論モデル由来の確率をブレンドする。
 * アンサンブル由来のPoPは決定論由来より検証成績が良いため重み0.6。
 */
function blendProbability(
  modelProb: number | null,
  ensembleRainProb: number | null | undefined
): number | null {
  if (ensembleRainProb == null) return modelProb
  const ensemblePct = ensembleRainProb * 100
  if (modelProb == null) return Math.round(ensemblePct)
  return Math.round(modelProb * 0.4 + ensemblePct * 0.6)
}

/**
 * 傘予報を算出する。
 * @param models 全モデル (合意度計算に使用)
 * @param consensus コンセンサス予報 (null なら models[0] で判定)
 * @param horizonHours 予報対象時間 (既定48h)
 * @param now テスト用の現在時刻
 * @param ensemble アンサンブル (あれば降水確率をメンバー由来で強化)
 */
export function computeUmbrellaForecast(
  models: ModelForecast[],
  consensus: ModelForecast | null,
  horizonHours: number = DEFAULT_HORIZON_HOURS,
  now: number = Date.now(),
  ensemble: EnsembleBand[] = []
): UmbrellaForecast {
  const source = consensus ?? models[0]
  if (!source) {
    return { hours: [], ranges: [], summary: 'データがありません' }
  }

  const rainProbByTime = new Map(
    ensemble.filter((e) => e.rainProb != null).map((e) => [e.time, e.rainProb!])
  )

  const hours: UmbrellaHour[] = source.hourly
    .filter((h) => {
      const t = new Date(h.time).getTime()
      return t >= now - 30 * 60_000 && t <= now + horizonHours * 3_600_000
    })
    .map((h) => {
      const probability = blendProbability(
        h.precipitationProbability,
        rainProbByTime.get(h.time)
      )
      return {
        time: h.time,
        level: classifyHour(probability, h.precipitation, h.windSpeed),
        probability,
        precipitation: h.precipitation,
        confidence: modelAgreement(models, h.time),
      }
    })

  const ranges = buildRanges(hours)
  return { hours, ranges, summary: buildSummary(ranges, now) }
}
