import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchJson, NonRetryableError } from './resilient-fetch'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchJson', () => {
  it('成功時は JSON を返す', async () => {
    const mock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', mock)
    const result = await fetchJson<{ ok: boolean }>('https://example.test/a')
    expect(result.ok).toBe(true)
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('ネットワークエラーは再試行して回復する', async () => {
    const mock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', mock)
    const result = await fetchJson<{ ok: boolean }>('https://example.test/a', {
      retries: 2,
      backoffMs: 1,
    })
    expect(result.ok).toBe(true)
    expect(mock).toHaveBeenCalledTimes(3)
  })

  it('5xx は再試行し、全滅なら throw', async () => {
    const mock = vi.fn().mockResolvedValue(jsonResponse({}, 503))
    vi.stubGlobal('fetch', mock)
    await expect(
      fetchJson('https://example.test/a', { retries: 2, backoffMs: 1 })
    ).rejects.toThrow('HTTP 503')
    expect(mock).toHaveBeenCalledTimes(3)
  })

  it('404 は再試行せず即座に NonRetryableError', async () => {
    const mock = vi.fn().mockResolvedValue(jsonResponse({}, 404))
    vi.stubGlobal('fetch', mock)
    await expect(
      fetchJson('https://example.test/a', { retries: 2, backoffMs: 1 })
    ).rejects.toBeInstanceOf(NonRetryableError)
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('429 (rate limit) は再試行する', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', mock)
    const result = await fetchJson<{ ok: boolean }>('https://example.test/a', {
      retries: 1,
      backoffMs: 1,
    })
    expect(result.ok).toBe(true)
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it('タイムアウトすると AbortSignal で中断され、リトライ後に throw', async () => {
    const mock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          )
        })
    )
    vi.stubGlobal('fetch', mock)
    await expect(
      fetchJson('https://example.test/slow', {
        timeoutMs: 20,
        retries: 1,
        backoffMs: 1,
      })
    ).rejects.toThrow()
    expect(mock).toHaveBeenCalledTimes(2)
  })
})
