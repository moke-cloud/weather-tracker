import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
import type { LocationWeather, ModelSkill } from '../lib/types'
import { fetchWeatherForLocation } from '../lib/weather-service'
import type { Location } from '../lib/types'
import { useTileOrder, TILE_LABELS, type TileId } from '../lib/tile-order'
import { computeRiskForData } from '../lib/risk-service'
import { getModelSkills } from '../lib/accuracy'
import { CONSENSUS_LABEL } from '../lib/consensus'
import { maybeNotify } from '../lib/notifications'
import { WeatherCard } from './WeatherCard'
import { WeatherIcon } from './WeatherIcon'
import { AirQualityCard } from './AirQualityCard'
import { HeadacheRiskPanel } from './HeadacheRiskPanel'
import { HeadacheDiary } from './HeadacheDiary'
import { HourlySummary } from './HourlySummary'
import { PressureChart } from './PressureChart'
import { ForecastTable } from './ForecastTable'
import { UmbrellaTimeline } from './UmbrellaTimeline'
import { RainNowcast } from './RainNowcast'
import { BottomNav } from './BottomNav'
import { InfoTooltip } from './InfoTooltip'
import type { GlossaryKey } from '../lib/glossary'

const MODEL_TERM: Record<string, GlossaryKey> = {
  JMA: 'jmaMsm',
  ECMWF: 'ecmwfIfs',
  ICON: 'iconModel',
  UKMO: 'ukmoModel',
  GFS: 'gfs',
  GEM: 'gemModel',
  [CONSENSUS_LABEL]: 'consensusForecast',
}

const AUTO_REFRESH_MS = 10 * 60_000 // 10 minutes

// BottomNav からのジャンプ時に展開する折りたたみセクションのキー接頭辞
// (toggleSection のキー `${prefix}_${locId}` と一致させる)
const SECTION_KEY_PREFIX: Partial<Record<TileId, string>> = {
  pressure: 'pressure',
  airquality: 'aqi',
  models: 'models',
  diary: 'diary',
}

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
  const [dragging, setDragging] = useState(false)
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

  const locationIds = useMemo(() => locations.map(l => l.id), [locations])

  // BottomNav ジャンプ前: 対象が折りたたみセクションなら展開しておく
  const ensureExpanded = useCallback((tile: TileId, locId: string) => {
    const prefix = SECTION_KEY_PREFIX[tile]
    if (!prefix) return
    setExpandedSections(prev => {
      const key = `${prefix}_${locId}`
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
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

      // Check headache notification (開いている間の通知。閉じている間は sw.ts が担当)
      // コンセンサス予報 + 日記個人化を適用した共通計算を使う
      const risk = await computeRiskForData(data)
      await maybeNotify(risk.level, risk.label, risk.summary)
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
    setDragging(false)
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
      <div className="flex flex-col items-center justify-center py-24 text-ink-muted">
        <WeatherIcon code={2} size={72} className="text-ink-subtle mb-4" />
        <p className="font-display text-lg font-semibold text-ink mb-2">地点が登録されていません</p>
        <p className="text-sm">右上の「+ 地点追加」から観測地点を追加してください</p>
      </div>
    )
  }

  const refreshMin = Math.floor(nextRefreshIn / 60_000)
  const refreshSec = Math.floor((nextRefreshIn % 60_000) / 1000)

  return (
    <div className="space-y-10">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="nums text-xs text-ink-subtle">
          次の自動更新: {refreshMin}:{String(refreshSec).padStart(2, '0')}
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <button
              onClick={resetOrder}
              className="text-xs px-3 py-1.5 rounded-md text-ink-muted hover:bg-surface-sunk transition-colors duration-200 ease-out"
            >
              初期順に戻す
            </button>
          )}
          <button
            onClick={() => setEditMode(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors duration-200 ease-out ${
              editMode
                ? 'bg-accent text-accent-ink font-semibold'
                : 'bg-surface text-ink-muted hover:bg-surface-sunk border border-line'
            }`}
          >
            {editMode ? '完了' : '並び替え'}
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-2xl font-bold tracking-tight text-ink">{loc.name}</h2>
              <div className="flex items-center gap-2">
                {data && (
                  <span className="nums text-xs text-ink-subtle">
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
                  className="text-xs px-3 py-1 rounded-md bg-surface border border-line text-ink-muted hover:bg-surface-sunk disabled:opacity-50 transition-colors duration-200 ease-out"
                >
                  {isLoading ? '更新中...' : '\u21BB'}
                </button>
                <button
                  onClick={() => onRemoveLocation(loc.id)}
                  aria-label={`${loc.name} を削除`}
                  className="text-xs px-2 py-1 rounded-md text-danger hover:bg-danger-soft transition-colors duration-200 ease-out"
                >
                  {'\u2715'}
                </button>
              </div>
            </div>

            {isLoading && !data && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
                <span className="ml-3 text-ink-muted">データ取得中...</span>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-danger-soft p-4 text-danger text-sm">
                {error}
              </div>
            )}

            {data?.stale && (
              <div className="rounded-lg bg-caution-soft p-3 mb-3 text-sm text-ink flex items-start gap-2">
                <span className="font-semibold shrink-0">オフライン表示:</span>
                <span className="text-ink-muted">
                  天気APIに接続できないため、
                  {new Date(data.fetchedAt).toLocaleString('ja-JP', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  時点の最終取得データを表示しています。
                </span>
              </div>
            )}

            {data && !data.stale && data.sources && hasDegradedSource(data.sources) && (
              <div className="rounded-lg bg-surface p-2.5 mb-3 border border-line text-xs text-ink-muted">
                一部のデータソースが応答していません:{' '}
                {describeDegradedSources(data.sources)}
                。取得できた範囲で表示しています。
              </div>
            )}

            {data && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={() => setDragging(true)}
                onDragCancel={() => setDragging(false)}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={order} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {order.map(tileId => (
                      <SortableTile key={tileId} id={tileId} locId={loc.id} editMode={editMode}>
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

      {/* モバイル用 下部セクションナビ */}
      <BottomNav
        order={order}
        locationIds={locationIds}
        suspendTracking={dragging}
        onBeforeJump={ensureExpanded}
      />
    </div>
  )
}

/* ── Sortable tile wrapper ── */

function SortableTile({
  id,
  locId,
  editMode,
  children,
}: {
  id: TileId
  locId: string
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
    // 下部ナビ (z-40) より下、静的な兄弟タイルより上
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={`tile-${locId}-${id}`}
      data-tile-anchor
      data-tile={id}
      data-loc={locId}
      className="scroll-mt-[calc(4rem+env(safe-area-inset-top))]"
    >
      {editMode && (
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="flex items-center gap-2 px-3 py-1.5 mb-1 rounded-t-md bg-accent-soft text-accent-strong text-xs cursor-grab active:cursor-grabbing select-none touch-none"
        >
          <span className="text-base leading-none" aria-hidden>{'\u2807'}</span>
          <span>{TILE_LABELS[id]}</span>
        </div>
      )}
      <div className={editMode ? 'ring-2 ring-accent/50 rounded-lg' : ''}>
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
    case 'rain':
      return (
        <RainNowcast
          latitude={data.location.latitude}
          longitude={data.location.longitude}
          refreshKey={data.fetchedAt}
        />
      )
    case 'headache':
      return <HeadacheRiskPanel data={data} />
    case 'umbrella':
      return <UmbrellaTimeline data={data} />
    case 'hourly':
      return <HourlySummary models={data.models} consensus={data.consensus} now={data.fetchedAt} />
    case 'forecast':
      return <ForecastTable daily={data.daily} />
    case 'pressure':
      return (
        <CollapsibleSection
          title={'気圧トレンド・アンサンブル'}
          isOpen={expandedSections.has(`pressure_${locId}`)}
          onToggle={() => toggleSection(`pressure_${locId}`)}
        >
          <PressureChart models={data.models} consensus={data.consensus} ensemble={data.ensemble} amedas={data.amedas} />
        </CollapsibleSection>
      )
    case 'airquality':
      return (
        <CollapsibleSection
          title={'UV・大気質 (PM2.5/AQI)'}
          isOpen={expandedSections.has(`aqi_${locId}`)}
          onToggle={() => toggleSection(`aqi_${locId}`)}
        >
          <AirQualityCard data={data.airQuality} />
        </CollapsibleSection>
      )
    case 'models':
      return (
        <CollapsibleSection
          title={'マルチモデル比較'}
          isOpen={expandedSections.has(`models_${locId}`)}
          onToggle={() => toggleSection(`models_${locId}`)}
        >
          <ModelComparisonInfo models={data.models} consensus={data.consensus} />
        </CollapsibleSection>
      )
    case 'diary':
      return (
        <CollapsibleSection
          title={'頭痛日記'}
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
    <div className="rounded-lg bg-surface shadow-md overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-ink-muted hover:bg-surface-sunk transition-colors duration-200 ease-out"
      >
        <span>{title}</span>
        <span className={`transition-transform duration-200 ease-out text-ink-subtle ${isOpen ? 'rotate-180' : ''}`} aria-hidden>{'\u25BC'}</span>
      </button>
      {isOpen && <div className="px-0">{children}</div>}
    </div>
  )
}

/* ── Availability helpers ── */

function hasDegradedSource(sources: NonNullable<LocationWeather['sources']>): boolean {
  return (
    sources.forecast !== 'ok' ||
    sources.ensemble !== 'ok' ||
    sources.airQuality !== 'ok' ||
    sources.amedas !== 'ok'
  )
}

function describeDegradedSources(
  sources: NonNullable<LocationWeather['sources']>
): string {
  const parts: string[] = []
  if (sources.forecast === 'partial') parts.push('予報 (一部モデルのみ)')
  if (sources.ensemble === 'error') parts.push('アンサンブル')
  if (sources.airQuality === 'error') parts.push('大気質')
  if (sources.amedas === 'error') parts.push('AMeDAS実測')
  return parts.join('・')
}

/* ── Model comparison table ── */

function ModelComparisonInfo({
  models,
  consensus,
}: {
  models: LocationWeather['models']
  consensus: LocationWeather['consensus']
}) {
  const now = new Date()
  const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24].map(
    offset => new Date(now.getTime() + offset * 3600_000)
  )
  const rows = consensus ? [consensus, ...models] : models

  return (
    <div className="p-4 pt-0">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left py-1 px-2 font-medium text-ink-muted">モデル</th>
              {hours.map(h => (
                <th key={h.toISOString()} className="nums py-1 px-1 font-medium text-center min-w-[44px] text-ink-muted">
                  {h.getHours()}時
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.model} className="border-b border-line/60">
                <td className="py-1.5 px-2 text-ink">
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
                    <td key={h.toISOString()} className="nums py-1.5 px-1 text-center text-ink" title="気温 (℃)">
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
      <p className="inline-flex items-center gap-1 text-[10px] text-ink-subtle mt-2">
        数値は予報気温(℃)。モデル間の温度差が大きいほど予報の不確実性が高い
        <InfoTooltip term="modelDivergence" />
      </p>
      <ModelSkillFooter />
    </div>
  )
}

/* ── Model verification skill (MAE vs AMeDAS) ── */

function ModelSkillFooter() {
  const [skills, setSkills] = useState<ModelSkill[]>([])

  useEffect(() => {
    let cancelled = false
    getModelSkills().then(s => {
      if (!cancelled) setSkills(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const verified = skills.filter(s => s.sampleCount > 0)
  if (verified.length === 0) {
    return (
      <p className="text-[10px] text-ink-subtle mt-2">
        実測との照合データを蓄積中。予報と AMeDAS 実測の照合が進むと、
        精度の良いモデルの重みが自動的に増えます。
      </p>
    )
  }

  return (
    <div className="mt-3 pt-2 border-t border-line">
      <p className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-muted mb-1">
        実測との照合成績 (直近7日・小さいほど正確)
        <InfoTooltip term="modelSkill" />
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {skills.map(s => (
          <span key={s.model} className="nums text-[10px] text-ink-muted">
            <span className="font-medium text-ink">{s.model}</span>
            {s.maeTemp != null && ` 気温±${s.maeTemp.toFixed(1)}℃`}
            {s.maePressure != null && ` 気圧±${s.maePressure.toFixed(1)}hPa`}
            {` (重み${Math.round(s.weight * 100)}%)`}
          </span>
        ))}
      </div>
    </div>
  )
}
