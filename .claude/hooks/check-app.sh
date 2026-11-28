#!/bin/sh
# Claude Code PostToolUse hook (see .claude/settings.json): after Claude edits or writes a
# file under app/, run the frontend lint (oxlint) and typecheck (tsc) in the app container.
# On failure it exits 2: Claude Code feeds stderr back to Claude, which must fix it.
set -u

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
file=$(python3 -c 'import json, sys; print((json.load(sys.stdin).get("tool_input") or {}).get("file_path", ""))' 2>/dev/null) || exit 0

case "$file" in
  "$root"/app/*) ;;
  *) exit 0 ;;
esac
case "$file" in
  */node_modules/* | */src/api/generated/*) exit 0 ;;
esac

cd "$root" || exit 0
# Everything runs in the containers: without the stack, say so but don't block.
if ! docker compose ps --status running --services 2>/dev/null | grep -qx app; then
  echo '{"systemMessage": "Frontend lint/typecheck skipped: the app container is not running (make up)."}'
  exit 0
fi

output=$(docker compose exec -T app sh -c \
  'npx oxlint --deny-warnings; lint=$?; npx tsc -b; types=$?; [ $lint -eq 0 ] && [ $types -eq 0 ]' 2>&1)
if [ $? -ne 0 ]; then
  {
    echo "Frontend lint/typecheck failed after editing ${file#"$root"/}. Fix it before continuing:"
    echo "$output" | tail -n 80
  } >&2
  exit 2
fi
exit 0
