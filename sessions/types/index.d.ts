export type Row = { id: string; first: string; last: number; prompts: number }

declare module 'claude-code' {
  interface PluginState {
    sessions: { rows: Row[] }
  }
}
