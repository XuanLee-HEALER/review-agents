#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 2 ]; then
  printf 'Usage: bash %s NEW_OUTPUT_DIRECTORY LOCAL_MCP_GIT_REPOSITORY\n' "$0" >&2
  exit 2
fi

umask 077
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
source_repo=$(cd "$2" && pwd)
mkdir -- "$1"
fixture_root=$(cd "$1" && pwd)
base='fe5c686da4a817ca861f284f49f7820d7ea9dac9'
original='3e0bfe7268cfd621c2030d7259ea83a67b043767'
control='9c4c029a556a0e26389dc1b385d900c46acb023d'

for fixture in mcp-original mcp-restart-doc; do
  repo=$(mktemp -d "$fixture_root/r.XXXXXXXX")
  cd "$repo"
  git init -q
  git fetch -q --depth=4 --no-tags --no-write-fetch-head "$source_repo" "$original"
  git -c advice.detachedHead=false switch -qd "$original"
  git merge-base --is-ancestor "$base" "$original"
  head=$original
  if [ "$fixture" = mcp-restart-doc ]; then
    python3 - <<'PY'
from pathlib import Path

readme = Path("README.md")
before = "If the clone fails the server still starts — tools will return a descriptive error until data is available."
after = "If the clone fails the server still starts with an empty index. It does not retry automatically; restart the server to attempt loading the data again."
contents = readme.read_text()
assert contents.count(before) == 1
readme.write_text(contents.replace(before, after))
PY
    export GIT_AUTHOR_NAME='Evaluation fixture' GIT_AUTHOR_EMAIL='fixture@example.invalid'
    export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
    export GIT_AUTHOR_DATE='1794375084 +0800'
    export GIT_COMMITTER_DATE="$GIT_AUTHOR_DATE"
    git add -- README.md
    git -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -qm 'Snapshot revision'
    head=$(git rev-parse HEAD)
    test "$head" = "$control"
  fi
  printf '%s\t%s\t%s\t%s\n' "$fixture" "$repo" "$base" "$head"
done > "$fixture_root/cases.tsv"
