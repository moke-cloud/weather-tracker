/**
 * 公開APIの共通レスポンス形式 (envelope)。
 * 生成側 (generate-api.ts) とフォールバック側 (api-fallback.ts) で
 * 同一の型を共有し、構造のドリフトを防ぐ。
 */

export interface Envelope<T> {
  success: boolean
  data: T | null
  error: string | null
  meta: {
    generatedAt: string
    version: string
    attribution: string[]
    [key: string]: unknown
  }
}

/** 配信済みJSONを読み戻すときの envelope (ペイロードは検証前なので unknown) */
export type PublicEnvelope = Envelope<Record<string, unknown>>
