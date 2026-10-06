import { test, expect } from 'claude-code/testing'
import { ago, group } from './format'

const j = (o: object) => JSON.stringify(o)
const h = [
  j({ display: '/usage', timestamp: 1000, project: '/p', sessionId: 'a' }),
  j({ display: 'fix the thing', timestamp: 2000, project: '/p', sessionId: 'a' }),
  j({ display: 'exit', timestamp: 3000, project: '/p', sessionId: 'a' }),
  j({ display: 'other project', timestamp: 9000, project: '/q', sessionId: 'z' }),
  j({ display: 'newer', timestamp: 5000, project: '/p', sessionId: 'b' }),
  'not json',
].join('\n')

test('group sessions', () => {
  const r = group(h, '/p')
  expect(r.map(x => x.id)).toEqual(['b', 'a'])
  expect(r[1]).toEqual({ id: 'a', first: 'fix the thing', last: 3000, prompts: 3 })
  expect(ago(0, 90 * 60000)).toBe('1h ago')
  expect(ago(0, 2 * 86400000)).toBe('2d ago')
})
