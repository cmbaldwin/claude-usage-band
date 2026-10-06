#!/usr/bin/env bash
# statusLine command that prints nothing: it only hands prompt_cache to the usage-band mod,
# one file per session. The mod reads these; see mods/usage-band.
dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/state/cache"
input=$(cat)
id=$(jq -r '.session_id // empty' <<<"$input")
[ -n "$id" ] || exit 0
jq -c '.prompt_cache // empty' <<<"$input" > "$dir/$id.tmp" && mv "$dir/$id.tmp" "$dir/$id.json"
find "$dir" -name '*.json' -mtime +2 -delete 2>/dev/null
