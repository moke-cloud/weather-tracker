import { useState, useEffect, useCallback, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LocationWeather } from '../lib/types'
import { fetchWeatherForLocation } from '../lib/weather-service'
import type { Location } from '../lib/types'
import { useTileOrder, TILE_LABELS, type TileId } from '../lib/tile-order'
import { calculateHeadacheRisk } from '../lib/headache-model'
import { shouldNotify, sendHeadacheNotification } from '../lib/notifications'
import { WeatherCard } from './WeatherCard'
import { AirQualityCard } from './AirQualityCard'
import { HeadacheRiskPanel } from './HeadacheRiskPanel'
import { HeadacheDiary } from './HeadacheDiary'
import { HourlySummary } from './HourlySummary'
import { PressureChart } from './PressureChart'
import { ForecastTable } from './ForecastTable'
import { InfoTooltip } from './InfoTooltip'
import type { GlossaryKey } from '../lib/glossary'

const MODEL_TERM: Record<string, GlossaryKey> = {
  JMA: 'jmaMsm',
  ECMWF: 'ecmwfIfs',
  GFS: 'gfs',
}

const AUTO_REFRESH_MS = 10 * 60_000 // 10 minutes

interface DashboardProps {
  locations: Location[]
  onRemoveLocation: (id: string) => void
}

export function Dashboard({ locations, onRemoveLocation }: DashboardProps) {
  const [weatherData, setWeatherData] = useState<Map<string, LocationWeather>>(new Map())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [editMode, setEditMode] = useState(false)
  const [nextRefreshIn, setNextRefreshIn] = useState(AUTO_REFRESH_MS)
  const { order, reorder, resetOrder } = useTileOrder()
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const toggleSection = useCallback((key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const fetchData = useCallback(async (location: Location) => {
    setLoading(prev => new Set(prev).add(location.id))
    setErrors(prev => {
      const next = new Map(prev)
      next.delete(location.id)
      return next
    })

    try {
      const data = await fetchWeatherForLocation(location)
      setWeatherData(prev => new Map(prev).set(location.id, data))

      // Check headache notification
      const risk = calculateHeadacheRisk(data.models, data.ensemble)
      if (shouldNotify(risk.level)) {
        sendHeadacheNotification(risk.level, risk.label, risk.summary)
      }
    } catch (err) {
      setErrors(prev =>
        new Map(prev).set(
          location.id,
          err instanceof Error ? err.message : 'データ取得に失敗しました'
        )
      )
    } finally {
      setLoading(prev => {
        const next = new Set(prev)
        next.delete(location.id)
        return next
      })
    }
  }, [])

  const fetchAll = useCallback(() => {
    for (const loc of locations) {
      fetchData(loc)
    }
    setNextRefreshIn(AUTO_REFRESH_MS)
  }, [locations, fetchData])

  // Initial fetch
  useEffect(() => {
    for (const loc of locations) {
      const existing = weatherData.get(loc.id)
      if (!existing || Date.now() - existing.fetchedAt > AUTO_REFRESH_MS) {
        fetchData(loc)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations])

  // Auto-refresh timer
  useEffect(() => {
    if (locations.length === 0) return

    // Clear existing timers
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)

    setNextRefreshIn(AUTO_REFRESH_MS)

    refreshTimerRef.current = setInterval(() => {
      // Only refresh if tab is visible
      if (!document.hidden) {
        fetchAll()
      }
    }, AUTO_REFRESH_MS)

    countdownRef.current = setInterval(() => {
      setNextRefreshIn(prev => Math.max(0, prev - 1000))
    }, 1000)

    // Pause/resume on visibility change
    const handleVisibility = () => {
      if (!document.hidden) {
        // Check if data is stale
        for (const loc of locations) {
          const existing = weatherData.get(loc.id)
          if (!existing || Date.now() - existing.fetchedAt > AUTO_REFRESH_MS) {
            fetchData(loc)
          }
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations.length])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = order.indexOf(active.id as TileId)
    const newIndex = order.indexOf(over.id as TileId)
    if (oldIndex !== -1 && newIndex !== -1) {
      reorder(oldIndex, newIndex)
    }
  }

  if (locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400">
        <div className="text-5xl mb-4">{'\u{1F324}\uFE0F'}</div>
        <p className="text-lg mb-2">地点が登録されていません</p>
        <p className="text-sm">右上の「+ 地点追加」から観測地点を追加してください</p>
      </div>
    )
  }

  const refreshMin = Math.floor(nextRefreshIn / 60_000)
  const refreshSec = Math.floor((nextRefreshIn % 60_000) / 1000)

  return (
    <div className="space-y-8">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400 dark:text-slate-500">
          次の自動更新: {refreshMin}:{String(refreshSec).padStart(2, '0')}
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <button
              onClick={resetOrder}
              className="text-xs px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              初期順に戻す
            </button>
          )}
          <button
            onClick={() => setEditMode(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
              editMode
                ? 'bg-blue-500 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            {editMode ? '\u2705 完了' : '\u2630 並び替え'}
          </button>
        </div>
      </div>

      {locations.map(loc => {
        const data = weatherData.get(loc.id)
        const isLoading = loading.has(loc.id)
        const error = errors.get(loc.id)

        return (
          <section key={loc.id}>
            {/* Location header */}
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
                  {isLoading ? '更新中...' : '\u21BB'}
                </button>
                <button
                  onClick={() => onRemoveLocation(loc.id)}
                  className="text-xs px-2 py-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  {'\u2715'}
                </button>
              </div>
            </div>

            {isLoading && !data && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                <span className="ml-3 text-slate-500 dark:text-slate-400">データ取得中...</span>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-4 text-red-700 dark:text-red-300 text-sm">
                {error}
              </div>
            )}

            {data && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={order} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {order.map(tileId => (
                      <SortableTile key={tileId} id={tileId} editMode={editMode}>
                        <TileContent
                          tileId={tileId}
                          data={data}
                          locId={loc.id}
                          expandedSections={expandedSections}
                          toggleSection={toggleSection}
                        />
                      </SortableTile>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </section>
        )
      })}
    </div>
  )
}

/* ── Sortable tile wrapper ── */

function SortableTile({
  id,
  editMode,
  children,
}: {
  id: string
  editMode: boolean
  children: React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !editMode })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style}>
      {editMode && (
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="flex items-center gap-2 px-3 py-1.5 mb-1 rounded-t-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-xs cursor-grab active:cursor-grabbing select-none touch-none"
        >
          <span className="text-base leading-none">{'\u2807'}</span>
          <span>{TILE_LABELS[id as TileId]}</span>
        </div>
      )}
      <div className={editMode ? 'ring-2 ring-blue-300 dark:ring-blue-600 rounded-xl' : ''}>
        {children}
      </div>
    </div>
  )
}

/* ── Tile content router ── */

function TileContent({
  tileId,
  data,
  locId,
  expandedSections,
  toggleSection,
}: {
  tileId: TileId
  data: LocationWeather
  locId: string
  expandedSections: Set<string>
  toggleSection: (key: string) => void
}) {
  switch (tileId) {
    case 'weather':
      return <WeatherCard amedas={data.amedas} models={data.models} />
    case 'headache':
      return <HeadacheRiskPanel models={data.models} ensemble={data.ensemble} />
    case 'hourly':
      return <HourlySummary models={data.models} />
    case 'forecast':
      return <ForecastTable daily={data.daily} />
    case 'pressure':
      return (
        <CollapsibleSection
          title={'\u{1F4CA} 気圧トレンド・アンサンブル'}
          isOpen={expandedSections.has(`pressure_${locId}`)}
          onToggle={() => toggleSection(`pressure_${locId}`)}
        >
          <PressureChart models={data.models} ensemble={data.ensemble} amedas={data.amedas} />
        </CollapsibleSection>
      )
    case 'airquality':
      return (
        <CollapsibleSection
          title={'\u{1F30D} UV・大気質 (PM2.5/AQI)'}
          isOpen={expandedSections.has(`aqi_${locId}`)}
          onToggle={() => toggleSection(`aqi_${locId}`)}
        >
          <AirQualityCard data={data.airQuality} />
        </CollapsibleSection>
      )
    case 'models':
      return (
        <CollapsibleSection
          title={'\u{1F52C} マルチモデル比較'}
          isOpen={expandedSections.has(`models_${locId}`)}
          onToggle={() => toggleSection(`models_${locId}`)}
        >
          <ModelComparisonInfo models={data.models} />
        </CollapsibleSection>
      )
    case 'diary':
      return (
        <CollapsibleSection
          title={'\u{1F4D3} 頭痛日記'}
          isOpen={expandedSections.has(`diary_${locId}`)}
          onToggle={() => toggleSection(`diary_${locId}`)}
        >
          <HeadacheDiary />
        </CollapsibleSection>
      )
  }
}

/* ── Collapsible section ── */

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
        <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>{'\u25BC'}</span>
      </button>
      {isOpen && <div className="px-0">{children}</div>}
    </div>
  )
}

/* ── Model comparison table ── */

function ModelComparisonInfo({ models }: { models: LocationWeather['models'] }) {
  const now = new Date()
  const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24].map(
    offset => new Date(now.getTime() + offset * 3600_000)
  )

  return (
    <div className="p-4 pt-0">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left py-1 px-2 font-medium">モデル</th>
              {hours.map(h => (
                <th key={h.toISOString()} className="py-1 px-1 font-medium text-center min-w-[44px]">
                  {h.getHours()}時
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map(m => (
              <tr key={m.model} className="border-b border-slate-100 dark:border-slate-700/50">
                <td className="py-1.5 px-2">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                    {m.model}
                    {MODEL_TERM[m.model] && <InfoTooltip term={MODEL_TERM[m.model]} />}
                  </span>
                </td>
                {hours.map(h => {
                  const point = m.hourly.find(p => {
                    const diff = Math.abs(new Date(p.time).getTime() - h.getTime())
                    return diff < 2 * 3600_000
                  })
                  return (
                    <td key={h.toISOString()} className="py-1.5 px-1 text-center" title="気温 (℃)">
                      {point?.temperature !== null && point?.temperature !== undefined
                        ? `${point.temperature.toFixed(0)}\u00B0C`
                        : '--'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 mt-2">
        数値は予報気温(℃)。モデル間の温度差が大きいほど予報の不確実性が高い
        <InfoTooltip term="modelDivergence" />
      </p>
    </div>
  )
}
