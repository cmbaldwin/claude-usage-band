import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Usage } from '../types'
import { CARD, PAL, advance, fit, nowIdx, sparkWords } from './format'
import type { Hist } from './format'

const usage = atom(
  { plugin: 'usage-band', key: 'usage' } as const,
  { ctxPct: null, ctxTokens: null, ctxWindow: null, limits: [], usd: null, out: 0, cached: 0, now: 0, jev: null, skill: null, pt: null, spark: null, cache: null, branch: null, dirty: false, pr: null } as Usage
)

// Claude Code's config folder: CLAUDE_CONFIG_DIR, else ~/.claude
async function claudeDir($: EngineInterface) {
  return (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
}

// git is cheap, gh is a network call: refresh git at most every 10s, the PR only when the branch changes or after 5 min
let gitAt = 0
let prAt = 0
let prBranch = ''
let isWarned = false // context toast fires once per climb past 80%, re-arms under 60%

async function refreshGit($: EngineInterface, now: number) {
  if (now - gitAt < 10_000) return
  gitAt = now
  const cwd = await $.session.cwd()
  const git = (args: string[]) => $.process.run(['git', ...args], { cwd, timeoutMs: 3000 }).catch(() => null)
  const head = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (!head || head.exitCode !== 0) {
    await update($, usage, u => ({ ...u, branch: null, dirty: false, pr: null }))
    return
  }
  const branch = head.stdout.trim()
  const dirty = !!(await git(['status', '--porcelain']))?.stdout.trim()
  let pr: Usage['pr'] | undefined
  if (branch !== prBranch || now - prAt > 300_000) {
    prBranch = branch
    prAt = now
    const r = await $.process
      .run(['gh', 'pr', 'view', '--json', 'number,state,isDraft'], { cwd, timeoutMs: 5000 })
      .catch(() => null)
    try { pr = r && r.exitCode === 0 ? JSON.parse(r.stdout) : null } catch { pr = null }
  }
  await update($, usage, u => ({ ...u, branch, dirty, pr: pr === undefined ? u.pr : pr }))
}

// cache-bridge.sh writes prompt_cache here, one file per session (the mod API has no live cache numbers)
async function refreshCache($: EngineInterface) {
  const id = await $.session.id()
  const text = await $.fs.read(`${await claudeDir($)}/state/cache/${id}.json`).catch(() => '')
  let c: Usage['cache'] = null
  try {
    const j = text.trim() ? JSON.parse(text) : null
    if (j && j.caching_observed !== false) {
      c = { warm: !!j.warm, ttl: j.ttl ?? '1h', expiresAt: j.expires_at ?? null, hit: j.hit_ratio ?? null, misses: j.misses ?? 0, recache: j.recache_tokens_if_cold ?? null }
    }
  } catch { c = null }
  const now = await $.clock.now()
  await update($, usage, u => ({ ...u, cache: c, now }))
}

export const register: Register = (on, options) => {
  const icons = options.icons === true // Nerd Font glyphs; set the terminal font first
  const hideStatus = options.hideStatus === true
  on('session.start', async ($, e, next) => {
    $.clock.every(30_000, () => refreshCache($))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const now = await $.clock.now()
    await refreshGit($, now)
    await refreshCache($)
    const five = e.rateLimits.find(l => l.kind === 'five_hour')
    let spark: Usage['spark'] = null
    if (five?.resetsAt) {
      const prev = ((await $.store.get('five')) as Hist | undefined) ?? null
      const hist = advance(prev, five.percentUsed, Date.parse(five.resetsAt), now)
      if (JSON.stringify(hist) !== JSON.stringify(prev)) await $.store.set('five', hist)
      spark = { buckets: hist.buckets, nowIdx: nowIdx(hist, now) }
    }
    const pct = e.context.percent ?? 0
    if (pct >= 80 && !isWarned) {
      isWarned = true
      $.ui.toast(`Context ${Math.round(pct)}% full. Consider /compact.`, { timeoutMs: 8000 })
    } else if (pct < 60) isWarned = false
    // the ponytail plugin writes its mode here; no file = no tag
    const mode = await $.fs.read(`${await claudeDir($)}/.ponytail-active`).then(t => t.trim().split('\n')[0]?.trim() ?? '', () => null)
    await update($, usage, u => ({
      ...u,
      ctxPct: e.context.percent ?? null,
      ctxTokens: e.context.tokens ?? null,
      ctxWindow: e.context.window,
      limits: e.rateLimits,
      spark,
      usd: e.cost?.usd ?? null,
      now,
      pt: mode === null ? null : mode === '' || mode === 'full' ? 'pt' : `pt:${mode}`
    }))
    return next(e)
  })

  // jev-model-router reports through $.ui.status: show its answer in the band. With hideStatus on, every
  // status line is also cleared, which leaves the bottom row to the mode labels.
  on('ui.status', async ($, e, next) => {
    if (e.text?.startsWith('jev')) {
      const text = e.text.replace(/^jev\s*·\s*/, '')
      await update($, usage, u => ({ ...u, jev: text }))
    }
    return hideStatus ? next({ ...e, text: undefined }) : next(e)
  })

  on('skill.prompt', async ($, e, next) => {
    await update($, usage, u => ({ ...u, skill: e.skill }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const t = e.usage
    if (t) {
      await update($, usage, u => ({
        ...u,
        out: u.out + t.output_tokens,
        cached: u.cached + t.cache_read_input_tokens + t.cache_creation_input_tokens
      }))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const u = await read($, usage)
    const hasData = u.ctxPct !== null || u.limits.length > 0 || u.usd !== null || u.jev !== null || u.branch !== null || u.cache !== null
    if (e.props.hasSurvey || !hasData) return next(e)

    const { Box, Text, Raster } = $.ui.resolve(e)
    const segs = fit(u, u.now, e.props.bodyColumns, icons)

    // one rounded, left-aligned box; dim dividers between segments; shrinks to its content
    const cells = segs.flatMap((seg, i) => {
      const body = (
        <Box key={seg.key} gap={1}>
          {seg.groups.map((g, gi) => (
            <Text key={gi}>
              {g.map((r, ri) => (
                <Text key={ri} color={r.c && (PAL[r.c] ?? r.c)} backgroundColor={r.bg ? (PAL[r.bg] ?? r.bg) : CARD} dimColor={r.d} bold={r.b}>{r.t}</Text>
              ))}
            </Text>
          ))}
          {seg.spark ? (
            <Raster key={`${seg.key}-spark`} columns={seg.spark.buckets.length} rows={1} cells={new Uint8Array(sparkWords(seg.spark).buffer).toBase64()} />
          ) : null}
        </Box>
      )
      return i ? [<Text key={`d${i}`} color="#3f3f46" backgroundColor={CARD}>│</Text>, body] : [body]
    })

    return (
      <Box borderStyle="round" borderColor="#3f3f46" backgroundColor={CARD} paddingX={1} gap={1} alignSelf="flex-start">
        {cells}
      </Box>
    )
  })
}
