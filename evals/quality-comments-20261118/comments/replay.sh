#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 2 ]; then
  printf 'Usage: bash %s CASES_TSV NEW_PRIVATE_OUTPUT_DIRECTORY\n' "$0" >&2
  exit 2
fi

umask 077
project_root=$(cd "$(dirname -- "$0")/../../.." && pwd)
mkdir -- "$2"
out=$(cd "$2" && pwd)

failed=0
while IFS=$'\t' read -r case_id repo base head; do
  repo=$(cd "$repo" && pwd)
  case "$out/" in
    "$repo/"*) printf 'Output must be outside the review repository\n' >&2; exit 2 ;;
  esac
  test "$(git -C "$repo" rev-parse HEAD)" = "$head"
  test -z "$(git -C "$repo" status --porcelain)"
  dest="$out/$case_id"
  mkdir -- "$dest"
  task=$(mktemp -d "$out/t.XXXXXXXX")
  tools=snapshot,workspace
  turns=10
  case "$case_id" in
    mcp-*) tools+=,web; turns=16 ;;
  esac
  args=(--repo . --base "$base" --head "$head" --model gpt-6.2-sol --effort high
        --tool-sets "$tools" --max-turns "$turns" --task "$task" --out "$dest/report.json")
  if [ -n "${REVIEW_CONFIG:-}" ]; then
    args+=(--config "$REVIEW_CONFIG")
  fi
  code=0
  (cd "$repo" && "$project_root/bin/review-comments" "${args[@]}") \
    > "$dest/stdout.json" 2> "$dest/stderr.log" || code=$?
  printf '%s\n' "$code" > "$dest/exit"
  printf '%s exited %s\n' "$case_id" "$code"
  if [ "$code" -gt 1 ]; then
    failed=2
  fi
done < "$1"
exit "$failed"
