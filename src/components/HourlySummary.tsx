import type { ModelForecast } from '../lib/types'
import { weatherIcon } from '../lib/utils'

interface HourlySummaryProps {
  models: ModelForecast[]
}

export function HourlySummary({ models }: HourlySummaryProps) {
  const now = Date.now()
  // Use ECMWF for precip probability (JMA returns null), JMA for weather/temp
  const jma = models.find((m) => m.model === 'JMA')
  const ecmwf = models.find((m) => m.model === 'ECMWF')
  const probSource = ecmwf ?? models[models.length - 1]

  if (!jma) return null

  // Next 24 hours, 1-hour intervals
  const hours = jma.hourly.filter((h) => {
    const t = new Date(h.time).getTime()
    return t >= now && t <= now + 24 * 3600_000
  })

  // Match probSource hours by time
  const probMap = new Map(
    (probSource?.hourly ?? []).map((h) => [h.time, h.precipitationProbability])
  )

  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 p-4 shadow-sm">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
        今後24時間の予報
      </h3>
      <div className="overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {hours.map((h, i) => {
            const hour = new Date(h.time).getHours()
            const prob = probMap.get(h.time) ?? null
            const showLabel = i === 0 || hour % 3 === 0

            return (
              <div
                key={h.time}
                className="flex flex-col items-center w-11 shrink-0"
              >
                {/* Time */}
                <div className="text-[10px] text-slate-400 dark:text-slate-500 h-4">
                  {showLabel ? `${hour}時` : ''}
                </div>

                {/* Weather icon */}
                <div className="text-base leading-none my-0.5">
                  {weatherIcon(h.weatherCode)}
                </div>

                {/* Temperature */}
                <div className="text-xs font-medium">
                  {h.temperature !== null ? `${h.temperature.toFixed(0)}°` : ''}
                </div>
                {h.apparentTemperature !== null && h.temperature !== null &&
                  Math.abs(h.apparentTemperature - h.temperature) >= 2 && (
                  <div className="text-[9px] text-slate-400 dark:text-slate-500 -mt-0.5">
                    ({h.apparentTemperature.toFixed(0)}°)
                  </div>
                )}

                {/* Precipitation probability bar */}
                <div className="w-5 h-10 bg-slate-100 dark:bg-slate-700 rounded-sm mt-1 relative overflow-hidden">
                  {prob !== null && prob > 0 && (
                    <div
                      className={`absolute bottom-0 w-full rounded-sm transition-all ${
                        prob >= 60
                          ? 'bg-blue-500'
                          : prob >= 30
                            ? 'bg-blue-400'
                            : 'bg-blue-300'
                      }`}
                      style={{ height: `${prob}%` }}
                    />
                  )}
                </div>

                {/* Probability text */}
                <div
                  className={`text-[10px] mt-0.5 font-medium ${
                    prob !== null && prob >= 50
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {prob !== null ? `${prob}%` : '-'}
                </div>

                {/* Precipitation amount */}
                {h.precipitation !== null && h.precipitation > 0 && (
                  <div className="text-[9px] text-blue-500">
                    {h.precipitation.toFixed(1)}mm
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400 dark:text-slate-500">
        <span>☀️ 天気 / 🌡️ 気温 / 🌧 降水確率 (ECMWF)</span>
      </div>
    </div>
  )
}
