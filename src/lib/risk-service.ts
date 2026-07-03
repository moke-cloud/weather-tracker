/**
 * 頭痛リスク計算の共通入口。
 * ページ (Dashboard / HeadacheRiskPanel) と Service Worker の両方から使い、
 * 「コンセンサス予報を入力にする」「日記からの個人化重みを適用する」を
 * 一元化する。
 */

import type { LocationWeather, HeadacheRiskResult } from './types'
import { calculateHeadacheRisk } from './headache-model'
import { getDiaryEntries } from './diary'
import { getPersonalWeights } from './headache-personalize'

export async function computeRiskForData(
  data: LocationWeather
): Promise<HeadacheRiskResult> {
  let personal = null
  try {
    const entries = await getDiaryEntries(200)
    personal = getPersonalWeights(entries)
  } catch {
    // 日記が読めなくても既定重みで計算を続行
  }

  return calculateHeadacheRisk(data.models, data.ensemble, {
    preferred: data.consensus,
    weights: personal?.weights,
    personalBasis: personal?.basis ?? null,
  })
}
