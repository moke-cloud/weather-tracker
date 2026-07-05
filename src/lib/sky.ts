/**
 * 空の見た目を「今の気象条件 × 時間帯」から決めるグラデーション。
 *
 * これは装飾ではなく情報を運ぶ: 一目で「今の空（晴/曇/雨/雪・昼夜）」が伝わる。
 * 装飾的な purple→blue グラデ (典型的な AI tell) は使わない。
 * 色は OKLCH で指定し、明度・彩度を時間帯と天気で意図的に動かす。
 */

export type DayPhase = 'night' | 'dawn' | 'day' | 'dusk'
export type SkyCondition = 'clear' | 'partly' | 'cloudy' | 'rain' | 'snow' | 'storm'

/** WMO weather code → 空の状態カテゴリ */
export function skyCondition(code: number | null): SkyCondition {
  if (code === null) return 'cloudy'
  if (code === 0 || code === 1) return 'clear'
  if (code === 2) return 'partly'
  if (code === 3 || code === 45 || code === 48) return 'cloudy'
  if (code === 71 || code === 73 || code === 75 || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'rain'
}

/** 時刻 → 一日の局面 (薄明・昼・夕暮れ・夜) */
export function dayPhase(date: Date): DayPhase {
  const h = date.getHours()
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 17) return 'day'
  if (h >= 17 && h < 20) return 'dusk'
  return 'night'
}

export interface Sky {
  /** CSS の linear-gradient 文字列 */
  gradient: string
  /** グラデーション上に置く文字色の前提 ('light' = 濃い文字 / 'dark' = 明るい文字) */
  textOn: 'light' | 'dark'
}

/**
 * 局面 × 条件 → グラデーション。
 * 上段 = 空の高い方の色、下段 = 地平線寄りの色。160deg で上→下に流す。
 *
 * コントラスト制約 (WCAG AA):
 * - textOn 'dark' (白文字を乗せる面) は全ストップ L <= 0.54。
 *   white/90 の 12px ラベルが最も明るいストップ上でも 4.5:1 を維持できる上限。
 * - textOn 'light' (濃い文字を乗せる面) は全ストップ L >= 0.74。
 *   sky-ink/85 が 4.5:1 を維持できる下限。
 */
const SKY_TABLE: Record<DayPhase, Record<SkyCondition, Sky>> = {
  dawn: {
    clear:  { gradient: g('oklch(0.86 0.075 250)', 'oklch(0.88 0.07 70)'),  textOn: 'light' },
    partly: { gradient: g('oklch(0.84 0.05 248)',  'oklch(0.89 0.05 75)'),  textOn: 'light' },
    cloudy: { gradient: g('oklch(0.80 0.025 255)', 'oklch(0.85 0.03 70)'),  textOn: 'light' },
    rain:   { gradient: g('oklch(0.46 0.03 252)',  'oklch(0.52 0.03 250)'), textOn: 'dark'  },
    snow:   { gradient: g('oklch(0.89 0.015 245)', 'oklch(0.93 0.012 70)'), textOn: 'light' },
    storm:  { gradient: g('oklch(0.46 0.04 270)',  'oklch(0.52 0.05 60)'),  textOn: 'dark'  },
  },
  day: {
    clear:  { gradient: g('oklch(0.74 0.115 240)', 'oklch(0.90 0.05 230)'), textOn: 'light' },
    partly: { gradient: g('oklch(0.78 0.07 242)',  'oklch(0.91 0.035 235)'),textOn: 'light' },
    cloudy: { gradient: g('oklch(0.78 0.022 250)', 'oklch(0.86 0.018 245)'),textOn: 'light' },
    rain:   { gradient: g('oklch(0.46 0.03 252)',  'oklch(0.52 0.028 250)'),textOn: 'dark'  },
    snow:   { gradient: g('oklch(0.90 0.014 240)', 'oklch(0.95 0.008 235)'),textOn: 'light' },
    storm:  { gradient: g('oklch(0.44 0.04 268)',  'oklch(0.52 0.04 258)'), textOn: 'dark'  },
  },
  dusk: {
    clear:  { gradient: g('oklch(0.46 0.10 285)',  'oklch(0.54 0.12 52)'),  textOn: 'dark'  },
    partly: { gradient: g('oklch(0.48 0.075 282)', 'oklch(0.54 0.10 56)'),  textOn: 'dark'  },
    cloudy: { gradient: g('oklch(0.46 0.03 275)',  'oklch(0.52 0.045 60)'), textOn: 'dark'  },
    rain:   { gradient: g('oklch(0.44 0.03 270)',  'oklch(0.52 0.04 290)'), textOn: 'dark'  },
    snow:   { gradient: g('oklch(0.74 0.02 255)',  'oklch(0.82 0.025 65)'), textOn: 'light' },
    storm:  { gradient: g('oklch(0.40 0.045 280)', 'oklch(0.50 0.05 300)'), textOn: 'dark'  },
  },
  night: {
    clear:  { gradient: g('oklch(0.32 0.06 268)',  'oklch(0.25 0.045 258)'),textOn: 'dark'  },
    partly: { gradient: g('oklch(0.33 0.045 265)', 'oklch(0.27 0.035 258)'),textOn: 'dark'  },
    cloudy: { gradient: g('oklch(0.31 0.025 260)', 'oklch(0.26 0.02 256)'), textOn: 'dark'  },
    rain:   { gradient: g('oklch(0.28 0.03 262)',  'oklch(0.23 0.025 258)'),textOn: 'dark'  },
    snow:   { gradient: g('oklch(0.40 0.02 255)',  'oklch(0.34 0.018 252)'),textOn: 'dark'  },
    storm:  { gradient: g('oklch(0.24 0.04 272)',  'oklch(0.20 0.035 262)'),textOn: 'dark'  },
  },
}

function g(top: string, bottom: string): string {
  return `linear-gradient(160deg, ${top} 0%, ${bottom} 100%)`
}

/** 現在の空 (天気カードのヘッダー背景に使う) */
export function currentSky(code: number | null, date: Date): Sky {
  return SKY_TABLE[dayPhase(date)][skyCondition(code)]
}

/**
 * ページ全体にうっすら敷く大気のアンビエント光。
 * 時間帯だけで決まる、ごく低彩度の上部グロー。コンテンツと競合しない強さに抑える。
 */
export function ambientGlow(date: Date): string {
  const phase = dayPhase(date)
  const tint: Record<DayPhase, string> = {
    dawn: 'oklch(0.85 0.09 65 / 0.22)',
    day: 'oklch(0.80 0.08 235 / 0.16)',
    dusk: 'oklch(0.70 0.10 40 / 0.20)',
    night: 'oklch(0.45 0.07 270 / 0.18)',
  }
  return `radial-gradient(120% 60% at 50% -10%, ${tint[phase]} 0%, transparent 60%)`
}
