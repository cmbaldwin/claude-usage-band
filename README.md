# claude-usage-band

Two [Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview):

- **`usage-band`**: a compact, responsive band above the prompt with your context fill, 5h and 7d rate limits, prompt-cache state, cost, and a few extras.
- **`sessions`**: `/sessions` opens a pane listing this project's past sessions (short id, age, prompt count, first prompt), read from your prompt history.

Built and tested on Claude Code 2.1.289, macOS, in a terminal. Mods are a new API, so expect it to move.

## What the band shows

| Segment | Meaning |
| --- | --- |
| `ctx` | Context window fill, a green→red ramp (one shade per 10%), a notch at 80%, and `used/window` when there is room |
| `5h`, `7d` | Rate-limit use as one solid bar each. The track behind is shaded by elapsed time: days (or hours) already gone are lighter, the current one lightest. `⟳` is time to reset |
| `→100% 1h54m` | At your current pace you reach 100% of that window in 1h54m, before it resets. Shown only after 15% of the window has passed |
| sparkline | Burn rate: the 5h window in 12 slices, each as tall as the share of the limit used in it. Kept between sessions in the plugin store |
| `$` | Session cost |
| cache | Prompt-cache lifetime left (green, yellow under 20%) and hit ratio, or `cold` with how many tokens the next message re-caches |
| `pt`, branch, PR, `jev` | Tiny group: [ponytail](https://github.com/DietrichGebert/ponytail) mode, git branch (`*` = uncommitted) and PR number, jev-model-router status, last skill |
| `↓ ◈` | Output tokens and cached tokens since the mod loaded |

The band measures itself. It tries the richest layout first and, when the terminal is narrow, folds branch/PR/jev/skill into the tiny group, drops the token counts, and finally simplifies the bars. Core segments (ctx, 5h, 7d, cost, cache) stay as long as they can.

## Install

```sh
git clone https://github.com/cmbaldwin/claude-usage-band ~/claude-usage-band
```

In `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1",
    "CLAUDE_CODE_PLUGIN_DIRS": "/Users/you/claude-usage-band/usage-band:/Users/you/claude-usage-band/sessions"
  }
}
```

Use absolute paths; `CLAUDE_CODE_PLUGIN_DIRS` is colon-separated. (`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` is in my own settings; I have not checked whether newer builds still need it.) Start a new session.

### Cache segment (optional)

Claude Code only sends `prompt_cache` to a status line command, not to mods, so the band reads it from a small file written by a status line script. Needs `jq`.

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash /Users/you/claude-usage-band/scripts/cache-bridge.sh",
    "refreshInterval": 30
  }
}
```

The script prints nothing; it writes `~/.claude/state/cache/<session-id>.json` (files older than two days are deleted). If you already have a status line, read stdin once and feed both:

```sh
input=$(cat)
printf '%s' "$input" | bash /Users/you/claude-usage-band/scripts/cache-bridge.sh
printf '%s' "$input" | your-existing-command
```

The cache segment needs Claude Code 2.1.251 or later. Without the script it is simply absent.

### Options

Set under `pluginConfigs` in `settings.json`, keyed by plugin name:

```json
{
  "pluginConfigs": {
    "usage-band": { "options": { "icons": true, "hideStatus": true } }
  }
}
```

- `icons` (default `false`): Nerd Font glyphs and rounded bar ends. Set your terminal font to a [Nerd Font](https://www.nerdfonts.com/) first, or you get boxes. Without it the labels are words and the ends are half blocks.
- `hideStatus` (default `false`): clear every status line other plugins set (`$.ui.status`), so the bottom row shows only the mode labels. The band still shows the jev status either way.

## Notes

- Colors are hex RGB. A true-color terminal draws them exactly; others approximate to 256 colors.
- The sparkline uses the terminal `Raster` element. I have only used the band in a terminal.
- Git and PR info need `git` and `gh`; PR lookups run only when the branch changes or every five minutes.
- Segments show only what they can read: no ponytail file, no jev status, or no repo just means that piece is absent.

## Develop

Each mod has `claude plugin validate <folder>` and `claude plugin test <folder>`. Layout, color and history logic are covered by tests; the visuals are not.

MIT licensed.
