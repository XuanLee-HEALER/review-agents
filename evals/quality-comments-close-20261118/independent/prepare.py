"""Build two clean repositories with reproducible commits and run behavioral probes."""
import json
import os
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
root.mkdir()
repo = root / "source"
repo.mkdir()
env = {**os.environ, "GIT_AUTHOR_DATE": "2026-10-01T10:00:00Z", "GIT_COMMITTER_DATE": "2026-10-01T10:00:00Z"}

def git(*args, cwd=repo):
    return subprocess.check_output(["git", *args], cwd=cwd, env=env, text=True).strip()

def commit(message):
    git("add", ".")
    git("-c", "user.email=dev@example.invalid", "-c", "user.name=Dev", "-c", "commit.gpgSign=false", "commit", "-qm", message)
    return git("rev-parse", "HEAD")

git("init", "-q")
source = repo / "delivery.mjs"
docs = repo / "README.md"
source.write_text("""export async function deliver(send, options = {}) {
  const limit = options.retryLimit ?? 2;
  let attempts = 0;
  while (true) {
    attempts++;
    try {
      await send();
      return { attempts };
    } catch (error) {
      if (attempts > limit) throw error;
    }
  }
}
""")
docs.write_text("""# Delivery client

Set `retryLimit` to zero for operations that cannot be repeated safely. The sender will be called at most once, including when the connection closes before a receipt arrives.

After a successful delivery, use the following field to store the number of attempts:

```js
const receipt = await deliver(send);
await recordAttemptCount(receipt.attempts);
```

The audit writer requires a positive integer for its count parameter.
""")
base = commit("Add delivery client")
source.write_text(source.read_text().replace("options.retryLimit ?? 2", "options.retryLimit || 2").replace("return { attempts };", "return { attemptCount: attempts };"))
bug = commit("Expose the delivery attempt count")
source.write_text(source.read_text().replace("options.retryLimit || 2", "options.retryLimit ?? 2"))
docs.write_text(docs.read_text().replace("receipt.attempts", "receipt.attemptCount"))
fixed = commit("Align delivery options and the receipt example")
probe = """
import { deliver } from './delivery.mjs';
let sends = 0;
try { await deliver(async () => { sends++; throw Error('lost receipt'); }, {retryLimit:0}); } catch {}
const receipt = await deliver(async () => {});
const field = process.argv[1];
console.log(JSON.stringify({sends, exampleSuppliesPositiveInteger: Number.isInteger(receipt[field]) && receipt[field] > 0}));
"""
cases = []
for name, revision, sends, usable in [("a",bug,3,False),("b",fixed,1,True)]:
    dest = root / name
    git("clone","-q",str(repo),str(dest))
    git("checkout","-q","--detach",revision,cwd=dest)
    assert not git("status","--porcelain",cwd=dest)
    doc = (dest/"README.md").read_text()
    field = doc.split("recordAttemptCount(receipt.")[1].split(")")[0]
    actual = json.loads(subprocess.check_output(["node","--input-type=module","-e",probe,field],cwd=dest))
    assert actual == {"sends": sends, "exampleSuppliesPositiveInteger": usable}
    cases.append(dict(name=name,base=base,head=revision,probe=actual))
print(json.dumps(cases,indent=2))
