import type { Location, LocationWeather, SourceStatus } from './types'
import { fetchAmedasLatest, fetchAmedasStations, findNearestStation } from './amedas'
import {
  fetchMultiModelForecast,
  fetchEnsembleForecast,
  fetchAirQuality,
} from './open-meteo'
import { computeConsensus } from './consensus'
import { saveWeatherSnapshot, loadWeatherSnapshot } from './weather-cache'
import {
  getModelSkills,
  getModelBiases,
  skillsToWeights,
  logForecasts,
  reconcileObservation,
} from './accuracy'

/**
 * 地点の天気データを全ソースから取得する。
 *
 * 可用性設計:
 * - 4ソース (予報/アンサンブル/大気質/AMeDAS) は Promise.allSettled で独立取得。
 *   1ソースの障害が他を道連れにしない。
 * - 必須なのは予報のみ。予報が全滅した場合は last-good キャッシュを
 *   stale フラグ付きで返す (48時間以内のもの)。
 * - キャッシュも無いときだけ throw。
 */
export async function fetchWeatherForLocation(
  location: Location
): Promise<LocationWeather> {
  const [forecastR, ensembleR, airQualityR, amedasR] = await Promise.allSettled([
    fetchMultiModelForecast(location.latitude, location.longitude),
    fetchEnsembleForecast(location.latitude, location.longitude),
    fetchAirQuality(location.latitude, location.longitude),
    fetchAmedasObservation(location),
  ])

  if (forecastR.status === 'rejected') {
    const cached = await loadWeatherSnapshot(location.id)
    if (cached) {
      return { ...cached, stale: true }
    }
    throw new Error(
      '予報データの取得に失敗しました。時間をおいて再試行してください。'
    )
  }

  const forecast = forecastR.value
  const ensemble = ensembleR.status === 'fulfilled' ? ensembleR.value : []
  const airQuality = airQualityR.status === 'fulfilled' ? airQualityR.value : null
  const amedas = amedasR.status === 'fulfilled' ? amedasR.value : null

  const sources: SourceStatus = {
    forecast: forecast.status === 'ok' ? 'ok' : 'partial',
    ensemble: ensemble.length > 0 ? 'ok' : 'error',
    airQuality: airQuality ? 'ok' : 'error',
    amedas: amedas ? 'ok' : 'error',
  }

  // 検証ログ: 今回の予報を記録し、実測が届いた対象時刻を照合する
  await logForecasts(location.id, forecast.models)
  if (amedas) {
    await reconcileObservation(location.id, amedas)
  }

  // 検証成績由来の動的重み + 系統バイアス補正でコンセンサス予報を生成
  const [skills, biases] = await Promise.all([getModelSkills(), getModelBiases()])
  const consensus = computeConsensus(
    forecast.models,
    amedas,
    skillsToWeights(skills),
    Date.now(),
    biases
  )

  const data: LocationWeather = {
    location,
    amedas,
    models: forecast.models,
    consensus,
    ensemble,
    airQuality,
    daily: forecast.daily,
    fetchedAt: Date.now(),
    sources,
  }

  await saveWeatherSnapshot(data)
  return data
}

async function fetchAmedasObservation(location: Location) {
  if (location.amedasStationId) {
    return fetchAmedasLatest(location.amedasStationId)
  }
  try {
    const stations = await fetchAmedasStations()
    const nearest = findNearestStation(
      stations,
      location.latitude,
      location.longitude
    )
    if (nearest) {
      return fetchAmedasLatest(nearest.id)
    }
  } catch {
    // AMeDAS is supplementary; don't fail if unavailable
  }
  return null
}
