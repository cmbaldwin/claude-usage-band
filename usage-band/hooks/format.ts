import type { Spark, Usage } from '../types'

export type Run = { t: string; c?: string; bg?: string; d?: boolean; b?: boolean }
// groups are separated by one space; runs inside a group touch
export type Seg = { key: string; prio: number; groups: Run[][]; spark?: Spark }

export type Mode = {
  split: 0 | 1 | 2 // cells per day/hour on the 7d and 5h bars; 0 = plain bar
  bar: number
  reset: boolean
  abs: boolean
  tokens: boolean
  skill: boolean
  hit: boolean
  cbar: number
  jev: number
  git: number
  spark: number
  eta: boolean
}

// Richest first; fit() takes the first one whose core segments fit.
export const MODES: Mode[] = [
  { split: 2, bar: 8, reset: true, abs: true, tokens: true, skill: true, hit: true, cbar: 6, jev: 26, git: 24, spark: 12, eta: true },
  { split: 1, bar: 8, reset: true, abs: false, tokens: true, skill: false, hit: true, cbar: 6, jev: 20, git: 20, spark: 8, eta: true },
  { split: 1, bar: 5, reset: true, abs: false, tokens: false, skill: false, hit: true, cbar: 0, jev: 16, git: 14, spark: 0, eta: false },
  { split: 0, bar: 5, reset: true, abs: false, tokens: false, skill: false, hit: true, cbar: 0, jev: 16, git: 14, spark: 0, eta: false },
  { split: 0, bar: 0, reset: false, abs: false, tokens: false, skill: false, hit: false, cbar: 0, jev: 0, git: 0, spark: 0, eta: false },
]

// Named colors in the data, hex at draw time. Tracks: elapsed / now / still ahead.
export const PAL: Record<string, string> = {
  green: '#4ade80', yellow: '#facc15', red: '#f87171', blue: '#60a5fa',
  cyan: '#22d3ee', magenta: '#c084fc', gray: '#a1a1aa',
}
export const CARD = '#141417' // the band's own background
export const TRACK = { plain: '#3f3f46', past: '#3f3f46', now: '#71717a', future: '#27272a' }

export const k = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

export const tone = (pct: number) => (pct > 75 ? 'red' : pct > 50 ? 'yellow' : 'green')

export const bar = (pct: number, cells: number) => {
  const filled = Math.round((Math.min(Math.max(pct, 0), 100) / 100) * cells)
  return [filled, cells - filled] as const
}

export const dur = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return d ? `${d}d${h}h` : h ? `${h}h${m % 60}m` : `${m}m`
}

export const left = (iso: string | undefined, now: number) => (iso ? dur(Date.parse(iso) - now) : '')

export const label = (kind: string) => (kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : kind)

export const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(n - 1, 1))}…` : s)

export const prTone = (state: string, isDraft: boolean) =>
  isDraft ? 'gray' : state === 'MERGED' ? 'magenta' : state === 'CLOSED' ? 'red' : 'green'

const TTL_S: Record<string, number> = { '5m': 300, '1h': 3600 }

// nowS is epoch seconds
export const cacheView = (c: { warm: boolean; ttl: string; expiresAt: number | null; recache: number | null }, nowS: number) => {
  const left = c.expiresAt === null ? 0 : c.expiresAt - nowS
  if (!c.warm || left <= 0) return { warm: false as const, recache: c.recache === null ? '' : k(c.recache) }
  const total = TTL_S[c.ttl] ?? 3600
  const mins = Math.max(1, Math.round(left / 60))
  return {
    warm: true as const,
    frac: Math.min(left / total, 1),
    low: left / total < 0.2,
    left: mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? `${mins % 60}m` : ''}` : `${mins}m`,
  }
}

// ---- segmented limit bars: one cell group per day (7d) or hour (5h), eighth-blocks for the fill ----

const EIGHTHS = ' ▏▎▍▌▋▊▉'
const WINDOW: Record<string, { n: number; ms: number }> = {
  five_hour: { n: 5, ms: 5 * 3600e3 },
  seven_day: { n: 7, ms: 7 * 86400e3 },
}

// ---- gradient, pace, icons ----

// green to 50%, yellow to 75%, red beyond; sampled in ten steps (one shade per 10%)
const STOPS: [number, number][] = [
  [0, 0x22c55e], [0.45, 0x84cc16], [0.55, 0xeab308], [0.75, 0xf59e0b], [0.85, 0xf97316], [1, 0xef4444],
]
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

const ramp = (x: number) => {
  let i = 0
  while (i < STOPS.length - 2 && x > STOPS[i + 1][0]) i++
  const [f0, c0] = STOPS[i]
  const [f1, c1] = STOPS[i + 1]
  const t = Math.min(Math.max((x - f0) / (f1 - f0), 0), 1)
  const ch = (sh: number) => Math.round(((c0 >> sh) & 255) * (1 - t) + ((c1 >> sh) & 255) * t)
  return hex((ch(16) << 16) | (ch(8) << 8) | ch(0))
}

// the shade for a position (or a fill) 0..1: ten steps
export const grad = (f: number) => ramp((Math.min(Math.floor(Math.min(Math.max(f, 0), 0.9999) * 10), 9) + 0.5) / 10)

const RANK: Record<string, number> = { green: 0, yellow: 1, red: 2 }

// Color by pace: where the window is headed, not only where it is. null elapsed = no pace known.
export const pace = (pct: number, elapsed: number | null, winMs: number, remainingMs: number) => {
  const base = tone(pct)
  if (elapsed === null || elapsed < 0.15 || pct < 5) return { tone: base, etaMs: null as number | null }
  const u = pct / 100
  const projected = u / elapsed
  const byPace = projected >= 1 ? 'red' : projected >= 0.85 ? 'yellow' : 'green'
  const msFull = ((1 - u) * elapsed * winMs) / u
  return {
    tone: RANK[byPace] > RANK[base] ? byPace : base,
    etaMs: projected >= 1 && msFull < remainingMs ? msFull : null,
  }
}

// Nerd Font glyphs, used only when the `icons` option is on
const ICON = {
  ctx: '\uf2db', five_hour: '\uf017', seven_day: '\uf073', cache: '\uf1c0',
  git: '\ue725', pr: '\uf407', jev: '\uf0e7', skill: '\uf0eb',
}

// ---- solid bars: cells are background color; the edge cell is an eighth-block over the track ----

type ColorAt = (pos: number) => string // pos 0..1 along the bar

const cell = (e: number, color: string, track: string): Run =>
  e >= 8 ? { t: ' ', bg: color } : e === 0 ? { t: ' ', bg: track } : { t: EIGHTHS[e], c: color, bg: track }

// Rounded ends: Nerd Font half circles, else half blocks. Colored like the end cells.
export const withCaps = (runs: Run[], icons: boolean): Run[] => {
  if (!runs.length) return runs
  const first = runs[0]
  const last = runs[runs.length - 1]
  return [
    { t: icons ? '\ue0b6' : '▐', c: first.bg ?? first.c },
    ...runs,
    { t: icons ? '\ue0b4' : '▌', c: last.bg ?? last.c },
  ]
}

const TICK = '▏'

const barRuns = (frac: number, cells: number, color: ColorAt, track: string, tick?: number): Run[] => {
  const total = Math.round(Math.min(Math.max(frac, 0), 1) * 8 * cells)
  const tickAt = tick === undefined ? -1 : Math.min(cells - 1, Math.floor(tick * cells))
  return Array.from({ length: cells }, (_, i) => {
    const e = Math.min(Math.max(total - i * 8, 0), 8)
    const col = color((i + 0.5) / cells)
    const run = cell(e, col, track)
    if (i !== tickAt) return run
    // a thin notch at the threshold: dark on a filled cell, light on an empty one
    return { t: TICK, c: e >= 8 ? CARD : '#e4e4e7', bg: e >= 8 ? col : track }
  })
}

// `n` segments of `w` cells drawn as one solid bar; the track behind it is shaded by elapsed time:
// past segments, the current one (lightest), and the ones still ahead (darkest).
export const splitBar = (pct: number, n: number, w: number, nowIdx: number | null, color: string | ColorAt): Run[] => {
  const at: ColorAt = typeof color === 'string' ? () => color : color
  const runs: Run[] = []
  for (let i = 0; i < n; i++) {
    const f = Math.min(Math.max((pct / 100) * n - i, 0), 1)
    const track = nowIdx === null ? TRACK.plain : i < nowIdx ? TRACK.past : i === nowIdx ? TRACK.now : TRACK.future
    for (let j = 0; j < w; j++) {
      const e = Math.round(Math.min(Math.max(f * w - j, 0), 1) * 8)
      runs.push(cell(e, at((i * w + j + 0.5) / (n * w)), track))
    }
  }
  return runs
}

const plainBar = (pct: number, cells: number, color: ColorAt, tick?: number): Run[] =>
  barRuns(pct / 100, cells, color, TRACK.plain, tick)

const meter = (key: string, prio: number, name: string, pct: number, c: string, barRuns: Run[], extras: Run[][]): Seg => {
  const groups: Run[][] = [[{ t: name, d: true }]]
  if (barRuns.length) groups.push(barRuns)
  groups.push([{ t: `${Math.round(pct)}%`, c, b: true }])
  groups.push(...extras)
  return { key, prio, groups }
}

// "balanced 0.82 → sonnet/high" or "balanced 82% → sonnet/high" -> "bal82→s/h"; "fast 0.30 · unchanged" -> "fas30"; else "?"
export const jevShort = (text: string) => {
  const m = /^(\w+)\s+(\d*\.?\d+)(%?)/.exec(text)
  if (!m) return '?'
  const n = Number(m[2])
  const pct = m[3] || n > 1 ? Math.round(n) : Math.round(n * 100) // 0.30 -> 30, 82% -> 82
  const base = `${m[1].slice(0, 3)}${pct}`
  const to = /→\s*(\w+)(?:\/(\w+))?/.exec(text)
  return to ? `${base}→${to[1][0]}${to[2] ? `/${to[2][0]}` : ''}` : base
}

// misc: 0 = pt, git, jev and skill as separate segments; 1-4 = one tiny group (pt, +git, +jev, +skill, richest at 1)
export const buildSegs = (u: Usage, m: Mode, now: number, icons = false, misc = 0): Seg[] => {
  const segs: Seg[] = []
  const lab = (text: string, key: keyof typeof ICON) => (icons ? ICON[key] : text)

  if (u.ctxPct !== null) {
    const abs = m.abs && u.ctxTokens !== null && u.ctxWindow ? `${k(u.ctxTokens)}/${k(u.ctxWindow)}` : ''
    // gradient bar, with a notch where the compact toast fires (80%)
    const bar = m.bar ? withCaps(plainBar(u.ctxPct, m.bar, grad, m.bar >= 6 ? 0.8 : undefined), icons) : []
    segs.push(meter('ctx', 1, lab('ctx', 'ctx'), u.ctxPct, tone(u.ctxPct), bar, abs ? [[{ t: abs, d: true }]] : []))
  }

  u.limits.forEach(l => {
    const win = WINDOW[l.kind]
    const resetMs = l.resetsAt ? Date.parse(l.resetsAt) : null
    const elapsed = win && resetMs !== null ? 1 - (resetMs - now) / win.ms : null
    const p = pace(l.percentUsed, elapsed, win?.ms ?? 0, resetMs === null ? 0 : resetMs - now)
    let runs: Run[] = []
    if (m.split && win) {
      const nowIdx = elapsed === null ? null : Math.min(win.n - 1, Math.max(0, Math.floor(elapsed * win.n)))
      runs = withCaps(splitBar(l.percentUsed, win.n, m.split, nowIdx, grad), icons)
    } else if (m.bar) runs = withCaps(plainBar(l.percentUsed, m.bar, grad), icons)
    const extras: Run[][] = []
    if (m.reset && l.resetsAt) extras.push([{ t: `⟳${left(l.resetsAt, now)}`, d: true }])
    if (m.eta && p.etaMs !== null) extras.push([{ t: `→100% ${dur(p.etaMs)}`, c: 'yellow' }])
    const seg = meter(l.kind, l.kind === 'five_hour' ? 2 : 3, lab(label(l.kind), l.kind as keyof typeof ICON), l.percentUsed, tone(l.percentUsed), runs, extras)
    if (l.kind === 'five_hour' && m.spark && u.spark) seg.spark = { ...u.spark, buckets: u.spark.buckets.slice(0, m.spark) }
    segs.push(seg)
  })

  if (u.usd !== null) segs.push({ key: 'usd', prio: 4, groups: [[{ t: `$${u.usd.toFixed(2)}`, c: 'yellow' }]] })

  if (u.cache) {
    const v = cacheView(u.cache, now / 1000)
    const groups: Run[][] = [[{ t: lab('cache', 'cache'), d: true }]]
    if (v.warm) {
      const c = v.low ? 'yellow' : 'green'
      groups.push([{ t: '●', c }])
      if (m.cbar) groups.push(withCaps(plainBar(v.frac * 100, m.cbar, () => c), icons))
      groups.push([{ t: v.left, c, b: true }])
      if (m.hit && u.cache.hit !== null) groups.push([{ t: `hit ${Math.round(u.cache.hit * 100)}%`, d: true }])
    } else {
      groups.push([{ t: `○ cold${v.recache ? ` · re-caches ${v.recache}` : ''}`, c: 'red' }])
    }
    segs.push({ key: 'cache', prio: 5, groups })
  }

  if (misc === 0) {
    if (u.branch && m.git) {
      const groups: Run[][] = [[{ t: `${icons ? ICON.git : '⎇'} ${trunc(u.branch, m.git)}`, c: 'blue' }, ...(u.dirty ? [{ t: '*', c: 'yellow' }] : [])]]
      if (u.pr) groups.push([{ t: icons ? `${ICON.pr} ${u.pr.number}` : `#${u.pr.number}`, c: prTone(u.pr.state, u.pr.isDraft) }])
      segs.push({ key: 'git', prio: 6, groups })
    }

    if (u.pt) segs.push({ key: 'pt', prio: 7, groups: [[{ t: u.pt, d: true }]] })

    if (u.jev && m.jev) segs.push({ key: 'jev', prio: 8, groups: [[{ t: lab('jev', 'jev'), d: true }], [{ t: trunc(u.jev, m.jev), c: 'cyan' }]] })

    if (u.skill && m.skill) segs.push({ key: 'skill', prio: 9, groups: [[{ t: lab('skill', 'skill'), d: true }], [{ t: trunc(u.skill, 14), c: 'magenta' }]] })
  } else {
    const groups: Run[][] = []
    if (u.pt) groups.push([{ t: u.pt, d: true }])
    if (u.branch && misc <= 3) {
      // last path part of the branch, and the PR number stuck to it: "⎇login-to…*218"
      const name = trunc(u.branch.split('/').pop() || u.branch, 9)
      groups.push([
        { t: `${icons ? ICON.git : '⎇'}${name}`, c: 'blue' },
        ...(u.dirty ? [{ t: '*', c: 'yellow' }] : []),
        ...(u.pr ? [{ t: `${u.pr.number}`, c: prTone(u.pr.state, u.pr.isDraft) }] : []),
      ])
    }
    if (u.jev && misc <= 2) groups.push([{ t: jevShort(u.jev), c: 'cyan' }])
    if (u.skill && misc <= 1) groups.push([{ t: `/${trunc(u.skill, 8)}`, c: 'magenta' }])
    if (groups.length) segs.push({ key: 'misc', prio: 6, groups })
  }

  if (m.tokens) {
    segs.push({ key: 'tok', prio: 10, groups: [[{ t: `↓${k(u.out)}`, c: 'green' }], [{ t: `◈${k(u.cached)}`, c: 'cyan' }]] })
  }

  return segs
}

// ---- fitting ----

export const width = (s: Seg) =>
  s.groups.reduce((n, g, i) => n + (i ? 1 : 0) + g.reduce((m, r) => m + [...r.t].length, 0), 0) +
  (s.spark ? s.spark.buckets.length + 1 : 0)

// " │ " between segments, plus border and padding
export const total = (segs: Seg[]) => segs.reduce((n, s, i) => n + width(s) + (i ? 3 : 0), 0) + 4

// Order of attempts: keep the rich split bars (modes 0-1) and give the tiny group as much as fits, richest
// first; only then fall back to simpler bars. Each try is also made without the token counts.
const ATTEMPTS: [number, number][] = [
  ...[0, 1, 2, 3].flatMap(misc => [0, 1].map(m => [m, misc] as [number, number])),
  ...MODES.flatMap((_, m) => [4, 3, 2, 1, 0].map(misc => [m, misc] as [number, number])).filter(([m]) => m >= 1),
  [0, 4],
]

export const fit = (u: Usage, now: number, cols: number, icons = false): Seg[] => {
  for (const [m, misc] of ATTEMPTS) {
    const full = buildSegs(u, MODES[m], now, icons, misc)
    // token counts only show where nothing else was squeezed for them: rich bars, richest group
    const richest = m <= 1 && misc <= 3
    for (const segs of richest ? [full, full.filter(s => s.key !== 'tok')] : [full.filter(s => s.key !== 'tok')]) {
      if (total(segs) <= cols) return segs
    }
  }
  // nothing fit even in the plainest mode: shed everything but the most important until it does
  let segs = buildSegs(u, MODES[MODES.length - 1], now, icons, 4).filter(s => s.key !== 'tok')
  while (total(segs) > cols && segs.length > 1) {
    const worst = segs.reduce((a, s) => (s.prio > a.prio ? s : a))
    segs = segs.filter(s => s !== worst)
  }
  return segs
}

// ---- burn-rate sparkline: % of the 5h limit used in each time slice of the window ----

export const SLICES = 12
const FIVE_H = 5 * 3600e3

export type Hist = { reset: number; last: number; buckets: number[] }

// Fold one reading into the window's history. reset = resetsAt in ms (rounded to the minute: it jitters).
export const advance = (h: Hist | null, pct: number, resetMs: number, nowMs: number): Hist => {
  const reset = Math.round(resetMs / 60000) * 60000
  const fresh = !h || h.reset !== reset
  const base: Hist = fresh ? { reset, last: pct, buckets: Array(SLICES).fill(0) } : { ...h!, buckets: [...h!.buckets] }
  const start = reset - FIVE_H
  const idx = Math.min(SLICES - 1, Math.max(0, Math.floor(((nowMs - start) / FIVE_H) * SLICES)))
  base.buckets[idx] += Math.max(0, pct - base.last)
  base.last = pct
  return base
}

export const nowIdx = (h: Hist, nowMs: number) =>
  Math.min(SLICES - 1, Math.max(0, Math.floor(((nowMs - (h.reset - FIVE_H)) / FIVE_H) * SLICES)))

const LOWER = ' ▁▂▃▄▅▆▇█'
const rgb = (hex: string) => parseInt(hex.slice(1), 16)

// Raster words [glyph, fg, bg] per cell, one row. Height = share of the busiest slice (at least 5%).
export const sparkWords = (sp: Spark): Uint32Array => {
  const top = Math.max(5, ...sp.buckets)
  const out = new Uint32Array(sp.buckets.length * 3)
  sp.buckets.forEach((v, i) => {
    const level = v <= 0 ? 0 : Math.max(1, Math.round((v / top) * 8))
    const track = i < sp.nowIdx ? TRACK.past : i === sp.nowIdx ? TRACK.now : TRACK.future
    out.set([LOWER.codePointAt(level)!, rgb(grad(v / top)), rgb(track)], i * 3)
  })
  return out
}
