import type { Row } from '../types'

type Entry = { display: string; timestamp: number; project: string; sessionId: string }

// Group one project's history entries into sessions, newest first.
export const group = (jsonl: string, project: string, limit = 20): Row[] => {
  const by = new Map<string, Row>()
  for (const line of jsonl.split('\n')) {
    let e: Entry
    try { e = JSON.parse(line) } catch { continue }
    if (e.project !== project || !e.sessionId) continue
    const text = e.display.trim()
    // bare "exit" and "/usage" make poor titles
    const isNoise = text === 'exit' || text.startsWith('/usage')
    const r = by.get(e.sessionId) ?? { id: e.sessionId, first: '', last: 0, prompts: 0 }
    if (!r.first && !isNoise) r.first = text.replace(/\s+/g, ' ')
    r.last = Math.max(r.last, e.timestamp)
    r.prompts += 1
    by.set(e.sessionId, r)
  }
  return [...by.values()].sort((a, b) => b.last - a.last).slice(0, limit)
}

export const ago = (ms: number, now: number) => {
  const m = Math.max(0, Math.round((now - ms) / 60000))
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  return d ? `${d}d ago` : h ? `${h}h ago` : `${m}m ago`
}
