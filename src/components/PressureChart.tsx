import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts'
import type { ModelForecast, EnsembleBand, AmedasObservation } from '../lib/types'
import { pressureChangeRate } from '../lib/utils'

interface PressureChartProps {
  models: ModelForecast[]
  ensemble: EnsembleBand[]
  amedas: AmedasObservation | null
}

interface ChartPoint {
  time: string
  label: string
  ensembleP10?: number
  ensembleP90?: number
  ensembleMedian?: number
  [key: string]: string | number | undefined
}

export function PressureChart({ models, ensemble, amedas }: PressureChartProps) {
  const now = new Date()
  const nowStr = now.toISOString()

  // Build unified timeline from all sources
  const timeMap = new Map<string, ChartPoint>()

  // Add ensemble band data
  for (const e of ensemble) {
    const key = e.time
    const existing = timeMap.get(key) ?? {
      time: key,
      label: formatChartTime(key),
    }
    if (e.p10 !== null) existing.ensembleP10 = e.p10
    if (e.p90 !== null) existing.ensembleP90 = e.p90
    if (e.median !== null) existing.ensembleMedian = e.median
    timeMap.set(key, existing)
  }

  // Add model forecast data
  for (const m of models) {
    for (const h of m.hourly) {
      if (h.pressureMsl === null) continue
      const key = h.time
      const existing = timeMap.get(key) ?? {
        time: key,
        label: formatChartTime(key),
      }
      existing[m.model] = h.pressureMsl
      timeMap.set(key, existing)
    }
  }

  const data = Array.from(timeMap.values()).sort((a, b) =>
    a.time.localeCompare(b.time)
  )

  // Calculate pressure change rate from JMA model
  const jmaModel = models.find((m) => m.model === 'JMA')
  const recentPressures = jmaModel
    ? jmaModel.hourly
        .filter((h) => h.pressureMsl !== null && new Date(h.time) <= now)
        .map((h) => ({ time: h.time, value: h.pressureMsl! }))
    : []
  const changeRate = pressureChangeRate(recentPressures)

  // Current pressure from AMeDAS or model
  const currentPressure = amedas?.pressureSea ?? recentPressures[recentPressures.length - 1]?.value

  // Y-axis domain
  const allPressures = data.flatMap((d) => {
    const vals: number[] = []
    if (d.ensembleP10) vals.push(d.ensembleP10)
    if (d.ensembleP90) vals.push(d.ensembleP90)
    for (const m of models) {
      const v = d[m.model]
      if (typeof v === 'number') vals.push(v)
    }
    return vals
  })
  const minP = allPressures.length > 0 ? Math.floor(Math.min(...allPressures) - 2) : 990
  const maxP = allPressures.length > 0 ? Math.ceil(Math.max(...allPressures) + 2) : 1030

  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">
          気圧トレンド (過去3日 → 予報5日)
        </h3>
        <div className="flex items-center gap-3 text-sm">
          {currentPressure != null && (
            <span className="font-medium">{currentPressure.toFixed(1)} hPa</span>
          )}
          {changeRate !== null && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                Math.abs(changeRate) > 2
                  ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                  : Math.abs(changeRate) > 1
                    ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
                    : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
              }`}
            >
              {changeRate > 0 ? '\u2191' : '\u2193'}{Math.abs(changeRate).toFixed(1)} hPa/h
            </span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
            tickCount={8}
          />
          <YAxis
            domain={[minP, maxP]}
            tick={{ fontSize: 10 }}
            tickFormatter={(v: number) => `${v}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              border: 'none',
              borderRadius: '8px',
              color: '#e2e8f0',
              fontSize: '12px',
            }}
            formatter={(value: number, name: string) => [
              `${value.toFixed(1)} hPa`,
              name,
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px' }}
            iconType="line"
          />

          {/* Ensemble confidence band */}
          <Area
            dataKey="ensembleP90"
            stroke="none"
            fill="#3b82f6"
            fillOpacity={0.1}
            name="ECMWF P90"
            dot={false}
            activeDot={false}
            legendType="none"
          />
          <Area
            dataKey="ensembleP10"
            stroke="none"
            fill="#ffffff"
            fillOpacity={1}
            name="ECMWF P10"
            dot={false}
            activeDot={false}
            legendType="none"
          />

          {/* Model forecast lines */}
          {models.map((m) => (
            <Line
              key={m.model}
              dataKey={m.model}
              stroke={m.color}
              strokeWidth={1.5}
              dot={false}
              name={m.model}
              connectNulls
            />
          ))}

          {/* Ensemble median */}
          <Line
            dataKey="ensembleMedian"
            stroke="#6366f1"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="Ensemble中央値"
            connectNulls
          />

          {/* Now line */}
          <ReferenceLine
            x={formatChartTime(nowStr)}
            stroke="#ef4444"
            strokeDasharray="3 3"
            strokeWidth={2}
            label={{ value: '現在', fill: '#ef4444', fontSize: 10, position: 'top' }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-6 h-2 rounded bg-blue-500/20" />
          アンサンブル信頼帯 (P10-P90)
        </span>
        {Math.abs(changeRate ?? 0) > 2 && (
          <span className="text-red-500 font-medium">
            急激な気圧変動を検知
          </span>
        )}
      </div>
    </div>
  )
}

function formatChartTime(iso: string): string {
  const d = new Date(iso)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours()
  return `${month}/${day} ${hour}時`
}
