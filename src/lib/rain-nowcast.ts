/**
 * 雨ナウキャスト: 気象庁 高解像度降水ナウキャスト
 *
 * 「今まさに降っているか」「あと何分で降り出す/やむか」を分単位で答える。
 * - N1: レーダー実況 (5分刻み、validtime == basetime)
 * - N2: 60分先までの予測 (5分刻み、250m〜1kmメッシュ)
 *
 * データはPNGタイルで配信されるため、現在地に対応するタイルを取得し、
 * 該当ピクセルの色を気象庁標準の8段階降水強度パレットに照合して読む。
 * タイルは Access-Control-Allow-Origin: * で配信されている (実測確認済)。
 * ブラウザ専用 (canvas使用)。Service Worker からは呼ばない。
 */

const TARGET_TIMES_N1 =
  'https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json'
const TARGET_TIMES_N2 =
  'https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N2.json'
const TILE_BASE = 'https://www.jma.go.jp/bosai/jmatile/data/nowc'
/** 1kmメッシュ相当。タイル存在をz=10で実測確認済 */
const TILE_ZOOM = 10
const FETCH_TIMEOUT_MS = 8_000

/** 気象庁標準の降水強度パレット (実タイルから抽出・照合済) */
export const RAIN_LEVELS = [
  { level: 0, rgb: null as [number, number, number] | null, range: '0', label: '降水なし' },
  { level: 1, rgb: [242, 242, 255] as [number, number, number], range: '0.1〜1', label: '弱い雨' },
  { level: 2, rgb: [160, 210, 255] as [number, number, number], range: '1〜5', label: '雨' },
  { level: 3, rgb: [33, 140, 255] as [number, number, number], range: '5〜10', label: 'やや強い雨' },
  { level: 4, rgb: [0, 65, 255] as [number, number, number], range: '10〜20', label: 'やや強い雨' },
  { level: 5, rgb: [250, 245, 0] as [number, number, number], range: '20〜30', label: '強い雨' },
  { level: 6, rgb: [255, 153, 0] as [number, number, number], range: '30〜50', label: '激しい雨' },
  { level: 7, rgb: [255, 40, 0] as [number, number, number], range: '50〜80', label: '非常に激しい雨' },
  { level: 8, rgb: [180, 0, 104] as [number, number, number], range: '80以上', label: '猛烈な雨' },
] as const

export interface RainFrame {
  /** 予測対象時刻 (ISO) */
  time: string
  /** 現在からの分数 (実況は0以下になり得る) */
  minutesFromNow: number
  /** 0=降水なし、1-8=気象庁降水強度レベル */
  level: number
}

export interface RainNowcast {
  /** レーダー実況の観測時刻 (ISO) */
  observedAt: string
  current: RainFrame
  /** +5分〜+60分の予測 (5分刻み12フレーム) */
  forecast: RainFrame[]
  summary: string
}

/* ── 純関数 (テスト対象) ── */

/** "20260703121500" (UTC) → epoch ms */
export function parseJmaTime(s: string): number {
  return Date.UTC(
    Number(s.slice(0, 4)),
    Number(s.slice(4, 6)) - 1,
    Number(s.slice(6, 8)),
    Number(s.slice(8, 10)),
    Number(s.slice(10, 12)),
    Number(s.slice(12, 14))
  )
}

/** 緯度経度 → Webメルカトルのタイル座標 + タイル内ピクセル位置 (256px) */
export function latLonToTilePixel(
  lat: number,
  lon: number,
  zoom: number = TILE_ZOOM
): { x: number; y: number; px: number; py: number } {
  const n = 2 ** zoom
  const xF = ((lon + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const yF =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  const x = Math.floor(xF)
  const y = Math.floor(yF)
  return {
    x,
    y,
    px: Math.min(255, Math.floor((xF - x) * 256)),
    py: Math.min(255, Math.floor((yF - y) * 256)),
  }
}

/** ピクセル色 → 降水レベル。透明=0。未知色は最近傍のパレットに丸める */
export function classifyRainColor(
  r: number,
  g: number,
  b: number,
  a: number
): number {
  if (a < 128) return 0
  let best = 0
  let bestDist = Infinity
  for (const entry of RAIN_LEVELS) {
    if (!entry.rgb) continue
    const d =
      (r - entry.rgb[0]) ** 2 + (g - entry.rgb[1]) ** 2 + (b - entry.rgb[2]) ** 2
    if (d < bestDist) {
      bestDist = d
      best = entry.level
    }
  }
  // パレットから極端に遠い色 (境界のアンチエイリアス等) は保守的に「弱い雨」扱い
  return bestDist > 150 ** 2 ? Math.min(best, 1) : best
}

/** 実況+予測レベル列 → ユーザー向け結論文 */
export function buildNowcastSummary(
  currentLevel: number,
  forecast: { minutesFromNow: number; level: number }[]
): string {
  const label = (lv: number) => RAIN_LEVELS[lv]?.label ?? '雨'

  if (currentLevel > 0) {
    const stop = forecast.find((f) => f.level === 0)
    const peak = Math.max(currentLevel, ...forecast.map((f) => f.level))
    if (!stop) {
      const intensifying = peak > currentLevel
      return intensifying
        ? `現在${label(currentLevel)}。この後${label(peak)}に強まり、1時間以上続く見込み`
        : `現在${label(currentLevel)}。少なくとも1時間は続く見込み`
    }
    return `現在${label(currentLevel)}。約${stop.minutesFromNow}分後にやむ見込み`
  }

  const start = forecast.find((f) => f.level > 0)
  if (start) {
    const peak = Math.max(...forecast.map((f) => f.level))
    return `約${start.minutesFromNow}分後に${label(peak)}が降り出す見込み`
  }
  return '今後1時間、雨の心配はありません'
}

/* ── タイル取得 (ブラウザ専用) ── */

interface TargetTime {
  basetime: string
  validtime: string
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function tileUrl(basetime: string, validtime: string, x: number, y: number): string {
  return `${TILE_BASE}/${basetime}/none/${validtime}/surf/hrpns/${TILE_ZOOM}/${x}/${y}.png`
}

/** 使い回し用キャンバス (256x256タイルの1ピクセル読み取り) */
let sharedCanvas: OffscreenCanvas | HTMLCanvasElement | null = null

function getCanvasContext():
  | OffscreenCanvasRenderingContext2D
  | CanvasRenderingContext2D
  | null {
  if (!sharedCanvas) {
    if (typeof OffscreenCanvas !== 'undefined') {
      sharedCanvas = new OffscreenCanvas(256, 256)
    } else if (typeof document !== 'undefined') {
      const c = document.createElement('canvas')
      c.width = 256
      c.height = 256
      sharedCanvas = c
    } else {
      return null
    }
  }
  return sharedCanvas.getContext('2d', { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null
}

/**
 * タイルの1ピクセルから降水レベルを読む。
 * 404はそのタイル領域に降水なし (=レベル0)、その他の失敗は null (欠測)。
 */
async function readTileLevel(
  url: string,
  px: number,
  py: number
): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(url)
    if (res.status === 404) return 0
    if (!res.ok) return null
    const bitmap = await createImageBitmap(await res.blob())
    const ctx = getCanvasContext()
    if (!ctx) return null
    ctx.clearRect(0, 0, 256, 256)
    ctx.drawImage(bitmap, 0, 0)
    const d = ctx.getImageData(px, py, 1, 1).data
    bitmap.close()
    return classifyRainColor(d[0], d[1], d[2], d[3])
  } catch {
    return null
  }
}

/**
 * 現在地の雨ナウキャストを取得する。
 * 実況または予測が全滅した場合は null (UI側で非表示/エラー表示)。
 */
export async function fetchRainNowcast(
  lat: number,
  lon: number
): Promise<RainNowcast | null> {
  try {
    const [n1Res, n2Res] = await Promise.all([
      fetchWithTimeout(TARGET_TIMES_N1),
      fetchWithTimeout(TARGET_TIMES_N2),
    ])
    if (!n1Res.ok || !n2Res.ok) return null
    const n1: TargetTime[] = await n1Res.json()
    const n2: TargetTime[] = await n2Res.json()
    if (n1.length === 0 || n2.length === 0) return null

    // N1先頭 = 最新実況。N2は最新basetimeの予測だけを昇順で使う
    const current = n1[0]
    const latestBase = n2[0].basetime
    const forecastTimes = n2
      .filter((t) => t.basetime === latestBase)
      .sort((a, b) => a.validtime.localeCompare(b.validtime))

    const { x, y, px, py } = latLonToTilePixel(lat, lon)
    const now = Date.now()

    const [currentLevel, ...forecastLevels] = await Promise.all([
      readTileLevel(tileUrl(current.basetime, current.validtime, x, y), px, py),
      ...forecastTimes.map((t) =>
        readTileLevel(tileUrl(t.basetime, t.validtime, x, y), px, py)
      ),
    ])
    if (currentLevel === null) return null

    const toMinutes = (validtime: string) =>
      Math.round((parseJmaTime(validtime) - now) / 60_000 / 5) * 5

    const forecast: RainFrame[] = forecastTimes
      .map((t, i) => ({
        time: new Date(parseJmaTime(t.validtime)).toISOString(),
        minutesFromNow: toMinutes(t.validtime),
        level: forecastLevels[i] ?? 0,
      }))
      .filter((f) => f.minutesFromNow > 0)

    if (forecast.length === 0) return null

    return {
      observedAt: new Date(parseJmaTime(current.basetime)).toISOString(),
      current: {
        time: new Date(parseJmaTime(current.validtime)).toISOString(),
        minutesFromNow: 0,
        level: currentLevel,
      },
      forecast,
      summary: buildNowcastSummary(currentLevel, forecast),
    }
  } catch {
    return null
  }
}
