import { useState, useEffect, useRef, useCallback } from 'react'
import type { ComponentType } from 'react'
import { TILE_LABELS, type TileId } from '../lib/tile-order'
import { pickActiveAnchor, type MeasuredAnchor, type TileAnchor } from '../lib/active-anchor'
import {
  SunCloudIcon,
  CloudRainIcon,
  ZapIcon,
  UmbrellaIcon,
  ClockIcon,
  CalendarIcon,
  GaugeIcon,
  WindIcon,
  LayersIcon,
  BookIcon,
  GridIcon,
} from './icons'

/**
 * モバイル用 下部固定ナビ (md 以上では非表示)。
 * タイル並び順の先頭 PRIMARY_COUNT 個を直接ボタンで、残りは「その他」ポップオーバーで表示。
 * スクロール位置から現在表示中のタイルを判定してハイライトする。
 */

/** 下部ナビに直接表示するタイル数 (残りは「その他」に入る) */
const PRIMARY_COUNT = 4

/** アクティブ判定の基準線: ビューポート上端からの割合 */
const PROBE_RATIO = 0.4

/** 下部ナビ用の短縮ラベル (TILE_LABELS はポップオーバー側で使う) */
const NAV_SHORT_LABELS: Record<TileId, string> = {
  weather: '現在',
  rain: '雨',
  headache: '頭痛',
  umbrella: '傘',
  hourly: '時間',
  forecast: '週間',
  pressure: '気圧',
  airquality: '大気',
  models: 'モデル',
  diary: '日記',
}

type IconComponent = ComponentType<{ size?: number; className?: string }>

const NAV_ICONS: Record<TileId, IconComponent> = {
  weather: SunCloudIcon,
  rain: CloudRainIcon,
  headache: ZapIcon,
  umbrella: UmbrellaIcon,
  hourly: ClockIcon,
  forecast: CalendarIcon,
  pressure: GaugeIcon,
  airquality: WindIcon,
  models: LayersIcon,
  diary: BookIcon,
}

const OVERFLOW_MENU_ID = 'bottom-nav-overflow'

/* ── スクロール位置から現在表示中のタイルを追跡する hook ── */

function useActiveTileAnchor(
  order: TileId[],
  locationIds: string[],
  suspended: boolean
): TileAnchor | null {
  const [active, setActive] = useState<TileAnchor | null>(null)

  useEffect(() => {
    // ドラッグ並び替え中は transform で DOM 順と視覚順がずれるため追跡を止める
    // (終了時に suspended が変わり、この effect が再実行されて即再計測される)
    if (suspended) return
    let raf = 0
    const measure = () => {
      raf = 0
      const anchors: MeasuredAnchor[] = []
      // querySelectorAll は文書順 = 縦積み順 (pickActiveAnchor の契約)
      for (const el of document.querySelectorAll<HTMLElement>('[data-tile-anchor]')) {
        const tile = el.dataset.tile as TileId | undefined
        const locId = el.dataset.loc
        if (tile && locId) {
          anchors.push({ tile, locId, top: el.getBoundingClientRect().top })
        }
      }
      setActive(pickActiveAnchor(anchors, window.innerHeight * PROBE_RATIO))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [order, locationIds, suspended])

  return active
}

/* ── BottomNav 本体 ── */

interface BottomNavProps {
  order: TileId[]
  locationIds: string[]
  /** タイルのドラッグ並び替え中 true (スクロール追跡を一時停止する) */
  suspendTracking?: boolean
  /** ジャンプ前の準備 (折りたたみセクションの展開など) */
  onBeforeJump: (tile: TileId, locId: string) => void
}

export function BottomNav({
  order,
  locationIds,
  suspendTracking = false,
  onBeforeJump,
}: BottomNavProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const active = useActiveTileAnchor(order, locationIds, suspendTracking)

  // ポップオーバー: Escape / 外側タップで閉じる (ヘッダーメニューと同じ作法)
  useEffect(() => {
    if (!menuOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    const handleDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handleEsc)
    document.addEventListener('mousedown', handleDown)
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.removeEventListener('mousedown', handleDown)
    }
  }, [menuOpen])

  const jumpTo = useCallback(
    (tile: TileId) => {
      setMenuOpen(false)
      // いま見ている地点のタイルへ飛ぶ。未確定・地点削除済みなら先頭の地点
      const locId =
        active && locationIds.includes(active.locId) ? active.locId : locationIds[0]
      if (!locId) return
      onBeforeJump(tile, locId)
      // 折りたたみ展開の再レンダー後にスクロール
      requestAnimationFrame(() => {
        document
          .getElementById(`tile-${locId}-${tile}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    },
    [active, locationIds, onBeforeJump]
  )

  const primary = order.slice(0, PRIMARY_COUNT)
  const overflow = order.slice(PRIMARY_COUNT)
  const overflowActive = overflow.some(t => t === active?.tile)

  return (
    <div ref={containerRef} className="md:hidden">
      <nav
        aria-label="セクション移動"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/85 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5">
          {primary.map(tile => (
            <NavButton
              key={tile}
              icon={NAV_ICONS[tile]}
              label={NAV_SHORT_LABELS[tile]}
              active={active?.tile === tile}
              ariaLabel={`${TILE_LABELS[tile]}へ移動`}
              ariaCurrent={active?.tile === tile}
              onClick={() => jumpTo(tile)}
            />
          ))}
          <NavButton
            icon={GridIcon}
            label="その他"
            active={overflowActive || menuOpen}
            ariaLabel="その他のセクション"
            ariaExpanded={menuOpen}
            ariaControls={OVERFLOW_MENU_ID}
            onClick={() => setMenuOpen(v => !v)}
          />
        </div>
      </nav>

      {/* トリガーの後に置く: Tab で「その他」→ メニュー項目の順に届く (表示位置は fixed でバーの上) */}
      {menuOpen && (
        <OverflowMenu tiles={overflow} activeTile={active?.tile ?? null} onSelect={jumpTo} />
      )}
    </div>
  )
}

/* ── ナビボタン (アイコン + 短縮ラベル) ── */

interface NavButtonProps {
  icon: IconComponent
  label: string
  active: boolean
  ariaLabel: string
  ariaCurrent?: boolean
  ariaExpanded?: boolean
  ariaControls?: string
  onClick: () => void
}

function NavButton({
  icon: Icon,
  label,
  active,
  ariaLabel,
  ariaCurrent,
  ariaExpanded,
  ariaControls,
  onClick,
}: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={ariaCurrent ? 'true' : undefined}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      className={`flex flex-col items-center gap-0.5 py-2 transition-colors duration-200 ease-out ${
        active ? 'text-accent-strong' : 'text-ink-subtle'
      }`}
    >
      <Icon size={20} />
      <span className="text-[10px] leading-tight font-medium">{label}</span>
    </button>
  )
}

/* ── その他タイルのポップオーバー ── */

function OverflowMenu({
  tiles,
  activeTile,
  onSelect,
}: {
  tiles: TileId[]
  activeTile: TileId | null
  onSelect: (tile: TileId) => void
}) {
  return (
    <div
      id={OVERFLOW_MENU_ID}
      aria-label="その他のセクション"
      className="fixed right-2 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 w-60 rounded-lg bg-surface-raised shadow-lg border border-line py-1"
    >
      {tiles.map(tile => {
        const Icon = NAV_ICONS[tile]
        const isActive = activeTile === tile
        return (
          <button
            key={tile}
            onClick={() => onSelect(tile)}
            aria-current={isActive ? 'true' : undefined}
            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors duration-200 ease-out ${
              isActive
                ? 'text-accent-strong bg-accent-soft/60'
                : 'text-ink hover:bg-surface-sunk'
            }`}
          >
            <Icon size={18} className={isActive ? 'shrink-0' : 'shrink-0 text-ink-muted'} />
            {TILE_LABELS[tile]}
          </button>
        )
      })}
    </div>
  )
}
