import { snapshotGitEnv } from "./repo";
import { Database } from "bun:sqlite";
import { existsSync, realpathSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Git links linked checkouts to their shared object store via .git and commondir.
function commonDirectory(checkout: string): string | undefined {
  let git = join(checkout, ".git");
  if (!existsSync(git)) return undefined;
  if (statSync(git).isFile()) {
    const link = /^gitdir: ([\s\S]+)$/.exec(readFileSync(git, "utf8").replace(/\n$/, ""));
    if (!link) return undefined;
    git = resolve(checkout, link[1]);
  }
  const common = join(git, "commondir");
  if (existsSync(common)) git = resolve(git, readFileSync(common, "utf8").replace(/\n$/, ""));
  return existsSync(git) ? realpathSync(git) : undefined;
}

export function launchReviewFloor(repo: string, supplied?: string, suppliedTask?: string) {
  const seq = supplied === undefined ? undefined : Number(supplied);
  if (supplied !== undefined && (!/^\d+$/.test(supplied) || !Number.isSafeInteger(seq))) throw Error("Invalid review floor sequence");
  if (suppliedTask !== undefined && !/^[a-zA-Z0-9._-]{3,80}$/.test(suppliedTask)) throw Error("Invalid ledger task ID");
  const checkout = realpathSync(repo);
  const common = commonDirectory(checkout);
  const roots = new Set<string>();
  if (process.env.FORGE_WORKBENCH_ROOT) roots.add(resolve(process.env.FORGE_WORKBENCH_ROOT));
  for (const start of [checkout, ...(common ? [dirname(common)] : []), process.cwd()]) {
    for (let dir = start; ; dir = dirname(dir)) {
      roots.add(dir);
      if (dir === dirname(dir)) break;
    }
  }
  for (const root of roots) {
    const file = [join(root, ".workbench/ledger/ledger.sqlite"), join(root, ".workbench/ledger.db")].find(existsSync);
    if (!file) continue;
    const db = new Database(file, { readonly: true });
    try {
      const binding = db.transaction(() => {
        // Establish the SQLite snapshot before any Git command or review input is read.
        const rows = db.query(`SELECT r.repo, r.branch, r.worktree, r.task_id FROM task_repos r
          JOIN tasks t ON t.task_id = r.task_id WHERE t.status = 'OPEN'`).all() as Array<{
            repo: string; branch: string; worktree: string | null; task_id: string }>;
        const candidates = rows.filter(r => common && commonDirectory(join(root, r.repo)) === common);
        if (!candidates.length) return null;
        const ref = Bun.spawnSync(["git", "-C", checkout, "symbolic-ref", "--quiet", "HEAD"], { env: snapshotGitEnv() });
        const row = candidates.find(r => !ref.exitCode && "refs/heads/" + r.branch === ref.stdout.toString().replace(/\n$/, ""));
        if (!row) return null;
        let floor = 0, reviewAmended = false;
        const events = db.query(`SELECT seq, event_type, payload_json FROM events WHERE task_id = ?
          AND event_type IN ('SPEC_FROZEN','SPEC_AMENDED') ORDER BY seq`).all(row.task_id) as Array<{
            seq: number; event_type: string; payload_json: string }>;
        for (const event of events) {
          if (event.event_type === "SPEC_AMENDED") reviewAmended ||= JSON.parse(event.payload_json).stale_stages.includes("review");
          else {
            if (!floor || reviewAmended) floor = event.seq;
            reviewAmended = false;
          }
        }
        if (suppliedTask !== undefined && suppliedTask !== row.task_id) throw Error("Supplied review task differs from the current attachment");
        if (seq !== undefined && seq !== floor) throw Error("Supplied review floor differs from the current attachment");
        return { reviewFloorSeq: floor, reviewTaskId: row.task_id };
      })();
      if (binding !== null) return binding;
    } finally { db.close(); }
  }
  if (seq !== undefined && !suppliedTask) throw Error("An explicit review floor requires a ledger task ID; supply --task-id");
  return { reviewFloorSeq: suppliedTask ? seq ?? 0 : undefined, reviewTaskId: suppliedTask };
}
