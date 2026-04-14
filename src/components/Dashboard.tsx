import { useState, useEffect, useCallback } from 'react'
import type { LocationWeather } from '../lib/types'
import { fetchWeatherForLocation } from '../lib/weather-service'
import type { Location } from '../lib/types'
import { WeatherCard } from './WeatherCard'
import { AirQualityCard } from './AirQualityCard'
import { HeadacheAlert } from './HeadacheAlert'
import { PressureChart } from './PressureChart'
import { ForecastTable } from './ForecastTable'

interface DashboardProps {
  locations: Location[]
  onRemoveLocation: (id: string) => void
}

export function Dashboard({ locations, onRemoveLocation }: DashboardProps) {
  const [weatherData, setWeatherData] = useState<Map<string, LocationWeather>>(
    new Map()
  )
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Map<string, string>>(new Map())

  const fetchData = useCallback(async (location: Location) => {
    setLoading((prev) => new Set(prev).add(location.id))
    setErrors((prev) => {
      const next = new Map(prev)
      next.delete(location.id)
      return next
    })

    try {
      const data = await fetchWeatherForLocation(location)
      setWeatherData((prev) => new Map(prev).set(location.id, data))
    } catch (err) {
      setErrors((prev) =>
        new Map(prev).set(
          location.id,
          err instanceof Error ? err.message : 'データ取得に失敗しました'
        )
      )
    } finally {
      setLoading((prev) => {
        const next = new Set(prev)
        next.delete(location.id)
        return next
      })
    }
  }, [])

  useEffect(() => {
    for (const loc of locations) {
      const existing = weatherData.get(loc.id)
      if (!existing || Date.now() - existing.fetchedAt > 10 * 60_000) {
        fetchData(loc)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations])

  if (locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400">
        <div className="text-5xl mb-4">{'\uD83C\uDF24\uFE0F'}</div>
        <p className="text-lg mb-2">地点が登録されていません</p>
        <p className="text-sm">右上の「+ 地点追加」から観測地点を追加してください</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {locations.map((loc) => {
        const data = weatherData.get(loc.id)
        const isLoading = loading.has(loc.id)
        const error = errors.get(loc.id)

        return (
          <section key={loc.id}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold">{loc.name}</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchData(loc)}
                  disabled={isLoading}
                  className="text-xs px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50"
                >
                  {isLoading ? '更新中...' : '更新'}
                </button>
                <button
                  onClick={() => onRemoveLocation(loc.id)}
                  className="text-xs px-3 py-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  削除
                </button>
              </div>
            </div>

            {isLoading && !data && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                <span className="ml-3 text-slate-500 dark:text-slate-400">
                  データ取得中...
                </span>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-4 text-red-700 dark:text-red-300 text-sm">
                {error}
              </div>
            )}

            {data && (
              <div className="space-y-4">
                <HeadacheAlert
                  models={data.models}
                  ensemble={data.ensemble}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <WeatherCard amedas={data.amedas} models={data.models} />
                  <AirQualityCard data={data.airQuality} />
                </div>
                <PressureChart
                  models={data.models}
                  ensemble={data.ensemble}
                  amedas={data.amedas}
                />
                <ForecastTable models={data.models} daily={data.daily} />
              </div>
            )}

            {data && (
              <div className="mt-2 text-xs text-slate-400 dark:text-slate-500 text-right">
                最終更新:{' '}
                {new Date(data.fetchedAt).toLocaleTimeString('ja-JP', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
