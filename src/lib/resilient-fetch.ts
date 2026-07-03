/**
 * 可用性強化フェッチ: タイムアウト + 指数バックオフ再試行。
 * 各外部API (Open-Meteo / JMA) は単一障害点になり得るため、
 * すべての取得はここを経由し、呼び出し側で段階フォールバックする。
 */

export interface ResilientFetchOptions {
  /** リクエスト1回あたりのタイムアウト (ms) */
  timeoutMs?: number
  /** 失敗時の再試行回数 (初回を除く) */
  retries?: number
  /** 再試行間隔の基準 (ms)。試行ごとに2倍 */
  backoffMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_RETRIES = 2
const DEFAULT_BACKOFF_MS = 600

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchOnce(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * JSON を取得する。HTTPエラー(4xx/5xx)・ネットワークエラー・タイムアウトは
 * すべて再試行対象。最終的に失敗したら Error を投げる (呼び出し側でフォールバック)。
 */
export async function fetchJson<T>(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = options.retries ?? DEFAULT_RETRIES
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS

  let lastError: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(backoffMs * 2 ** (attempt - 1))
    }
    try {
      const res = await fetchOnce(url, timeoutMs)
      if (!res.ok) {
        // 4xx はリクエスト自体の問題なので再試行しても無駄なことが多いが、
        // 429 (rate limit) は待てば直るため再試行する
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new NonRetryableError(`HTTP ${res.status}: ${url}`)
        }
        lastError = new Error(`HTTP ${res.status}: ${url}`)
        continue
      }
      return (await res.json()) as T
    } catch (err) {
      if (err instanceof NonRetryableError) throw err
      lastError = err
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`取得に失敗しました: ${url}`)
}

export class NonRetryableError extends Error {}
