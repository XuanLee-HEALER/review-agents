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

for fixture in guide-before guide-revised wording; do
  repo=$(mktemp -d "$fixture_root/r.XXXXXXXX")
  cd "$repo"
  git init -q
  mkdir -p docs src tests
  cat > README.md <<'MD'
# Notification queue

This service lets callers select the delivery channel when queuing a notification.
See the [notification integration guide](docs/notifications.md) for the request and response payloads.
MD
  cat > docs/notifications.md <<'MD'
# Queue a notification

Send a JSON request to `POST /notifications`. The channel is required and must be `email` or `push`.

```json
{
  "channel": "email"
}
```

The response has status `201` and contains the selected channel.

```json
{
  "data": {
    "channel": "email"
  }
}
```

Invalid request bodies return status `400`.
MD
  cat > src/notifications.js <<'JS'
export async function handleNotifications(request) {
  const { pathname } = new URL(request.url);
  if (request.method !== "POST" || pathname !== "/notifications") {
    return new Response(null, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const channel = body?.channel;
  if (channel !== "email" && channel !== "push") {
    return Response.json({ error: "invalid_channel" }, { status: 400 });
  }

  return Response.json({ data: { channel } }, { status: 201 });
}
JS
  cat > tests/notifications.test.js <<'JS'
import { expect, test } from "bun:test";
import { handleNotifications } from "../src/notifications.js";

test("queues a notification using the selected channel", async () => {
  const result = await handleNotifications(new Request("http://localhost/notifications", {
    method: "POST",
    body: JSON.stringify({ channel: "email" }),
  }));
  expect(result.status).toBe(201);
  expect(await result.json()).toEqual({ data: { channel: "email" } });
});
JS
  git add -- README.md docs/notifications.md src/notifications.js tests/notifications.test.js
  git -c commit.gpgsign=false commit -qm 'Add notifications endpoint'
  base=$(git rev-parse HEAD)

  if [ "$fixture" = wording ]; then
    python3 - <<'PY'
from pathlib import Path

guide = Path("docs/notifications.md")
guide.write_text(guide.read_text().replace(
    "The response has status `201` and contains the selected channel.",
    "The response has status `201` and contains the selected channel. "
    "The selected channel is the channel selected by the caller.",
))
PY
    git add -- docs/notifications.md
    git -c commit.gpgsign=false commit -qm 'Clarify the response description'
  else
    python3 - <<'PY'
from pathlib import Path

route = Path("src/notifications.js")
route.write_text(route.read_text().replace("body?.channel", "body?.delivery?.channel"))
test = Path("tests/notifications.test.js")
test.write_text(test.read_text().replace("{ channel: \"email\" }),", '{ delivery: { channel: "email" } }),', 1) + '''
test("rejects a request without delivery.channel", async () => {
  const result = await handleNotifications(new Request("http://localhost/notifications", {
    method: "POST",
    body: JSON.stringify({ channel: "email" }),
  }));
  expect(result.status).toBe(400);
  expect(await result.json()).toEqual({ error: "invalid_channel" });
});
''')
PY
    git add -- src/notifications.js tests/notifications.test.js
    if [ "$fixture" = guide-revised ]; then
      python3 - <<'PY'
from pathlib import Path

guide = Path("docs/notifications.md")
guide.write_text(guide.read_text().replace(
    "The channel is required and must be `email` or `push`.",
    "The `delivery.channel` field is required and must be `email` or `push`.",
).replace('  "channel": "email"', '  "delivery": { "channel": "email" }', 1))
PY
      git add -- docs/notifications.md
    fi
    git -c commit.gpgsign=false commit -qm 'Use the delivery object in notification requests'
  fi
  printf '%s\t%s\t%s\t%s\n' "$fixture" "$repo" "$base" "$(git rev-parse HEAD)"
done > "$fixture_root/cases.tsv"
