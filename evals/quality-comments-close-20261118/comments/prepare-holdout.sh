#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 1 ]; then
  printf 'Usage: bash %s NEW_OUTPUT_DIRECTORY\n' "$0" >&2
  exit 2
fi

umask 077
mkdir -- "$1"
fixture_root=$(cd "$1" && pwd)
export GIT_AUTHOR_NAME='Fixture Author' GIT_AUTHOR_EMAIL='fixture@example.test'
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
export GIT_AUTHOR_DATE='2026-11-18T00:00:00Z' GIT_COMMITTER_DATE='2026-11-18T00:00:00Z'
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null

for fixture in retry-delay-wrong retry-delay-correct; do
  repo=$(mktemp -d "$fixture_root/r.XXXXXXXX")
  cd "$repo"
  git init -q --template=
  mkdir docs src
  cat > README.md <<'MD'
# Exports

See [the export guide](docs/exports.md) for download and listing instructions.
MD
  cat > docs/exports.md <<'MD'
# Download an export

Call `GET /exports/current`. A ready export returns status `200` and a JSON object containing the `filename`.

# List exports

Call `GET /exports` to list exports. If omitted, `limit` defaults to 10.
MD
  cat > src/exports.mjs <<'JS'
const EXPORT_READY_AT_MS = 5_000;

export function handleExports(request, nowMs) {
  const url = new URL(request.url);
  if (request.method !== "GET") return new Response(null, { status: 405 });
  if (url.pathname === "/exports") {
    const limit = Number(url.searchParams.get("limit") ?? 20);
    return Response.json({ limit, items: [] });
  }
  if (url.pathname !== "/exports/current") {
    return new Response(null, { status: 404 });
  }
  if (nowMs < EXPORT_READY_AT_MS) {
    const seconds = Math.ceil((EXPORT_READY_AT_MS - nowMs) / 1_000);
    return Response.json({ error: "export_not_ready" }, {
      status: 429,
      headers: { "Retry-After": String(seconds) },
    });
  }
  return Response.json({ filename: "export.csv" });
}
JS
  git add -- README.md docs/exports.md src/exports.mjs
  git -c commit.gpgsign=false commit -qm 'Add export API'
  base=$(git rev-parse HEAD)

  python3 - "$fixture" <<'PY'
from pathlib import Path
import sys

guide = Path("docs/exports.md")
wrong = sys.argv[1] == "retry-delay-wrong"
unit = "milliseconds" if wrong else "seconds"
factor = "" if wrong else " * 1000"
guidance = f"""If the download returns `429`, wait the number of {unit} in the `Retry-After` header before retrying. For example:

```js
const delayMs = Number(response.headers.get("Retry-After")){factor};
```

"""
guide.write_text(guide.read_text().replace("# List exports", guidance + "# List exports"))
PY
  git add -- docs/exports.md
  git -c commit.gpgsign=false commit -qm 'Document retries for export downloads'
  printf '%s\t%s\t%s\t%s\n' "$fixture" "$repo" "$base" "$(git rev-parse HEAD)"
done > "$fixture_root/cases.tsv"
