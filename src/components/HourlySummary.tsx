import type { ModelForecast } from '../lib/types'
import { computeApparentTemperature } from '../lib/utils'
import { WeatherIcon } from './WeatherIcon'
import { UmbrellaIcon, ThermometerIcon } from './icons'
import { InfoTooltip } from './InfoTooltip'

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
    <div className="rounded-lg bg-surface p-4 shadow-md">
      <h3 className="text-xs font-medium tracking-wide text-ink-muted mb-3">今後24時間の予報</h3>
      <div className="overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {hours.map((h, i) => {
            const hour = new Date(h.time).getHours()
            const prob = probMap.get(h.time) ?? null
            const showLabel = i === 0 || hour % 3 === 0

            return (
              <div key={h.time} className="flex flex-col items-center w-11 shrink-0">
                {/* Time */}
                <div className="nums text-[10px] text-ink-subtle h-4">
                  {showLabel ? `${hour}時` : ''}
                </div>

                {/* Weather icon */}
                <div className="my-0.5">
                  <WeatherIcon code={h.weatherCode} date={new Date(h.time)} size={22} className="text-ink-muted" />
                </div>

                {/* Temperature */}
                <div className="nums text-xs font-semibold text-ink">
                  {h.temperature !== null ? `${h.temperature.toFixed(0)}°C` : ''}
                </div>
                {(() => {
                  const feels =
                    h.apparentTemperature ??
                    computeApparentTemperature(h.temperature, h.humidity, h.windSpeed)
                  if (feels === null || h.temperature === null) return null
                  if (Math.abs(feels - h.temperature) < 2) return null
                  return (
                    <div
                      className="nums text-[9px] text-ink-subtle -mt-0.5"
                      title={`体感 ${feels.toFixed(0)}℃ (気温${h.temperature.toFixed(0)}℃との差${(feels - h.temperature).toFixed(1)}℃)`}
                    >
                      (体感{feels.toFixed(0)}°)
                    </div>
                  )
                })()}

                {/* Precipitation probability bar */}
                <div
                  className="w-5 h-10 bg-surface-sunk rounded-sm mt-1 relative overflow-hidden"
                  title={prob !== null ? `降水確率 ${prob}%` : ''}
                >
                  {prob !== null && prob > 0 && (
                    <div
                      className={`absolute bottom-0 w-full rounded-sm transition-all duration-300 ease-out bg-cool ${
                        prob >= 60 ? 'opacity-100' : prob >= 30 ? 'opacity-70' : 'opacity-45'
                      }`}
                      style={{ height: `${prob}%` }}
                    />
                  )}
                </div>

                {/* Probability text */}
                <div
                  className={`nums text-[10px] mt-0.5 font-medium ${
                    prob !== null && prob >= 50 ? 'text-cool' : 'text-ink-subtle'
                  }`}
                >
                  {prob !== null ? `${prob}%` : '-'}
                </div>

                {/* Precipitation amount */}
                {h.precipitation !== null && h.precipitation > 0 && (
                  <div className="nums text-[9px] text-cool">{h.precipitation.toFixed(1)}mm</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px] text-ink-subtle">
        <span className="inline-flex items-center gap-1">
          <ThermometerIcon size={13} className="text-ink-subtle" /> 気温 (℃)
          <span className="opacity-75">/ カッコ内は</span>
          <span className="opacity-75">体感温度</span>
          <InfoTooltip term="apparentTemperature" />
        </span>
        <span className="inline-flex items-center gap-1">
          <UmbrellaIcon size={13} className="text-cool" /> 降水確率 (%)
          <InfoTooltip term="precipProbability" />
        </span>
        <span className="inline-flex items-center gap-1">
          降水確率の出典: ECMWF
          <InfoTooltip term="ecmwfIfs" />
        </span>
      </div>
    </div>
  )
}
