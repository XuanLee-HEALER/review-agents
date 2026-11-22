#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 3 ]; then
  printf 'Usage: bash %s NEW_FIXTURE_DIRECTORY LOCAL_MCP_GIT_REPOSITORY LOCAL_BUTLERS_GIT_REPOSITORY\n' "$0" >&2
  exit 2
fi

umask 077
here=$(cd "$(dirname -- "$0")" && pwd)
previous="$here/../../quality-comments-20261118/comments"
butlers=$(cd "$3" && pwd)
mkdir -- "$1"
root=$(cd "$1" && pwd)
bash "$previous/prepare-fixtures.sh" "$root/guides"
bash "$previous/prepare-mcp.sh" "$root/mcp" "$2"
bash "$here/prepare-holdout.sh" "$root/holdout"

base=80a6ace5ce2cf83655f41507a7c59e423809c9cc
head=ef80c60bd0c2a2de1266ab5b556ecea9bf5c002a
repo=$(mktemp -d "$root/r.XXXXXXXX")
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
git -C "$repo" init -q --template=
git -C "$repo" fetch -q --depth=2 --no-tags --no-write-fetch-head "$butlers" "$head"
git -C "$repo" -c advice.detachedHead=false switch -qd "$head"
git -C "$repo" merge-base --is-ancestor "$base" "$head"

{
  cat "$root/guides/cases.tsv" "$root/mcp/cases.tsv"
  printf '%s\t%s\t%s\t%s\n' comments-wellness "$repo" "$base" "$head"
  cat "$root/holdout/cases.tsv"
} > "$root/cases.tsv"
