export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Cache = { warm: boolean; ttl: string; expiresAt: number | null; hit: number | null; misses: number; recache: number | null }
export type Spark = { buckets: number[]; nowIdx: number }
export type Usage = {
  ctxPct: number | null
  ctxTokens: number | null
  ctxWindow: number | null
  limits: Limit[]
  usd: number | null
  out: number
  cached: number
  now: number
  jev: string | null
  skill: string | null
  pt: string | null
  spark: Spark | null
  cache: Cache | null
  branch: string | null
  dirty: boolean
  pr: { number: number; state: string; isDraft: boolean } | null
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { usage: Usage }
  }
}
