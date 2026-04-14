import type { ModelForecast, EnsembleBand } from '../lib/types'

interface HeadacheAlertProps {
  models: ModelForecast[]
  ensemble: EnsembleBand[]
}

interface HeadacheRisk {
  level: 'low' | 'moderate' | 'high' | 'very-high'
  label: string
  color: string
  bgColor: string
  description: string
  advice: string
}

export function HeadacheAlert({ models, ensemble }: HeadacheAlertProps) {
  const risk = calculateHeadacheRisk(models, ensemble)

  return (
    <div className={`rounded-xl p-4 shadow-sm ${risk.bgColor}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">
          頭痛リスク予測
        </h3>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${risk.color}`}>
          {risk.label}
        </span>
      </div>
      <p className="text-sm mb-2">{risk.description}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{risk.advice}</p>

      {/* 6-hour pressure forecast mini bar */}
      <PressureForecastBar models={models} />
    </div>
  )
}

function PressureForecastBar({ models }: { models: ModelForecast[] }) {
  const jma = models.find((m) => m.model === 'JMA')
  if (!jma) return null

  const now = Date.now()
  const next12h = jma.hourly.filter((h) => {
    const t = new Date(h.time).getTime()
    return t >= now && t <= now + 12 * 3600_000 && h.pressureMsl !== null
  })

  if (next12h.length < 2) return null

  const pressures = next12h.map((h) => h.pressureMsl!)
  const min = Math.min(...pressures)
  const max = Math.max(...pressures)
  const range = max - min || 1

  return (
    <div className="mt-3">
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
        今後12時間の気圧推移
      </div>
      <div className="flex items-end gap-0.5 h-8">
        {next12h.map((h, i) => {
          const p = h.pressureMsl!
          const height = ((p - min) / range) * 100
          const prevP = i > 0 ? next12h[i - 1].pressureMsl! : p
          const dropping = p < prevP - 0.3
          const rising = p > prevP + 0.3

          return (
            <div
              key={h.time}
              className={`flex-1 rounded-t-sm min-h-[2px] transition-all ${
                dropping
                  ? 'bg-red-400 dark:bg-red-500'
                  : rising
                    ? 'bg-blue-400 dark:bg-blue-500'
                    : 'bg-slate-300 dark:bg-slate-600'
              }`}
              style={{ height: `${Math.max(height, 5)}%` }}
              title={`${new Date(h.time).getHours()}時: ${p.toFixed(1)} hPa`}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
        <span>現在</span>
        <span>+12h</span>
      </div>
    </div>
  )
}

function calculateHeadacheRisk(
  models: ModelForecast[],
  ensemble: EnsembleBand[]
): HeadacheRisk {
  const jma = models.find((m) => m.model === 'JMA')
  if (!jma) return lowRisk()

  const now = Date.now()

  // Get pressure values around current time and forecast
  const recentPast = jma.hourly.filter((h) => {
    const t = new Date(h.time).getTime()
    return t >= now - 6 * 3600_000 && t <= now && h.pressureMsl !== null
  })
  const nearFuture = jma.hourly.filter((h) => {
    const t = new Date(h.time).getTime()
    return t > now && t <= now + 6 * 3600_000 && h.pressureMsl !== null
  })

  if (recentPast.length < 2 && nearFuture.length < 2) return lowRisk()

  // Calculate pressure change rates
  const allPoints = [...recentPast, ...nearFuture]
  let maxDrop3h = 0 // maximum 3-hour pressure drop
  let maxDrop6h = 0 // maximum 6-hour pressure drop

  for (let i = 0; i < allPoints.length; i++) {
    for (let j = i + 1; j < allPoints.length; j++) {
      const dt =
        (new Date(allPoints[j].time).getTime() -
          new Date(allPoints[i].time).getTime()) /
        3600_000
      const dp = allPoints[i].pressureMsl! - allPoints[j].pressureMsl!
      if (dt <= 3.5 && dp > maxDrop3h) maxDrop3h = dp
      if (dt <= 6.5 && dp > maxDrop6h) maxDrop6h = dp
    }
  }

  // Check ensemble spread (uncertainty amplifies risk)
  const futureEnsemble = ensemble.filter((e) => {
    const t = new Date(e.time).getTime()
    return t > now && t <= now + 6 * 3600_000
  })
  const maxSpread = futureEnsemble.reduce((max, e) => {
    if (e.p10 === null || e.p90 === null) return max
    return Math.max(max, e.p90 - e.p10)
  }, 0)

  // Risk assessment based on pressure change thresholds
  // Medical research suggests: >6 hPa/6h or >3 hPa/3h increases migraine risk
  if (maxDrop3h >= 4 || maxDrop6h >= 8) {
    return {
      level: 'very-high',
      label: '警戒',
      color: 'bg-red-500 text-white',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      description: `急激な気圧低下を検知 (${maxDrop3h >= 4 ? `3h: -${maxDrop3h.toFixed(1)}hPa` : `6h: -${maxDrop6h.toFixed(1)}hPa`})`,
      advice: '頭痛薬の準備を推奨。十分な水分補給と休息を。',
    }
  }
  if (maxDrop3h >= 2.5 || maxDrop6h >= 5) {
    return {
      level: 'high',
      label: '注意',
      color: 'bg-orange-500 text-white',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      description: `気圧低下傾向 (${maxDrop3h >= 2.5 ? `3h: -${maxDrop3h.toFixed(1)}hPa` : `6h: -${maxDrop6h.toFixed(1)}hPa`})${maxSpread > 5 ? ' ※予報不確実性高' : ''}`,
      advice: '頭痛が起きやすい方は予防的な対処を。カフェインや深呼吸が効果的。',
    }
  }
  if (maxDrop3h >= 1.5 || maxDrop6h >= 3) {
    return {
      level: 'moderate',
      label: 'やや注意',
      color: 'bg-yellow-500 text-white',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      description: `やや気圧低下 (${maxDrop3h >= 1.5 ? `3h: -${maxDrop3h.toFixed(1)}hPa` : `6h: -${maxDrop6h.toFixed(1)}hPa`})`,
      advice: '敏感な方は軽い頭痛が出る可能性。水分を意識的に摂ってください。',
    }
  }

  return lowRisk()
}

function lowRisk(): HeadacheRisk {
  return {
    level: 'low',
    label: '安定',
    color: 'bg-green-500 text-white',
    bgColor: 'bg-white dark:bg-slate-800',
    description: '気圧は安定しています。大きな変動は予測されていません。',
    advice: '頭痛リスクは低い状態です。',
  }
}
