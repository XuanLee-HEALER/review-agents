import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [repo, expectedLoss] = process.argv.slice(2);
const missingAfterRetry = Number(expectedLoss);
const { archiveAuditEvents } = await import(pathToFileURL(resolve(repo, "src/archive.js")).href);
const events = Array.from({ length: 65 }, (_, index) => ({ id: `a${index}` }));
const pending = new Map(events.map((event) => [event.id, event]));
const archived = new Map();
const source = {
  list: async () => [...pending.values()],
  remove: async (ids) => ids.forEach((id) => pending.delete(id)),
};
let failFirstWrite = true;
const archive = {
  write: async (batch) => {
    if (failFirstWrite) {
      failFirstWrite = false;
      throw new Error("storage unavailable");
    }
    for (const event of batch) archived.set(event.id, event);
  },
};

await assert.rejects(archiveAuditEvents(source, archive), /storage unavailable/);
const pendingAfterFailure = pending.size;
assert.equal(pendingAfterFailure, 65 - missingAfterRetry);
assert.equal(archived.size, 0);
const movedOnRetry = await archiveAuditEvents(source, archive);
assert.equal(movedOnRetry, 65 - missingAfterRetry);
assert.equal(pending.size, 0);
assert.deepEqual([...archived.values()], events.slice(missingAfterRetry));
console.log(JSON.stringify({ pendingAfterFailure, movedOnRetry, missingAfterRetry }));
