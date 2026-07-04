import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  markStale,
  summaryFromPayload,
  fetchPreviousEnvelope,
  resolveFallbacks,
  orderSummaries,
} from './api-fallback'
import type { PublicEnvelope } from './api-envelope'

const BASE_URL = 'https://example.test/api/v1'

function makeEnvelope(overrides: Partial<PublicEnvelope> = {}): PublicEnvelope {
  return {
    success: true,
    data: { location: { slug: 'tokyo' } },
    error: null,
    meta: {
      generatedAt: '2026-07-03T12:00:00.000Z',
      version: 'v1',
      attribution: ['Weather data by Open-Meteo.com (CC BY 4.0)'],
    },
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('markStale', () => {
  it('meta.stale と staleServedAt を付与し、元の generatedAt は保持する', () => {
    const prev = makeEnvelope()
    const result = markStale(prev, '2026-07-04T09:00:00.000Z')
    expect(result.meta.stale).toBe(true)
    expect(result.meta.staleServedAt).toBe('2026-07-04T09:00:00.000Z')
    expect(result.meta.generatedAt).toBe('2026-07-03T12:00:00.000Z')
    expect(result.data).toEqual(prev.data)
  })

  it('元の envelope を変更しない (イミュータブル)', () => {
    const prev = makeEnvelope()
    markStale(prev, '2026-07-04T09:00:00.000Z')
    expect(prev.meta.stale).toBeUndefined()
    expect(prev.meta.staleServedAt).toBeUndefined()
  })

  it('既に stale のデータを再度 stale にしても generatedAt は最初の生成時刻のまま', () => {
    const prev = markStale(makeEnvelope(), '2026-07-04T08:00:00.000Z')
    const again = markStale(prev, '2026-07-04T09:00:00.000Z')
    expect(again.meta.generatedAt).toBe('2026-07-03T12:00:00.000Z')
    expect(again.meta.staleServedAt).toBe('2026-07-04T09:00:00.000Z')
  })
})

describe('summaryFromPayload', () => {
  const payload = {
    location: { slug: 'tokyo', name: '東京', prefecture: '東京都' },
    current: { temperature: 28.4, weatherCode: 3 },
    headacheRisk: { score: 42, level: 'caution', label: 'やや注意' },
    umbrella: { summary: '15時から雨', ranges: [{ start: '15:00' }] },
  }

  it('都市ペイロードから all.json 用サマリーを組み立てる', () => {
    const summary = summaryFromPayload(payload, BASE_URL)
    expect(summary).toEqual({
      slug: 'tokyo',
      name: '東京',
      prefecture: '東京都',
      url: `${BASE_URL}/cities/tokyo.json`,
      temperature: 28.4,
      weatherCode: 3,
      headache: { score: 42, level: 'caution', label: 'やや注意' },
      umbrella: '15時から雨',
      stale: true,
    })
  })

  it('umbrella.ranges が空なら umbrella は null', () => {
    const summary = summaryFromPayload(
      { ...payload, umbrella: { summary: '雨の心配なし', ranges: [] } },
      BASE_URL
    )
    expect(summary?.umbrella).toBeNull()
  })

  it('current が null でも落ちない', () => {
    const summary = summaryFromPayload({ ...payload, current: null }, BASE_URL)
    expect(summary?.temperature).toBeNull()
    expect(summary?.weatherCode).toBeNull()
  })

  it('location.slug が無ければ null (壊れた前回データは採用しない)', () => {
    expect(summaryFromPayload({ current: payload.current }, BASE_URL)).toBeNull()
    expect(summaryFromPayload({ location: {} }, BASE_URL)).toBeNull()
  })
})

describe('resolveFallbacks', () => {
  const cities = [{ slug: 'tokyo' }, { slug: 'osaka' }, { slug: 'kyoto' }]
  const goodEnvelope = (slug: string): PublicEnvelope =>
    makeEnvelope({
      data: {
        location: { slug, name: slug, prefecture: '—' },
        current: { temperature: 20, weatherCode: 1 },
        headacheRisk: { score: 10, level: 'low', label: '低' },
        umbrella: { summary: null, ranges: [] },
      },
    })

  it('前回データが取得できた都市は stale (env + summary) に振り分ける', () => {
    const { stale, missing } = resolveFallbacks(
      cities,
      [goodEnvelope('tokyo'), goodEnvelope('osaka'), goodEnvelope('kyoto')],
      BASE_URL,
      '2026-07-04T09:00:00.000Z'
    )
    expect(stale.map((s) => s.city.slug)).toEqual(['tokyo', 'osaka', 'kyoto'])
    expect(missing).toEqual([])
    expect(stale[0].env.meta.stale).toBe(true)
    expect(stale[0].summary.slug).toBe('tokyo')
    expect(stale[0].summary.stale).toBe(true)
  })

  it('取得できなかった都市 (null) は missing に入る', () => {
    const { stale, missing } = resolveFallbacks(
      cities,
      [goodEnvelope('tokyo'), null, goodEnvelope('kyoto')],
      BASE_URL,
      '2026-07-04T09:00:00.000Z'
    )
    expect(stale.map((s) => s.city.slug)).toEqual(['tokyo', 'kyoto'])
    expect(missing).toEqual(['osaka'])
  })

  it('summary を組み立てられない壊れた前回データも missing (city JSON だけ書かれて all.json から消える不整合を防ぐ)', () => {
    const broken = makeEnvelope({ data: { current: { temperature: 20 } } })
    const { stale, missing } = resolveFallbacks(
      cities,
      [goodEnvelope('tokyo'), broken, null],
      BASE_URL,
      '2026-07-04T09:00:00.000Z'
    )
    expect(stale.map((s) => s.city.slug)).toEqual(['tokyo'])
    expect(missing).toEqual(['osaka', 'kyoto'])
  })
})

describe('orderSummaries', () => {
  const order = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }, { slug: 'd' }]

  it('fresh/stale が混ざっても都市定義順に並べる', () => {
    const result = orderSummaries(order, [
      { slug: 'c', summary: { slug: 'c' } },
      { slug: 'a', summary: { slug: 'a' } },
      { slug: 'd', summary: { slug: 'd', stale: true } },
    ])
    expect(result.map((s) => s.slug)).toEqual(['a', 'c', 'd'])
  })

  it('サマリーが無い都市は含めない', () => {
    expect(orderSummaries(order, [])).toEqual([])
  })
})

describe('fetchPreviousEnvelope', () => {
  it('前回配信の envelope を取得して返す', async () => {
    const prev = makeEnvelope()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(prev)))
    const result = await fetchPreviousEnvelope(BASE_URL, 'tokyo')
    expect(result).not.toBeNull()
    expect(result?.data).toEqual(prev.data)
  })

  it('取得失敗 (404等) は null を返す (throw しない)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 404)))
    const result = await fetchPreviousEnvelope(BASE_URL, 'tokyo')
    expect(result).toBeNull()
  })

  it('success=false や data=null の envelope は採用しない', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(makeEnvelope({ success: false })))
    )
    expect(await fetchPreviousEnvelope(BASE_URL, 'tokyo')).toBeNull()

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(makeEnvelope({ data: null })))
    )
    expect(await fetchPreviousEnvelope(BASE_URL, 'tokyo')).toBeNull()
  })

  it('meta を持たない壊れた envelope は採用しない', async () => {
    const broken = { success: true, data: { location: { slug: 'tokyo' } }, error: null }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(broken)))
    expect(await fetchPreviousEnvelope(BASE_URL, 'tokyo')).toBeNull()
  })

  it('ネットワークエラーでも null を返す (throw しない)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('network error'))
    )
    expect(await fetchPreviousEnvelope(BASE_URL, 'tokyo')).toBeNull()
  })
})
