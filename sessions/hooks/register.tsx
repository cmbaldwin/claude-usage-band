import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { ago, group } from './format'

const PANE = 'sessions'

// Claude Code's config folder: CLAUDE_CONFIG_DIR, else ~/.claude
async function claudeDir($: EngineInterface) {
  return (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
}
const rows = atom({ plugin: 'sessions', key: 'rows' } as const, [])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sessions', description: "This project's past sessions, from prompt history" })
    return next(e)
  })

  on('command.run', { command: 'sessions' }, async $ => {
    const cwd = await $.session.cwd()
    const history = await $.fs.read(`${await claudeDir($)}/history.jsonl`).catch(() => '')
    const list = group(history, cwd)
    await update($, rows, () => list)
    await $.ui.open({ id: PANE, title: 'Sessions' })
    return { text: list.length ? `${list.length} sessions in ${cwd}. Resume one with: claude --resume <id>` : `No past sessions found for ${cwd}.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, rows)
    const now = await $.clock.now()
    const width = Math.max(20, e.props.bodyColumns - 24)

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No past sessions.</Text>}
        {list.map(r => (
          <Box key={r.id} gap={1}>
            <Text dimColor>{r.id.slice(0, 8)}</Text>
            <Text color="cyan">{ago(r.last, now).padStart(7)}</Text>
            <Text dimColor>{String(r.prompts).padStart(3)}p</Text>
            <Text>{r.first.length > width ? `${r.first.slice(0, width - 1)}…` : r.first || '(no prompt)'}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
