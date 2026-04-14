import type { DailyForecast } from '../lib/types'
import { weatherIcon, formatDate } from '../lib/utils'

interface ForecastTableProps {
  daily: DailyForecast[]
}

export function ForecastTable({ daily }: ForecastTableProps) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 p-4 shadow-sm">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
        週間予報
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {daily.slice(0, 7).map((d) => (
          <DayCard key={d.date} day={d} />
        ))}
      </div>
    </div>
  )
}

function DayCard({ day }: { day: DailyForecast }) {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  const d = new Date(day.date + 'T00:00:00')
  const wd = weekdays[d.getDay()]
  const isToday =
    new Date().toDateString() === d.toDateString()

  return (
    <div
      className={`flex-shrink-0 w-16 text-center rounded-lg p-2 ${
        isToday
          ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-300 dark:ring-blue-700'
          : 'bg-slate-50 dark:bg-slate-700/50'
      }`}
    >
      <div className="text-xs text-slate-500 dark:text-slate-400">
        {isToday ? (
          <span className="font-bold text-blue-600 dark:text-blue-400">今日</span>
        ) : (
          <>
            {formatDate(day.date + 'T00:00:00')}
            <span
              className={
                wd === '日'
                  ? 'text-red-500 ml-0.5'
                  : wd === '土'
                    ? 'text-blue-500 ml-0.5'
                    : 'ml-0.5'
              }
            >
              {wd}
            </span>
          </>
        )}
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
      {day.precipProbMax !== null && (
        <div
          className={`text-xs mt-0.5 font-medium ${
            day.precipProbMax >= 50
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-400'
          }`}
        >
          ☔{day.precipProbMax}%
        </div>
      )}
      {day.precipSum !== null && day.precipSum > 0 && (
        <div className="text-[10px] text-blue-500">
          {day.precipSum.toFixed(0)}mm
        </div>
      )}
    </div>
  )
}
