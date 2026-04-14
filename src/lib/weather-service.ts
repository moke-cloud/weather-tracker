import type { Location, LocationWeather } from './types'
import { fetchAmedasLatest, fetchAmedasStations, findNearestStation } from './amedas'
import {
  fetchMultiModelForecast,
  fetchEnsembleForecast,
  fetchAirQuality,
} from './open-meteo'

export async function fetchWeatherForLocation(
  location: Location
): Promise<LocationWeather> {
  const [forecastResult, ensemble, airQuality, amedasObs] = await Promise.all([
    fetchMultiModelForecast(location.latitude, location.longitude),
    fetchEnsembleForecast(location.latitude, location.longitude),
    fetchAirQuality(location.latitude, location.longitude),
    fetchAmedasObservation(location),
  ])

  return {
    location,
    amedas: amedasObs,
    models: forecastResult.models,
    ensemble,
    airQuality,
    daily: forecastResult.daily,
    fetchedAt: Date.now(),
  }
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
