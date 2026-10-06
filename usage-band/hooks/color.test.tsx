import { test, expect } from 'claude-code/testing'

// The band uses hex colors and backgroundColor; the engine must accept them on the terminal.
test('terminal accepts hex colors and backgrounds', { plugins: [{
  name: 'probe',
  register: on => {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box gap={1}>
          <Text backgroundColor="#4ade80">{'  '}</Text>
          <Text color="#facc15" backgroundColor="#3f3f46">▌</Text>
          <Text color="#f87171" bold>72%</Text>
        </Box>
      )
    })
  },
}] }, async $ => {
  const m = await $.ui.mount({
    plugin: 'probe',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } as never,
  })
  expect(m).toBeDefined()
})

// A Raster of eighth-block cells with RGB fg/bg, as the sparkline draws it.
test('terminal accepts the sparkline Raster', { plugins: [{
  name: 'probe2',
  register: on => {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
      const { Box, Raster } = $.ui.resolve(e)
      const words = Uint32Array.of(0x2588, 0x4ade80, 0x3f3f46, 0x2583, 0xfacc15, 0x71717a, 0x20, 0x4ade80, 0x27272a)
      return (
        <Box>
          <Raster key="s" columns={3} rows={1} cells={new Uint8Array(words.buffer).toBase64()} />
        </Box>
      )
    })
  },
}] }, async $ => {
  const m = await $.ui.mount({
    plugin: 'probe2',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } as never,
  })
  expect(m).toBeDefined()
})

// The band's outer Box: hex border, card background, and Nerd Font private-use glyphs as text.
test('terminal accepts the card Box and icon glyphs', { plugins: [{
  name: 'probe3',
  register: on => {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box borderStyle="round" borderColor="#3f3f46" backgroundColor="#141417" paddingX={1} gap={1} alignSelf="flex-start">
          <Text color="#4ade80" backgroundColor="#141417">{''}</Text>
          <Text color="#facc15" backgroundColor="#141417">{' ▉▏'}</Text>
        </Box>
      )
    })
  },
}] }, async $ => {
  const m = await $.ui.mount({
    plugin: 'probe3',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } as never,
  })
  expect(m).toBeDefined()
})
