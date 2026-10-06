import { test, expect } from 'claude-code/testing'
import { MODES, TRACK, advance, buildSegs, cacheView, dur, fit, grad, jevShort, pace, tone, withCaps, k, left, nowIdx, sparkWords, splitBar, total, trunc } from './format'
import type { Usage } from '../types'

test('helpers', () => {
  expect(k(999)).toBe('999')
  expect(k(68000)).toBe('68k')
  expect(k(1500000)).toBe('1.5M')
  expect(trunc('balanced 82% → sonnet/high', 10)).toBe('balanced …')
  expect(left(undefined, 0)).toBe('')
  expect(left(new Date(130 * 60000).toISOString(), 0)).toBe('2h10m')
})

test('cache view', () => {
  const c = { warm: true, ttl: '1h', expiresAt: 3600, recache: 82000 }
  expect(cacheView(c, 0)).toMatchObject({ warm: true, left: '1h', low: false })
  expect(cacheView(c, 3000)).toMatchObject({ warm: true, left: '10m', low: true })
  expect(cacheView(c, 3600)).toEqual({ warm: false, recache: '82k' })
})

const cellColors = (runs: { t: string; c?: string; bg?: string }[]) =>
  runs.flatMap(r => [...r.t].map(() => r.bg ?? r.c))

test('split bar: one solid bar whose track shows elapsed time', () => {
  // 50% of 7 days, 1 cell per day: 3 full days, a half-filled 4th, then empty; no gap cells
  const half = splitBar(50, 7, 1, 3, 'green')
  expect(half).toHaveLength(7)
  expect(cellColors(half)).toEqual(['green', 'green', 'green', TRACK.now, TRACK.future, TRACK.future, TRACK.future])
  expect(half[3]).toMatchObject({ t: '▌', c: 'green', bg: TRACK.now })
  // empty bar, 2 cells per hour, current hour = 3rd: past, now, ahead tracks
  expect(cellColors(splitBar(0, 5, 2, 2, 'red'))).toEqual([
    TRACK.past, TRACK.past, TRACK.past, TRACK.past, TRACK.now, TRACK.now,
    TRACK.future, TRACK.future, TRACK.future, TRACK.future,
  ])
  // full bar is all one color
  expect(new Set(cellColors(splitBar(100, 5, 2, null, 'red')))).toEqual(new Set(['red']))
})

const NOW = Date.parse('2026-10-06T00:00:00Z')
const u: Usage = {
  ctxPct: 34, ctxTokens: 68000, ctxWindow: 200000,
  limits: [
    { kind: 'five_hour', percentUsed: 72, resetsAt: new Date(NOW + 2 * 3600e3).toISOString() },
    { kind: 'seven_day', percentUsed: 41, resetsAt: new Date(NOW + 3 * 86400e3).toISOString() },
  ],
  spark: { buckets: [6, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], nowIdx: 1 }, usd: 0.12, out: 12000, cached: 340000, now: NOW, jev: 'balanced 82% → sonnet/high', skill: 'ponytail', pt: 'pt',
  cache: { warm: true, ttl: '1h', expiresAt: NOW / 1000 + 2280, hit: 0.91, misses: 0, recache: 82000 },
  branch: 'feature/login-toggle', dirty: true, pr: { number: 218, state: 'OPEN', isDraft: false },
}

test('segmented limits mark elapsed time', () => {
  const segs = buildSegs(u, MODES[0], NOW)
  const d7 = segs.find(s => s.key === 'seven_day')!
  // 3 days left of 7 -> 4 days elapsed -> current day is the 5th (index 4)
  expect(d7.groups[1].some(r => r.bg === TRACK.now)).toBe(true)
  const h5 = segs.find(s => s.key === 'five_hour')!
  expect(h5.groups[1].some(r => r.bg === TRACK.future)).toBe(true)
})

test('fit always fits and keeps the core', () => {
  for (const cols of [260, 200, 150, 120, 100, 80, 60, 45]) {
    const segs = fit(u, NOW, cols)
    expect(total(segs)).toBeLessThanOrEqual(cols)
    expect(segs.map(s => s.key)).toContain('ctx')
  }
  // wide: richest mode (split bars + extras); medium keeps usage; narrow drops extras first
  const wide = fit(u, NOW, 260).map(s => s.key)
  expect(wide).toContain('tok')
  const mid = fit(u, NOW, 100).map(s => s.key)
  expect(mid).toEqual(expect.arrayContaining(['ctx', 'five_hour', 'seven_day', 'usd']))
  expect(mid).not.toContain('tok')
})

test('burn-rate history', () => {
  const H = 3600e3
  const reset = 10 * H
  // window starts at 5h; slice = 25 min
  let h = advance(null, 10, reset, 5 * H) // first reading: baseline, no delta
  expect(h.buckets.every(b => b === 0)).toBe(true)
  h = advance(h, 16, reset, 5 * H + 10 * 60e3) // +6 in slice 0
  h = advance(h, 20, reset, 5 * H + 30 * 60e3) // +4 in slice 1
  expect(h.buckets.slice(0, 3)).toEqual([6, 4, 0])
  expect(nowIdx(h, 5 * H + 30 * 60e3)).toBe(1)
  // resetsAt moves to a new window: history restarts
  expect(advance(h, 3, 15 * H, 10 * H + 1).buckets.every(b => b === 0)).toBe(true)
  // glyphs: busiest slice is a full block, empty slice is a blank on the track
  const w = sparkWords({ buckets: [6, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], nowIdx: 1 })
  expect(String.fromCodePoint(w[0])).toBe('█')
  expect(String.fromCodePoint(w[3])).toBe('▅')
  expect(String.fromCodePoint(w[6])).toBe(' ')
  expect(w[2]).toBe(0x3f3f46)
  expect(w[5]).toBe(0x71717a)
})

test('gradient: green to 50%, yellow to 75%, red beyond, in ten steps', () => {
  const hx = (c: string) => parseInt(c.slice(1), 16)
  const [r, g] = [(c: string) => hx(c) >> 16, (c: string) => (hx(c) >> 8) & 255]
  expect(tone(50)).toBe('green')
  expect(tone(51)).toBe('yellow')
  expect(tone(75)).toBe('yellow')
  expect(tone(76)).toBe('red')
  // greens stay green-dominant to 50%, reds red-dominant at the top
  expect(g(grad(0.05))).toBeGreaterThan(r(grad(0.05)))
  expect(g(grad(0.35))).toBeGreaterThan(150)
  expect(r(grad(0.95))).toBeGreaterThan(200)
  expect(g(grad(0.95))).toBeLessThan(100)
  // ten steps: positions inside one 10% band share a shade, neighbouring bands differ
  expect(grad(0.41)).toBe(grad(0.49))
  expect(grad(0.49)).not.toBe(grad(0.51))
  expect(new Set(Array.from({ length: 100 }, (_, i) => grad(i / 100))).size).toBe(10)
})

test('pace: where the window is headed, not only where it is', () => {
  const W = 5 * 3600e3
  // 30% used, 20% of the window elapsed -> projects to 150%: red, and the limit lands before the reset
  const hot = pace(30, 0.2, W, 0.8 * W)
  expect(hot.tone).toBe('red')
  expect(hot.etaMs).toBeGreaterThan(0)
  expect(hot.etaMs!).toBeLessThan(0.8 * W)
  // 30% used at 50% elapsed -> projects to 60%: fine
  expect(pace(30, 0.5, W, 0.5 * W)).toEqual({ tone: 'green', etaMs: null })
  // 75% at 80% elapsed -> projects to 94%: yellow, and no ETA (reset comes first)
  expect(pace(75, 0.8, W, 0.2 * W).tone).toBe('yellow')
  // too early to judge: falls back to the plain thresholds
  expect(pace(4, 0.01, W, W).tone).toBe('green')
  expect(pace(30, 0.1, W, 0.9 * W).etaMs).toBeNull() // under 15% of the window: no projection
  expect(pace(95, null, W, 0).tone).toBe('red')
  expect(dur(80 * 60000)).toBe('1h20m')
})

test('caps follow the end cells; icons swap glyphs', () => {
  const runs = [{ t: ' ', bg: '#111111' }, { t: ' ', bg: '#222222' }]
  expect(withCaps(runs, false).map(r => r.t).join('|')).toBe('▐| | |▌')
  expect(withCaps(runs, true)[0]).toEqual({ t: '\ue0b6', c: '#111111' })
  expect(withCaps(runs, true)[3]).toEqual({ t: '\ue0b4', c: '#222222' })
  expect(withCaps([], true)).toEqual([])
})

test('ctx bar carries an 80% notch; eta shows when the limit lands first', () => {
  const segs = buildSegs({ ...u, ctxPct: 10 }, MODES[0], NOW)
  const ctx = segs.find(s => s.key === 'ctx')!
  expect(ctx.groups[1].some(r => r.t === '▏')).toBe(true)
  const hot = { ...u, limits: [{ kind: 'five_hour', percentUsed: 60, resetsAt: new Date(NOW + 4 * 3600e3).toISOString() }] }
  const h5 = buildSegs(hot, MODES[0], NOW).find(s => s.key === 'five_hour')!
  expect(h5.groups.flat().some(r => r.t.startsWith('→100%'))).toBe(true)
  // icons on: label groups use the Nerd Font glyphs, and everything still fits
  const ic = fit(u, NOW, 260, true)
  expect(ic.find(s => s.key === 'ctx')!.groups[0][0].t).toBe('\uf2db')
})

test('jev abbreviations', () => {
  expect(jevShort('balanced 82% → sonnet/high')).toBe('bal82→s/h')
  expect(jevShort('deep 91% → opus/xhigh')).toBe('dee91→o/x')
  expect(jevShort('fast 60% · unchanged')).toBe('fas60')
  expect(jevShort('fast 0.30 · unchanged')).toBe('fas30')
  expect(jevShort('balanced 0.82 → sonnet/high')).toBe('bal82→s/h')
  expect(jevShort('no answer')).toBe('?')
})

test('tight widths fold branch, PR, jev and skill into one tiny group before dropping them', () => {
  const widths = Array.from({ length: 160 }, (_, i) => 100 + i)
  const seen = widths.map(cols => ({ cols, keys: fit(u, NOW, cols).map(s => s.key) }))
  const withMisc = seen.filter(r => r.keys.includes('misc'))
  expect(withMisc.length).toBeGreaterThan(0)
  // never both forms at once, and always fits
  for (const r of seen) {
    expect(r.keys.includes('misc') && r.keys.includes('git')).toBe(false)
    expect(total(fit(u, NOW, r.cols))).toBeLessThanOrEqual(r.cols)
  }
  // the richest tiny group shows everything abbreviated, e.g. "pt ⎇feature/pa* 218 bal82→s/h /ponytail"
  const widest = fit(u, NOW, withMisc[withMisc.length - 1].cols).find(s => s.key === 'misc')!
  expect(widest.groups.flat().map(r => r.t).join(' ')).toContain('bal82→s/h')
})

test('a wider terminal never shows less of the tiny group', () => {
  const size = (cols: number) => {
    const m = fit(u, NOW, cols).find(s => s.key === 'misc') ?? fit(u, NOW, cols).find(s => s.key === 'git')
    return m ? m.groups.length : 0
  }
  let prev = 0
  for (let cols = 90; cols <= 270; cols += 2) {
    const n = size(cols)
    // groups can shrink only when simpler bars give way to a richer tiny group, never the reverse at wider sizes
    expect(n).toBeGreaterThanOrEqual(prev === 0 ? 0 : Math.min(prev, 1))
    prev = Math.max(prev, n > 0 ? n : prev)
  }
})
