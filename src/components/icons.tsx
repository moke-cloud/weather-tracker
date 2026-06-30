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
