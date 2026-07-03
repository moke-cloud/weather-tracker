/**
 * 予報検証ログ: 「各モデルの予報」と「AMeDAS実測」を突き合わせて
 * モデルごとの誤差 (MAE) を蓄積し、コンセンサス予報の動的重みを導出する。
 *
 * 仕組み:
 * 1. 天気取得のたびに +3/6/12/24h 先の予報値を記録 (同一対象時刻は初回のみ = 最長リード)
 * 2. AMeDAS実測が対象時刻に達したら照合して観測値を書き込む
 * 3. 直近7日の照合済みエントリから MAE → 逆誤差重みを算出
 *    (サンプルが少ないうちは既定重みとブレンド)
 */

import { openDB, type IDBPDatabase } from 'idb'
import type {
  ModelForecast,
  AmedasObservation,
  ForecastLogEntry,
  ModelSkill,
} from './types'

/*
 * ⚠️ データ永続化に関する注意事項 ⚠️
 * DB_NAME (`tenki-accuracy`) を変更しない。schema 変更時は upgrade() で移行。
 * ログは14日で自動削除されるため肥大化しない。
 */
const DB_NAME = 'tenki-accuracy'
const DB_VERSION = 1

/** 予報を記録するリード時間 (時間) */
const LOG_LEAD_HOURS = [3, 6, 12, 24]
/** 照合時の実測⇔対象時刻の許容ずれ */
const MATCH_TOLERANCE_MS = 35 * 60_000
/** これより古いログは削除 */
const RETENTION_MS = 14 * 24 * 3_600_000
/** 重み算出に使う検証期間 */
const SKILL_WINDOW_MS = 7 * 24 * 3_600_000
/** 動的重みへ完全移行するのに必要なサンプル数の目安 */
const PRIOR_STRENGTH = 24

interface AccuracyDB {
  'forecast-log': {
    key: string
    value: ForecastLogEntry
    indexes: { locationId: string }
  }
}

let dbPromise: Promise<IDBPDatabase<AccuracyDB>> | null = null

function getDB(): Promise<IDBPDatabase<AccuracyDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AccuracyDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('forecast-log')) {
          const store = db.createObjectStore('forecast-log', { keyPath: 'key' })
          store.createIndex('locationId', 'locationId')
        }
      },
    })
  }
  return dbPromise
}

/** 対象時刻に最も近い予報点を返す (±90分以内) */
function pointNear(model: ModelForecast, targetTime: number) {
  let best = null
  let bestDt = Infinity
  for (const p of model.hourly) {
    const dt = Math.abs(new Date(p.time).getTime() - targetTime)
    if (dt < bestDt) {
      bestDt = dt
      best = p
    }
  }
  return bestDt <= 90 * 60_000 ? best : null
}

/** 各モデルの +3/6/12/24h 予報値をログに記録 (既存キーは上書きしない) */
export async function logForecasts(
  locationId: string,
  models: ModelForecast[],
  now: number = Date.now()
): Promise<void> {
  try {
    const db = await getDB()
    const tx = db.transaction('forecast-log', 'readwrite')

    for (const model of models) {
      for (const lead of LOG_LEAD_HOURS) {
        const target = new Date(now + lead * 3_600_000)
        target.setMinutes(0, 0, 0)
        const targetIso = target.toISOString()
        const key = `${locationId}|${model.model}|${targetIso}`

        const existing = await tx.store.get(key)
        if (existing) continue

        const point = pointNear(model, target.getTime())
        if (!point) continue

        await tx.store.put({
          key,
          locationId,
          model: model.model,
          targetTime: targetIso,
          issuedAt: now,
          predictedTemp: point.temperature,
          predictedPressure: point.pressureMsl,
          observedTemp: null,
          observedPressure: null,
          verifiedAt: null,
        })
      }
    }
    await tx.done
  } catch {
    // 検証ログは補助機能: 失敗しても本体を止めない
  }
}

/** AMeDAS実測で未照合エントリを検証し、古いログを掃除する */
export async function reconcileObservation(
  locationId: string,
  amedas: AmedasObservation,
  now: number = Date.now()
): Promise<void> {
  try {
    const obsTime = new Date(amedas.time).getTime()
    if (Number.isNaN(obsTime)) return

    const db = await getDB()
    const entries = await db.getAllFromIndex('forecast-log', 'locationId', locationId)
    const tx = db.transaction('forecast-log', 'readwrite')

    for (const entry of entries) {
      const targetMs = new Date(entry.targetTime).getTime()
      if (now - entry.issuedAt > RETENTION_MS) {
        await tx.store.delete(entry.key)
        continue
      }
      if (entry.verifiedAt != null) continue
      if (Math.abs(targetMs - obsTime) > MATCH_TOLERANCE_MS) continue

      await tx.store.put({
        ...entry,
        observedTemp: amedas.temp,
        observedPressure: amedas.pressureSea,
        verifiedAt: now,
      })
    }
    await tx.done
  } catch {
    // no-op
  }
}

/**
 * 照合済みエントリからモデル成績と動的重みを算出する純関数。
 * 温度と気圧の MAE を典型スケール (2°C / 1.5hPa) で正規化して合成し、
 * 逆誤差を重みに変換。サンプル不足分は prior 重みとブレンドする。
 */
export function computeSkillsFromEntries(
  entries: ForecastLogEntry[],
  priors: Record<string, number>,
  now: number = Date.now()
): ModelSkill[] {
  const TEMP_SCALE = 2
  const PRESSURE_SCALE = 1.5

  const verified = entries.filter(
    (e) =>
      e.verifiedAt != null &&
      now - new Date(e.targetTime).getTime() <= SKILL_WINDOW_MS
  )

  const byModel = new Map<string, ForecastLogEntry[]>()
  for (const e of verified) {
    const list = byModel.get(e.model) ?? []
    list.push(e)
    byModel.set(e.model, list)
  }

  const models = Object.keys(priors)
  const stats = models.map((model) => {
    const list = byModel.get(model) ?? []
    const tempErrs = list
      .filter((e) => e.predictedTemp != null && e.observedTemp != null)
      .map((e) => Math.abs(e.predictedTemp! - e.observedTemp!))
    const pressErrs = list
      .filter((e) => e.predictedPressure != null && e.observedPressure != null)
      .map((e) => Math.abs(e.predictedPressure! - e.observedPressure!))

    const maeTemp =
      tempErrs.length > 0
        ? tempErrs.reduce((s, v) => s + v, 0) / tempErrs.length
        : null
    const maePressure =
      pressErrs.length > 0
        ? pressErrs.reduce((s, v) => s + v, 0) / pressErrs.length
        : null

    const sampleCount = Math.min(tempErrs.length, 999) + Math.min(pressErrs.length, 999)
    return { model, sampleCount, maeTemp, maePressure }
  })

  // 逆誤差スコア (誤差ゼロ発散を防ぐため +0.3 の床)
  const rawScores = stats.map((s) => {
    const parts: number[] = []
    if (s.maeTemp != null) parts.push(s.maeTemp / TEMP_SCALE)
    if (s.maePressure != null) parts.push(s.maePressure / PRESSURE_SCALE)
    if (parts.length === 0) return null
    const normalized = parts.reduce((a, b) => a + b, 0) / parts.length
    return 1 / (normalized + 0.3)
  })

  const validScoreSum = rawScores.reduce<number>((s, v) => s + (v ?? 0), 0)
  const minSamples = Math.min(...stats.map((s) => s.sampleCount))
  const alpha = minSamples / (minSamples + PRIOR_STRENGTH) // 0=priorのみ → 1=実測のみ

  const blended = stats.map((s, i) => {
    const prior = priors[s.model] ?? 1 / models.length
    const skillWeight =
      rawScores[i] != null && validScoreSum > 0 ? rawScores[i]! / validScoreSum : prior
    return { ...s, weight: prior * (1 - alpha) + skillWeight * alpha }
  })

  const total = blended.reduce((s, m) => s + m.weight, 0)
  return blended.map((m) => ({ ...m, weight: total > 0 ? m.weight / total : 0 }))
}

/** 既定 prior (consensus.ts の短期重みと同じ) */
const SKILL_PRIORS: Record<string, number> = {
  JMA: 0.3,
  ECMWF: 0.2,
  ICON: 0.14,
  UKMO: 0.14,
  GFS: 0.11,
  GEM: 0.11,
}

/** 系統バイアス算出に使う検証期間と最小サンプル数 */
const BIAS_WINDOW_MS = 48 * 3_600_000
const BIAS_MIN_SAMPLES = 4
/** 異常値でブレンドを壊さないためのバイアス上限 */
const BIAS_CAP = { temp: 3, pressure: 2 }

/**
 * 直近48時間の照合結果からモデル別の系統誤差 (予報−実測の平均) を算出する
 * 純関数。サンプル不足のモデルは含めない。
 */
export function computeBiasesFromEntries(
  entries: ForecastLogEntry[],
  now: number = Date.now()
): Record<string, { temp: number; pressure: number }> {
  const clampBias = (v: number, cap: number) => Math.max(-cap, Math.min(cap, v))

  const recent = entries.filter(
    (e) =>
      e.verifiedAt != null &&
      now - new Date(e.targetTime).getTime() <= BIAS_WINDOW_MS
  )

  const byModel = new Map<string, ForecastLogEntry[]>()
  for (const e of recent) {
    const list = byModel.get(e.model) ?? []
    list.push(e)
    byModel.set(e.model, list)
  }

  const biases: Record<string, { temp: number; pressure: number }> = {}
  for (const [model, list] of byModel) {
    const tempErrs = list
      .filter((e) => e.predictedTemp != null && e.observedTemp != null)
      .map((e) => e.predictedTemp! - e.observedTemp!)
    const pressErrs = list
      .filter((e) => e.predictedPressure != null && e.observedPressure != null)
      .map((e) => e.predictedPressure! - e.observedPressure!)

    if (tempErrs.length < BIAS_MIN_SAMPLES && pressErrs.length < BIAS_MIN_SAMPLES) {
      continue
    }
    biases[model] = {
      temp:
        tempErrs.length >= BIAS_MIN_SAMPLES
          ? clampBias(tempErrs.reduce((s, v) => s + v, 0) / tempErrs.length, BIAS_CAP.temp)
          : 0,
      pressure:
        pressErrs.length >= BIAS_MIN_SAMPLES
          ? clampBias(pressErrs.reduce((s, v) => s + v, 0) / pressErrs.length, BIAS_CAP.pressure)
          : 0,
    }
  }
  return biases
}

/** IndexedDBのログから系統バイアスを算出 */
export async function getModelBiases(): Promise<
  Record<string, { temp: number; pressure: number }>
> {
  try {
    const db = await getDB()
    const entries = await db.getAll('forecast-log')
    return computeBiasesFromEntries(entries)
  } catch {
    return {}
  }
}

/** IndexedDBから全地点分のログを読み、動的重みを返す */
export async function getModelSkills(): Promise<ModelSkill[]> {
  try {
    const db = await getDB()
    const entries = await db.getAll('forecast-log')
    return computeSkillsFromEntries(entries, SKILL_PRIORS)
  } catch {
    return computeSkillsFromEntries([], SKILL_PRIORS)
  }
}

/** ModelSkill[] → consensus.ts に渡す重みレコード */
export function skillsToWeights(skills: ModelSkill[]): Record<string, number> {
  const weights: Record<string, number> = {}
  for (const s of skills) weights[s.model] = s.weight
  return weights
}
