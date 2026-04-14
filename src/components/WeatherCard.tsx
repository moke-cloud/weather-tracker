import type { AmedasObservation, ModelForecast } from '../lib/types'
import { windDirectionLabel, weatherIcon, weatherLabel } from '../lib/utils'

interface WeatherCardProps {
  amedas: AmedasObservation | null
  models: ModelForecast[]
}

export function WeatherCard({ amedas, models }: WeatherCardProps) {
  const now = new Date()
  const currentModel = models[0] // JMA as primary
  const currentHour = currentModel?.hourly.find((h) => {
    const t = new Date(h.time)
    return Math.abs(t.getTime() - now.getTime()) < 3600_000
  })

  const temp = amedas?.temp ?? currentHour?.temperature
  const humidity = amedas?.humidity ?? currentHour?.humidity
  const pressureSea = amedas?.pressureSea ?? currentHour?.pressureMsl
  const windSpeed = amedas?.windSpeed ?? currentHour?.windSpeed
  const precip = amedas?.precipitation1h ?? currentHour?.precipitation
  const wCode = currentHour?.weatherCode ?? null
  const source = amedas ? 'AMeDAS実測' : 'JMA予報'

  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">
          現在の天気
        </h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
          {source}
        </span>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <span className="text-4xl">{weatherIcon(wCode)}</span>
        <div>
          <div className="text-3xl font-bold">
            {temp !== null && temp !== undefined ? `${temp.toFixed(1)}\u00B0C` : '--'}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {weatherLabel(wCode)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="海面気圧" value={pressureSea != null ? `${pressureSea.toFixed(1)} hPa` : '--'} />
        <Stat label="湿度" value={humidity != null ? `${humidity}%` : '--'} />
        <Stat
          label="風速"
          value={
            windSpeed != null
              ? `${windSpeed.toFixed(1)} m/s ${amedas?.windDirection ? windDirectionLabel(Number(amedas.windDirection)) : ''}`
              : '--'
          }
        />
        <Stat label="降水量" value={precip != null ? `${precip.toFixed(1)} mm/h` : '--'} />
      </div>

      {amedas && (
        <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          観測時刻: {new Date(amedas.time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  )
}
