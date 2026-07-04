/**
 * 公開API生成のフォールバック: Open-Meteo 障害時に、公開中の
 * GitHub Pages から前回配信分の JSON を取得してそのまま再配信する。
 * これにより一時的な上流障害で都市エンドポイントが 404 になったり、
 * デプロイ全体が失敗したりするのを防ぐ (前回データは meta.stale で明示)。
 */

import { fetchJson } from '../src/lib/resilient-fetch'
import type { PublicEnvelope } from './api-envelope'

/** 前回データ取得の再試行回数 (GitHub Pages 向けなので控えめ) */
const FALLBACK_RETRIES = 1
/** 前回データ取得のタイムアウト (ms) */
const FALLBACK_TIMEOUT_MS = 8_000

/**
 * 前回配信分を stale として印付けする。
 * generatedAt は元の生成時刻のまま残す (データの鮮度が利用者に分かる)。
 */
export function markStale(prev: PublicEnvelope, servedAt: string): PublicEnvelope {
  return {
    ...prev,
    meta: {
      ...prev.meta,
      stale: true,
      staleServedAt: servedAt,
    },
  }
}

/**
 * 都市ペイロードから all.json 用のサマリーを組み立てる。
 * 前回配信データが壊れていて location.slug が取れない場合は null。
 */
export function summaryFromPayload(
  payload: Record<string, unknown>,
  baseUrl: string
): Record<string, unknown> | null {
  const location = payload.location as
    | { slug?: string; name?: string; prefecture?: string }
    | undefined
  if (!location?.slug) return null

  const current = payload.current as
    | { temperature?: number | null; weatherCode?: number | null }
    | null
    | undefined
  const headache = payload.headacheRisk as
    | { score?: number; level?: string; label?: string }
    | undefined
  const umbrella = payload.umbrella as
    | { summary?: string; ranges?: unknown[] }
    | undefined

  return {
    slug: location.slug,
    name: location.name ?? location.slug,
    prefecture: location.prefecture ?? null,
    url: `${baseUrl}/cities/${location.slug}.json`,
    temperature: current?.temperature ?? null,
    weatherCode: current?.weatherCode ?? null,
    headache: headache
      ? { score: headache.score, level: headache.level, label: headache.label }
      : null,
    umbrella:
      umbrella && (umbrella.ranges?.length ?? 0) > 0
        ? (umbrella.summary ?? null)
        : null,
    stale: true,
  }
}

/** stale 配信する都市 (前回 envelope と all.json 用サマリーのペア) */
export interface StaleCity<C extends { slug: string }> {
  city: C
  env: PublicEnvelope
  summary: Record<string, unknown>
}

/**
 * フォールバック取得結果を stale 配信分と欠落 (missing) に振り分ける。
 * summary を組み立てられない壊れた前回データも欠落として扱う
 * (都市 JSON だけ存在して all.json から消える不整合を防ぐ)。
 */
export function resolveFallbacks<C extends { slug: string }>(
  cities: C[],
  previous: (PublicEnvelope | null)[],
  baseUrl: string,
  servedAt: string
): { stale: StaleCity<C>[]; missing: string[] } {
  const stale: StaleCity<C>[] = []
  const missing: string[] = []
  cities.forEach((city, i) => {
    const prev = previous[i]
    const summary = prev?.data ? summaryFromPayload(prev.data, baseUrl) : null
    if (prev && summary) {
      stale.push({ city, env: markStale(prev, servedAt), summary })
    } else {
      missing.push(city.slug)
    }
  })
  return { stale, missing }
}

/**
 * fresh/stale が混ざったサマリーを都市定義順に並べる。
 * サマリーが存在しない都市は含めない。
 */
export function orderSummaries(
  order: { slug: string }[],
  entries: { slug: string; summary: Record<string, unknown> }[]
): Record<string, unknown>[] {
  const bySlug = new Map(entries.map((e) => [e.slug, e.summary]))
  return order
    .map((c) => bySlug.get(c.slug))
    .filter((s): s is Record<string, unknown> => s != null)
}

/**
 * 公開中の GitHub Pages から前回配信分の都市 JSON を取得する。
 * 取得できない・壊れている場合は理由をログして null を返す
 * (呼び出し側で欠落として扱う)。
 */
export async function fetchPreviousEnvelope(
  baseUrl: string,
  slug: string
): Promise<PublicEnvelope | null> {
  try {
    const prev = await fetchJson<PublicEnvelope>(`${baseUrl}/cities/${slug}.json`, {
      retries: FALLBACK_RETRIES,
      timeoutMs: FALLBACK_TIMEOUT_MS,
    })
    if (
      !prev ||
      prev.success !== true ||
      prev.data == null ||
      typeof prev.meta !== 'object' ||
      prev.meta === null
    ) {
      console.error(`  前回データが不正: ${slug} (success/data/meta を確認)`)
      return null
    }
    return prev
  } catch (err) {
    console.error(`  前回データ取得失敗: ${slug}:`, err)
    return null
  }
}
