import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dir, "../.local/known-regression");
await mkdir(root, { recursive: true });
function git(...args: string[]) {
  const r = Bun.spawnSync(["git", "-C", root, ...args]);
  if (r.exitCode) throw Error("Fixture Git operation failed");
  return r.stdout.toString().trim();
}
if (await Bun.file(resolve(root, ".git/HEAD")).exists())
  throw Error("Fixture already exists");
git("init");
git("config", "user.name", "Review fixture");
git("config", "user.email", "fixture@example.invalid");
await writeFile(
  resolve(root, "prefix.ts"),
  `import { openSync, readSync, closeSync } from 'node:fs';
// Called for every file in a potentially large archive inventory.
export function prefix(path: string): string {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(256);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString('utf8');
  } finally {
    closeSync(fd);
  }
}
`,
);
git("add", "prefix.ts");
git("commit", "-m", "baseline");
const base = git("rev-parse", "HEAD");
await writeFile(
  resolve(root, "prefix.ts"),
  `import { openSync, readSync } from 'node:fs';
// Called for every file in a potentially large archive inventory.
export function prefix(path: string): string {
  const fd = openSync(path, 'r');
  const buf = Buffer.alloc(256);
  const n = readSync(fd, buf, 0, buf.length, 0);
  return buf.subarray(0, n).toString('utf8');
}
`,
);
git("add", "prefix.ts");
git("commit", "-m", "simplify prefix");
await writeFile(
  resolve(root, "../fixture.json"),
  JSON.stringify({ repo: root, base, head: git("rev-parse", "HEAD") }),
);
console.log(
  JSON.stringify({ repo: root, base, head: git("rev-parse", "HEAD") }),
);
