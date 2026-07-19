/**
 * UIアイコン (絵文字置き換え用)。すべて stroke=1.8 / currentColor / 24 viewBox の線アイコンで統一。
 * 色は呼び出し側が text-* で渡す。
 */
interface IconProps {
  className?: string
  size?: number
}

function Svg({ className, size = 18, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function DownloadIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </Svg>
  )
}

export function BellIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5 2 6H4c.5-1 2-2 2-6Z" />
      <path d="M10.5 20a1.8 1.8 0 0 0 3 0" />
    </Svg>
  )
}

export function BellOffIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6.5 8.5a5.5 5.5 0 0 1 9.3-3.7M18 9c0 4 1.5 5 2 6H8" />
      <path d="M10.5 20a1.8 1.8 0 0 0 3 0" />
      <path d="m4 3 16 18" />
    </Svg>
  )
}

export function SunIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </Svg>
  )
}

export function MoonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />
    </Svg>
  )
}

export function PinIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </Svg>
  )
}

export function UmbrellaIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8Z" />
      <path d="M12 11v7a2.5 2.5 0 0 1-5 0" />
    </Svg>
  )
}

export function DropletIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5s5 5.4 5 9a5 5 0 0 1-10 0c0-3.6 5-9 5-9Z" />
    </Svg>
  )
}

export function ThermometerIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 14.5V5a2 2 0 0 0-4 0v9.5a4 4 0 1 0 4 0Z" />
    </Svg>
  )
}

export function LockIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="10.5" width="14" height="9" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Svg>
  )
}

export function AlertIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4M12 17.5h.01" />
    </Svg>
  )
}

/* ── タイルナビ用アイコン (BottomNav / タイル見出し) ── */

export function SunCloudIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 2.5V4M4.9 4.9 6 6M20 11.5h1.5M19.1 4.9 18 6" />
      <path d="M15.7 11.8a4 4 0 1 0-7.3-2.4" />
      <path d="M13 21.5H7a4.5 4.5 0 1 1 .8-8.9A5 5 0 0 1 13 9.5a3 3 0 0 1 0 12Z" />
    </Svg>
  )
}

export function CloudRainIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 13.9A7 7 0 1 1 15.7 7h1.8a4.5 4.5 0 0 1 2.5 8.2" />
      <path d="M8 14v4M12 16v4M16 14v4" />
    </Svg>
  )
}

export function ZapIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13 2 3.5 14H10l-1 8L18.5 10H12l1-8Z" />
    </Svg>
  )
}

export function ClockIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 1.9" />
    </Svg>
  )
}

export function CalendarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10.5h17" />
    </Svg>
  )
}

export function GaugeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m12 14 4-4" />
      <path d="M3.3 19a10 10 0 1 1 17.4 0" />
    </Svg>
  )
}

export function WindIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12.8 5a2 2 0 1 1 1.4 3.4H2.5" />
      <path d="M17.5 9.8a2.5 2.5 0 1 1 2 4.2H2.5" />
      <path d="M9.8 21a2 2 0 1 0 1.4-3.4H2.5" />
    </Svg>
  )
}

export function LayersIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3.5 13.5 8.5 4.7 8.5-4.7" />
    </Svg>
  )
}

export function BookIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" />
      <path d="M9 3v18" />
    </Svg>
  )
}

export function GridIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </Svg>
  )
}

/** 状態ドット (リスクレベル・重症度などの色付き丸を絵文字でなくトークン色で) */
export function StatusDot({ className = '', size = 10 }: { className?: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
