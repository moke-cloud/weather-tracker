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
  Label,
} from 'recharts'
import type { ModelForecast, EnsembleBand, AmedasObservation } from '../lib/types'
import { pressureChangeRate } from '../lib/utils'
import { InfoTooltip } from './InfoTooltip'
import { AlertIcon } from './icons'
import type { GlossaryKey } from '../lib/glossary'

interface PressureChartProps {
  models: ModelForecast[]
  /** コンセンサス予報 (太線で強調表示) */
  consensus?: ModelForecast | null
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

/** モデル名からGlossaryキーへ */
const MODEL_TERM: Record<string, GlossaryKey> = {
  JMA: 'jmaMsm',
  ECMWF: 'ecmwfIfs',
  ICON: 'iconModel',
  UKMO: 'ukmoModel',
  GFS: 'gfs',
  GEM: 'gemModel',
}

export function PressureChart({ models, consensus, ensemble, amedas }: PressureChartProps) {
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

  // Add model forecast data (コンセンサスも1系列として重ねる)
  const lineSources = consensus ? [...models, consensus] : models
  for (const m of lineSources) {
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

  const rateBadge =
    Math.abs(changeRate ?? 0) > 2
      ? 'bg-danger text-white'
      : Math.abs(changeRate ?? 0) > 1
        ? 'bg-caution text-[oklch(0.28_0.04_85)]'
        : 'bg-safe text-white'

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted">
          気圧トレンド (過去3日 → 予報5日)
          <InfoTooltip term="pressureHpa" />
        </h3>
        <div className="flex items-center gap-3 text-sm flex-wrap">
          {currentPressure != null && (
            <span className="nums inline-flex items-center gap-1 font-semibold text-ink">
              現在 {currentPressure.toFixed(1)} hPa
            </span>
          )}
          {changeRate !== null && (
            <span
              className={`nums inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${rateBadge}`}
            >
              {changeRate > 0 ? '↑' : '↓'}{Math.abs(changeRate).toFixed(1)} hPa/h
              <InfoTooltip term="pressureChangeRate" className="text-current" />
            </span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.8} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--ink-subtle)' }}
            interval="preserveStartEnd"
            tickCount={8}
          >
            <Label value="時刻 (月/日 時)" offset={-15} position="insideBottom" style={{ fontSize: 10, fill: 'var(--ink-subtle)' }} />
          </XAxis>
          <YAxis
            domain={[minP, maxP]}
            tick={{ fontSize: 10, fill: 'var(--ink-subtle)' }}
            tickFormatter={(v: number) => `${v}`}
            width={50}
          >
            <Label
              value="気圧 (hPa)"
              angle={-90}
              position="insideLeft"
              style={{ fontSize: 10, fill: 'var(--ink-subtle)', textAnchor: 'middle' }}
            />
          </YAxis>
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--line)',
              borderRadius: '10px',
              color: 'var(--ink)',
              fontSize: '12px',
              boxShadow: 'var(--shadow-md)',
            }}
            formatter={(value) => [
              `${Number(value).toFixed(1)} hPa`,
            ]}
          />
          {/* 凡例はチャート下の自作凡例 (ツールチップ付き) に一本化。
              Recharts内蔵Legendは8系列で折り返してX軸ラベルと重なるため使わない */}

          {/* Ensemble confidence band: P90 を薄塗り → P10 を背景色で抜いて帯を作る */}
          <Area
            dataKey="ensembleP90"
            stroke="none"
            fill="var(--cool)"
            fillOpacity={0.16}
            name="アンサンブル P90"
            dot={false}
            activeDot={false}
            legendType="none"
          />
          <Area
            dataKey="ensembleP10"
            stroke="none"
            fill="var(--surface)"
            fillOpacity={1}
            name="アンサンブル P10"
            dot={false}
            activeDot={false}
            legendType="none"
          />

          {/* Model forecast lines (コンセンサスは太線で強調) */}
          {lineSources.map((m) => (
            <Line
              key={m.model}
              dataKey={m.model}
              stroke={m.color}
              strokeWidth={m === consensus ? 2.5 : 1}
              strokeOpacity={m === consensus ? 1 : 0.75}
              dot={false}
              name={m.model}
              connectNulls
            />
          ))}

          {/* Ensemble median */}
          <Line
            dataKey="ensembleMedian"
            stroke="var(--accent-strong)"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="Ensemble中央値"
            connectNulls
          />

          {/* Now line */}
          <ReferenceLine
            x={formatChartTime(nowStr)}
            stroke="var(--danger)"
            strokeDasharray="3 3"
            strokeWidth={2}
            label={{ value: '現在', fill: 'var(--danger)', fontSize: 10, position: 'top' }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend with tooltips */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-6 h-2 rounded bg-cool/20" />
          アンサンブル信頼帯 (P10-P90)
          <InfoTooltip term="ensembleBand" />
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-4 h-px border-t border-dashed border-accent-strong" />
          中央値
          <InfoTooltip term="ensembleMedian" />
        </span>
        {lineSources.map(m => (
          <span key={m.model} className="inline-flex items-center gap-1">
            <span
              className={`inline-block w-4 rounded ${m === consensus ? 'h-1' : 'h-0.5'}`}
              style={{ backgroundColor: m.color }}
            />
            {m.model}
            {m === consensus ? (
              <InfoTooltip term="consensusForecast" />
            ) : (
              MODEL_TERM[m.model] && <InfoTooltip term={MODEL_TERM[m.model]} />
            )}
          </span>
        ))}
        {Math.abs(changeRate ?? 0) > 2 && (
          <span className="inline-flex items-center gap-1 text-danger font-medium">
            <AlertIcon size={12} /> 急激な気圧変動を検知
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
