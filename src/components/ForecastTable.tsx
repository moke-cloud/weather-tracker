import type { ModelForecast, DailyForecast } from '../lib/types'
import { weatherIcon, formatDate } from '../lib/utils'

interface ForecastTableProps {
  models: ModelForecast[]
  daily: DailyForecast[]
}

export function ForecastTable({ models, daily }: ForecastTableProps) {
  const now = new Date()
  // Show next 24 hours in 3-hour intervals
  const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24].map(
    (offset) => new Date(now.getTime() + offset * 3600_000)
  )

  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 p-4 shadow-sm">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
        マルチモデル予報比較
      </h3>

      {/* Hourly comparison */}
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left py-1 px-2 font-medium">モデル</th>
              {hours.map((h) => (
                <th key={h.toISOString()} className="py-1 px-1 font-medium text-center min-w-[48px]">
                  {h.getHours()}時
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <ModelRow key={m.model} model={m} hours={hours} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Confidence indicator */}
      <ConfidenceRow models={models} hours={hours} />

      {/* Daily forecast */}
      <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-4 mb-2">
        週間予報
      </h4>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {daily.slice(0, 7).map((d) => (
          <DayCard key={d.date} day={d} />
        ))}
      </div>
    </div>
  )
}

function ModelRow({
  model,
  hours,
}: {
  model: ModelForecast
  hours: Date[]
}) {
  return (
    <tr className="border-b border-slate-100 dark:border-slate-700/50">
      <td className="py-1.5 px-2">
        <span
          className="inline-block w-2 h-2 rounded-full mr-1"
          style={{ backgroundColor: model.color }}
        />
        {model.model}
      </td>
      {hours.map((h) => {
        const point = findClosest(model.hourly, h)
        return (
          <td key={h.toISOString()} className="py-1.5 px-1 text-center">
            {point ? (
              <div>
                <div>{weatherIcon(point.weatherCode)}</div>
                <div className="font-medium">
                  {point.temperature !== null
                    ? `${point.temperature.toFixed(0)}\u00B0`
                    : '--'}
                </div>
              </div>
            ) : (
              '--'
            )}
          </td>
        )
      })}
    </tr>
  )
}

function ConfidenceRow({
  models,
  hours,
}: {
  models: ModelForecast[]
  hours: Date[]
}) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-slate-500 dark:text-slate-400 mr-1 shrink-0">信頼度:</span>
      {hours.map((h) => {
        const temps = models
          .map((m) => findClosest(m.hourly, h)?.temperature)
          .filter((t): t is number => t !== null && t !== undefined)
        if (temps.length < 2) return <span key={h.toISOString()} className="flex-1" />
        const spread = Math.max(...temps) - Math.min(...temps)
        const confidence = spread < 1.5 ? 'high' : spread < 3 ? 'mid' : 'low'
        const colors = {
          high: 'bg-green-400 dark:bg-green-500',
          mid: 'bg-yellow-400 dark:bg-yellow-500',
          low: 'bg-red-400 dark:bg-red-500',
        }
        return (
          <div
            key={h.toISOString()}
            className={`flex-1 h-2 rounded-full ${colors[confidence]}`}
            title={`温度差 ${spread.toFixed(1)}\u00B0C`}
          />
        )
      })}
    </div>
  )
}

function DayCard({ day }: { day: DailyForecast }) {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  const d = new Date(day.date + 'T00:00:00')
  const wd = weekdays[d.getDay()]

  return (
    <div className="flex-shrink-0 w-16 text-center bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2">
      <div className="text-xs text-slate-500 dark:text-slate-400">
        {formatDate(day.date + 'T00:00:00')}
        <span className={wd === '日' ? 'text-red-500 ml-0.5' : wd === '土' ? 'text-blue-500 ml-0.5' : 'ml-0.5'}>
          {wd}
        </span>
      </div>
      <div className="text-lg my-1">{weatherIcon(day.weatherCode)}</div>
      <div className="text-xs">
        <span className="text-red-500 font-medium">
          {day.tempMax !== null ? `${day.tempMax.toFixed(0)}\u00B0` : '--'}
        </span>
        <span className="text-slate-400 mx-0.5">/</span>
        <span className="text-blue-500 font-medium">
          {day.tempMin !== null ? `${day.tempMin.toFixed(0)}\u00B0` : '--'}
        </span>
      </div>
      {day.precipSum !== null && day.precipSum > 0 && (
        <div className="text-xs text-blue-500 mt-0.5">
          {day.precipSum.toFixed(0)}mm
        </div>
      )}
    </div>
  )
}

function findClosest(
  hourly: { time: string; temperature: number | null; weatherCode: number | null }[],
  target: Date
) {
  let best = hourly[0] ?? null
  let bestDiff = Infinity
  for (const h of hourly) {
    const diff = Math.abs(new Date(h.time).getTime() - target.getTime())
    if (diff < bestDiff) {
      bestDiff = diff
      best = h
    }
  }
  if (bestDiff > 2 * 3600_000) return null
  return best
}
