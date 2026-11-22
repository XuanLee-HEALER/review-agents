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
init() {
  mkdir "$fixture_root/$1"
  cd "$fixture_root/$1"
  git init -q
}
commit() {
  while IFS= read -r -d '' path; do
    git add -- "$path"
  done < <(git ls-files --cached --others --exclude-standard -z)
  git -c commit.gpgsign=false commit -qm "$1"
  git rev-parse HEAD
}

init report-runner
cat > package.json <<'JSON'
{"name":"report-runner","private":true,"type":"module","scripts":{"test":"bun test"}}
JSON
cat > render.js <<'JS'
import { BudgetedDirectory } from "./directory.js";

const MAX_ROWS = 200;

export async function renderReport(directoryClient, teamId, rows) {
  if (rows.length > MAX_ROWS) throw new RangeError("at most 200 records");

  const directory = new BudgetedDirectory(directoryClient);
  const report = [];
  for (const row of rows) {
    report.push({ id: row.id, text: row.text });
  }
  return report;
}
JS
cat > directory.js <<'JS'
// A new directory budget is created for each report job. The upstream directory
// provides a read-only version for the entire job, keyed by teamId.
export class BudgetedDirectory {
  #client;
  #remaining = 64;

  constructor(client) {
    this.#client = client;
  }

  async teamName(teamId) {
    if (this.#remaining <= 0) throw new Error("directory quota exhausted");
    this.#remaining--;
    return await this.#client.readTeam(teamId);
  }

  async classification(rowId) {
    if (this.#remaining <= 0) throw new Error("directory quota exhausted");
    this.#remaining--;
    return await this.#client.readClassification(rowId);
  }
}
JS
cat > README.md <<'MD'
# Report runner

A tenant export has a single team ID and can contain up to 200 ordered records.
A report is persisted only if rendering completes.
The directory view is pinned once per export and is stable for its lifetime.
Classification is recorded by row ID in the directory. The renderer uses pinned
classifications and preserves the order from the tenant's report.
MD
cat > render.test.js <<'JS'
import { expect, test } from "bun:test";
import { renderReport } from "./render.js";

test("exports the maximum accepted report in source order", async () => {
  const directory = { async readTeam() { return "North"; } };
  const rows = Array.from({ length: 200 }, (_, id) => ({ id, text: `row ${id}` }));
  const report = await renderReport(directory, "team-1", rows);
  expect(report).toHaveLength(200);
  expect(report[0].id).toBe(0);
  expect(report[199].id).toBe(199);
});
JS
performance_base=$(commit 'Initial report runner')
python3 - <<'PY'
from pathlib import Path
p = Path("render.js")
p.write_text(p.read_text().replace("    report.push({ id: row.id, text: row.text });", """    const teamName = await directory.teamName(teamId);
    report.push({ id: row.id, text: row.text, teamName });"""))
PY
performance_positive=$(commit 'Export the owning team label')
git checkout -q --detach "$performance_positive"
python3 - <<'PY'
from pathlib import Path
p = Path("render.js")
p.write_text(p.read_text().replace("  const report = [];", """  if (rows.length === 0) return [];
  const teamName = await directory.teamName(teamId);
  const report = [];""").replace("    const teamName = await directory.teamName(teamId);\n", ""))
PY
performance_repaired=$(commit 'Reuse owning team label within each report')
git checkout -q --detach "$performance_base"
cat >> render.js <<'JS'

// The separate classified export is a small, policy-limited preview. The row
// ID identifies the pinned directory classification, even among equal texts.
export async function renderClassifiedPreview(directoryClient, rows) {
  if (rows.length > 16) throw new RangeError("at most 16 preview records");

  const directory = new BudgetedDirectory(directoryClient);
  const report = [];
  for (const row of rows) {
    const classification = await directory.classification(row.id);
    report.push({ id: row.id, text: row.text, classification });
  }
  return report;
}
JS
cat >> render.test.js <<'JS'

test("preview honors per-record directory classification for equal text", async () => {
  const directory = {
    async readClassification(id) { return id === 1 ? "internal" : "public"; },
  };
  const { renderClassifiedPreview } = await import("./render.js");
  const report = await renderClassifiedPreview(directory, [
    { id: 1, text: "unknown" },
    { id: 2, text: "unknown" },
  ]);
  expect(report.map((item) => item.classification)).toEqual(["internal", "public"]);
});
JS
performance_negative=$(commit 'Add policy-limited classified preview')
for sample in "report-positive:$performance_positive" "report-repaired:$performance_repaired" "report-negative:$performance_negative"; do
  git -c advice.detachedHead=false clone -q --no-hardlinks "$fixture_root/report-runner" "$fixture_root/${sample%%:*}"
  git -C "$fixture_root/${sample%%:*}" -c advice.detachedHead=false checkout -q --detach "${sample#*:}"
done

init invoice
mkdir -p api
cat > go.mod <<'GO'
module example.test/invoice

go 1.23
GO
cat > main.go <<'GO'
package main

import (
  "encoding/json"
  "net/http"
  "os"
  "strconv"
)

func discountCents(subtotal int) int {
  if subtotal < 1000 {
    return 0
  }
  return subtotal / 10
}

type invoice struct {
  ID string `json:"id"`
  Discount int `json:"discountCents"`
}

type fileStore struct{ path string }

func (s fileStore) save(id string, subtotal int) error {
  data, err := json.Marshal(invoice{ID: id, Discount: discountCents(subtotal)})
  if err != nil {
    return err
  }
  return os.WriteFile(s.path, data, 0600)
}

func (s fileStore) load() (invoice, error) {
  data, err := os.ReadFile(s.path)
  if err != nil {
    return invoice{}, err
  }
  var saved invoice
  err = json.Unmarshal(data, &saved)
  return saved, err
}

func preview(w http.ResponseWriter, r *http.Request) {
  subtotal, err := strconv.Atoi(r.URL.Query().Get("subtotal"))
  if err != nil || subtotal < 0 {
    http.Error(w, "invalid subtotal", http.StatusBadRequest)
    return
  }
  w.Header().Set("Content-Type", "application/json")
  _ = json.NewEncoder(w).Encode(invoice{ID: "preview", Discount: discountCents(subtotal)})
}

func main() {
  http.HandleFunc("GET /invoice/preview", preview)
  _ = http.ListenAndServe("127.0.0.1:8097", nil)
}
GO
cat > discount_test.go <<'GO'
package main

import "testing"

func TestDiscountCents(t *testing.T) {
  cases := []struct{ subtotal, want int }{{999, 0}, {1000, 100}, {1025, 102}}
  for _, tt := range cases {
    if got := discountCents(tt.subtotal); got != tt.want {
      t.Errorf("discountCents(%d) = %d, want %d", tt.subtotal, got, tt.want)
    }
  }
}
GO
cat > README.md <<'MD'
# Invoice preview

The preview service responds to a public GET /invoice/preview with JSON.
Local smoke as two processes: run the service with `go run .`, and run
`hurl --test --variable base_url=http://127.0.0.1:8097 api/*.hurl`.
`go test ./...` runs the Go suite, including isolated temporary file stores
where needed. Each test case owns its temporary path.
MD
gofmt -w main.go discount_test.go
invoice_base=$(commit 'Introduce invoice preview')
cat > invoice_store_integration_test.go <<'GO'
package main

import (
  "path/filepath"
  "testing"
)

func TestPersistedInvoiceReopens(t *testing.T) {
  path := filepath.Join(t.TempDir(), "invoice.json")
  first := fileStore{path: path}
  if err := first.save("inv-1", 1000); err != nil {
    t.Fatal(err)
  }
  reopened := fileStore{path: path}
  stored, err := reopened.load()
  if err != nil {
    t.Fatal(err)
  }
  if stored.ID != "inv-1" || stored.Discount != 100 {
    t.Fatalf("saved invoice: %+v", stored)
  }
}
GO
cat > api/invoice_preview.hurl <<'HURL'
GET {{base_url}}/invoice/preview?subtotal=1000
HTTP 200
Content-Type: application/json
[Asserts]
jsonpath "$.id" == "preview"
jsonpath "$.discountCents" == 100

GET {{base_url}}/invoice/preview?subtotal=-1
HTTP 400
[Asserts]
body contains "invalid subtotal"
HURL
gofmt -w invoice_store_integration_test.go
invoice_negative=$(commit 'Cover persisted and public preview contracts')
cat > discount_threshold_test.go <<'GO'
package main

import "testing"

func TestDiscountAtMinimumSubtotal(t *testing.T) {
  if got := discountCents(1000); got != 100 {
    t.Fatalf("discount was %d, want 100", got)
  }
}
GO
cat > api/invoice_minimum.hurl <<'HURL'
GET {{base_url}}/invoice/preview?subtotal=1000
HTTP 200
[Asserts]
jsonpath "$.discountCents" == 100
HURL
gofmt -w discount_threshold_test.go
invoice_positive=$(commit 'Add minimum subtotal checks')
for sample in "invoice-positive:$invoice_positive" "invoice-negative:$invoice_negative"; do
  git -c advice.detachedHead=false clone -q --no-hardlinks "$fixture_root/invoice" "$fixture_root/${sample%%:*}"
  git -C "$fixture_root/${sample%%:*}" -c advice.detachedHead=false checkout -q --detach "${sample#*:}"
done
cat > "$fixture_root/fixture-refs.env" <<REF
performance_base=$performance_base
performance_positive=$performance_positive
performance_repaired=$performance_repaired
performance_negative=$performance_negative
invoice_base=$invoice_base
invoice_positive=$invoice_positive
invoice_negative=$invoice_negative
REF
