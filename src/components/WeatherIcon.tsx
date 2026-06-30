import { skyCondition } from '../lib/sky'

/**
 * 天気アイコン (絵文字ではない自前SVG)。
 * - WMOコード → 形状、時刻 → 昼夜 (clear/partly は夜なら月)
 * - 雲などの基本形は currentColor。太陽=アクセント, 雨/雪=cool, 雷=アクセント。
 *   置き場所 (空グラデ上 / 白面) に応じて呼び出し側が text 色を渡す。
 */
interface WeatherIconProps {
  code: number | null
  /** 昼夜判定に使う時刻。省略時は昼扱い */
  date?: Date
  className?: string
  size?: number
}

const ACCENT = 'var(--accent)'
const COOL = 'var(--cool)'

function isNight(date?: Date): boolean {
  if (!date) return false
  const h = date.getHours()
  return h < 6 || h >= 19
}

export function WeatherIcon({ code, date, className = 'text-ink-muted', size = 24 }: WeatherIconProps) {
  const cond = skyCondition(code)
  const night = isNight(date)

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role="img"
      aria-hidden="true"
    >
      {renderCondition(cond, night)}
    </svg>
  )
}

function renderCondition(cond: ReturnType<typeof skyCondition>, night: boolean) {
  switch (cond) {
    case 'clear':
      return night ? <Moon /> : <Sun />
    case 'partly':
      return night ? <PartlyNight /> : <PartlyDay />
    case 'cloudy':
      return <Cloud />
    case 'rain':
      return <Rain />
    case 'snow':
      return <Snow />
    case 'storm':
      return <Storm />
    default:
      return <Cloud />
  }
}

/* ── building blocks ── */

function Sun({ cx = 12, cy = 12, r = 4.3 }: { cx?: number; cy?: number; r?: number }) {
  const rays = [
    [cx, cy - r - 3, cx, cy - r - 1],
    [cx, cy + r + 1, cx, cy + r + 3],
    [cx - r - 3, cy, cx - r - 1, cy],
    [cx + r + 1, cy, cx + r + 3, cy],
    [cx - r - 2.1, cy - r - 2.1, cx - r - 0.7, cy - r - 0.7],
    [cx + r + 0.7, cy + r + 0.7, cx + r + 2.1, cy + r + 2.1],
    [cx + r + 2.1, cy - r - 2.1, cx + r + 0.7, cy - r - 0.7],
    [cx - r - 0.7, cy + r + 0.7, cx - r - 2.1, cy + r + 2.1],
  ]
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={ACCENT} />
      <g stroke={ACCENT} strokeWidth={1.7} strokeLinecap="round">
        {rays.map((p, i) => (
          <line key={i} x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} />
        ))}
      </g>
    </g>
  )
}

function Moon() {
  return (
    <path
      d="M17.4 14.6A7 7 0 0 1 9.4 5a0.8 0.8 0 0 0-1.1-1A7.8 7.8 0 1 0 18.4 15.7a0.8 0.8 0 0 0-1-1.1z"
      fill="currentColor"
    />
  )
}

/** 雲。低めに配置して上に太陽/月を覗かせられるよう y オフセット可 */
function CloudShape({ fill = 'currentColor', opacity = 1 }: { fill?: string; opacity?: number }) {
  return (
    <path
      d="M7 19a4.5 4.5 0 0 1-.9-8.9 6 6 0 0 1 11.66-1.3A4.25 4.25 0 0 1 17.25 19H7z"
      fill={fill}
      opacity={opacity}
    />
  )
}

function Cloud() {
  return <CloudShape />
}

function PartlyDay() {
  return (
    <g>
      <Sun cx={9} cy={8.5} r={3.2} />
      <path
        d="M9 20a3.8 3.8 0 0 1-.76-7.52 5.1 5.1 0 0 1 9.9-1.1A3.6 3.6 0 0 1 18 20H9z"
        fill="currentColor"
      />
    </g>
  )
}

function PartlyNight() {
  return (
    <g>
      <path
        d="M11.2 8.3A4.6 4.6 0 0 1 7.8 3a0.6 0.6 0 0 0-.84-.66A5.1 5.1 0 1 0 12 9.1a0.6 0.6 0 0 0-.8-.8z"
        fill="currentColor"
      />
      <path
        d="M9 20a3.8 3.8 0 0 1-.76-7.52 5.1 5.1 0 0 1 9.9-1.1A3.6 3.6 0 0 1 18 20H9z"
        fill="currentColor"
      />
    </g>
  )
}

function Rain() {
  return (
    <g>
      <CloudShape opacity={0.92} />
      <g stroke={COOL} strokeWidth={1.8} strokeLinecap="round">
        <line x1="8.5" y1="20" x2="7.6" y2="22" />
        <line x1="12" y1="20" x2="11.1" y2="22.4" />
        <line x1="15.5" y1="20" x2="14.6" y2="22" />
      </g>
    </g>
  )
}

function Snow() {
  return (
    <g>
      <CloudShape opacity={0.92} />
      <g fill={COOL}>
        <circle cx="8.4" cy="21" r="1.05" />
        <circle cx="12" cy="21.6" r="1.05" />
        <circle cx="15.6" cy="21" r="1.05" />
      </g>
    </g>
  )
}

function Storm() {
  return (
    <g>
      <CloudShape opacity={0.92} />
      <path d="M12.4 19l-3 4h2.1l-1 3 4-5h-2.2l1.5-2z" fill={ACCENT} />
    </g>
  )
}
