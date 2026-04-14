import { useState, useEffect, useCallback } from 'react'
import type { LocationWeather } from '../lib/types'
import { fetchWeatherForLocation } from '../lib/weather-service'
import type { Location } from '../lib/types'
import { WeatherCard } from './WeatherCard'
import { AirQualityCard } from './AirQualityCard'
import { HeadacheAlert } from './HeadacheAlert'
import { HourlySummary } from './HourlySummary'
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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

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
        <div className="text-5xl mb-4">{'🌤️'}</div>
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
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold">{loc.name}</h2>
              <div className="flex items-center gap-2">
                {data && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {new Date(data.fetchedAt).toLocaleTimeString('ja-JP', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    更新
                  </span>
                )}
                <button
                  onClick={() => fetchData(loc)}
                  disabled={isLoading}
                  className="text-xs px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50"
                >
                  {isLoading ? '更新中...' : '↻'}
                </button>
                <button
                  onClick={() => onRemoveLocation(loc.id)}
                  className="text-xs px-2 py-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  ✕
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
              <div className="space-y-3">
                {/* ===== 1. いま見るべき情報 ===== */}
                {/* Current weather + headache alert side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <WeatherCard amedas={data.amedas} models={data.models} />
                  <HeadacheAlert
                    models={data.models}
                    ensemble={data.ensemble}
                  />
                </div>

                {/* ===== 2. 時間ごと予報（降水確率メイン） ===== */}
                <HourlySummary models={data.models} />

                {/* ===== 3. 週間予報 ===== */}
                <ForecastTable daily={data.daily} />

                {/* ===== 4. 詳細データ（折りたたみ） ===== */}
                <CollapsibleSection
                  title="📊 気圧トレンド・アンサンブル"
                  isOpen={expandedSections.has(`pressure_${loc.id}`)}
                  onToggle={() => toggleSection(`pressure_${loc.id}`)}
                >
                  <PressureChart
                    models={data.models}
                    ensemble={data.ensemble}
                    amedas={data.amedas}
                  />
                </CollapsibleSection>

                <CollapsibleSection
                  title="🌍 UV・大気質 (PM2.5/AQI)"
                  isOpen={expandedSections.has(`aqi_${loc.id}`)}
                  onToggle={() => toggleSection(`aqi_${loc.id}`)}
                >
                  <AirQualityCard data={data.airQuality} />
                </CollapsibleSection>

                <CollapsibleSection
                  title="🔬 マルチモデル比較"
                  isOpen={expandedSections.has(`models_${loc.id}`)}
                  onToggle={() => toggleSection(`models_${loc.id}`)}
                >
                  <ModelComparisonInfo models={data.models} />
                </CollapsibleSection>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <span>{title}</span>
        <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      {isOpen && <div className="px-0">{children}</div>}
    </div>
  )
}

function ModelComparisonInfo({ models }: { models: LocationWeather['models'] }) {
  const now = new Date()
  const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24].map(
    (offset) => new Date(now.getTime() + offset * 3600_000)
  )

  return (
    <div className="p-4 pt-0">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left py-1 px-2 font-medium">モデル</th>
              {hours.map((h) => (
                <th key={h.toISOString()} className="py-1 px-1 font-medium text-center min-w-[44px]">
                  {h.getHours()}時
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.model} className="border-b border-slate-100 dark:border-slate-700/50">
                <td className="py-1.5 px-2">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: m.color }}
                  />
                  {m.model}
                </td>
                {hours.map((h) => {
                  const point = m.hourly.find((p) => {
                    const diff = Math.abs(new Date(p.time).getTime() - h.getTime())
                    return diff < 2 * 3600_000
                  })
                  return (
                    <td key={h.toISOString()} className="py-1.5 px-1 text-center">
                      {point?.temperature !== null && point?.temperature !== undefined
                        ? `${point.temperature.toFixed(0)}°`
                        : '--'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">
        モデル間の温度差が大きいほど予報の不確実性が高い
      </p>
    </div>
  )
}
