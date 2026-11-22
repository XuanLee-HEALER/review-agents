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

repo="$fixture_root/archive"
git init -q "$repo"
cd "$repo"
mkdir -p src tests
cat > README.md <<'MD'
# Audit event archive

The worker moves source audit events into durable storage. Failed writes are
retried by the worker on its next run. Source events stay in the queue until
the archive write resolves. Archive writes are idempotent by event ID.
MD
cat > src/archive.js <<'JS'
export async function archiveAuditEvents(source, archive) {
  const events = await source.list();
  if (events.length === 0) return 0;

  await archive.write(events);
  await source.remove(events.map(({ id }) => id));
  return events.length;
}
JS
cat > tests/archive.test.js <<'JS'
import { expect, test } from "bun:test";
import { archiveAuditEvents } from "../src/archive.js";

test("moves a source event to the archive", async () => {
  const events = [{ id: "a1" }];
  const archived = [];
  const source = {
    list: async () => [...events],
    remove: async (ids) => events.splice(0, ids.length),
  };
  const archive = { write: async (batch) => archived.push(...batch) };

  expect(await archiveAuditEvents(source, archive)).toBe(1);
  expect(archived).toEqual([{ id: "a1" }]);
  expect(events).toEqual([]);
});
JS
git add README.md src tests
git -c commit.gpgsign=false commit -qm 'Archive pending audit events'
base=$(git rev-parse HEAD)

for variant in archive-first archive-second; do
  git checkout --quiet --detach "$base"
  cat > src/archive.js <<'JS'
const BATCH_SIZE = 50;

export async function archiveAuditEvents(source, archive) {
  const events = await source.list();
  let moved = 0;
  for (let offset = 0; offset < events.length; offset += BATCH_SIZE) {
    const batch = events.slice(offset, offset + BATCH_SIZE);
    await archive.write(batch);
    await source.remove(batch.map(({ id }) => id));
    moved += batch.length;
  }
  return moved;
}
JS
  if [ "$variant" = archive-first ]; then
    python3 - <<'PY'
from pathlib import Path

source = Path("src/archive.js")
source.write_text(source.read_text().replace(
    "    await archive.write(batch);\n    await source.remove(batch.map(({ id }) => id));",
    "    await source.remove(batch.map(({ id }) => id));\n    await archive.write(batch);",
))
PY
  fi
  cat >> tests/archive.test.js <<'JS'

test("writes archive batches of at most 50 events", async () => {
  const events = Array.from({ length: 65 }, (_, index) => ({ id: `a${index}` }));
  const batchSizes = [];
  const source = { list: async () => [...events], remove: async () => {} };
  const archive = { write: async (batch) => batchSizes.push(batch.length) };

  expect(await archiveAuditEvents(source, archive)).toBe(65);
  expect(batchSizes).toEqual([50, 15]);
});
JS
  git add src tests
  git -c commit.gpgsign=false commit -qm 'Write audit archives in batches'
  printf '%s\t%s\t%s\t%s\n' "$variant" "$repo" "$base" "$(git rev-parse HEAD)"
done > "$fixture_root/cases.tsv"
