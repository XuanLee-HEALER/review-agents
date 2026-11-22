import { resolve } from "node:path";
const root = resolve(import.meta.dir, "..");
const fixture = await Bun.file(resolve(root, ".local/fixture.json")).json();
const p = Bun.spawnSync([
  "git",
  "-C",
  fixture.repo,
  "show",
  `${fixture.base}:prefix.ts`,
]);
if (p.exitCode) throw Error("Cannot read fixture baseline");
await Bun.write(
  resolve(fixture.repo, "prefix.ts"),
  p.stdout.toString().replace("Buffer.alloc(256)", "Buffer.allocUnsafe(256)"),
);
for (const args of [
  ["add", "prefix.ts"],
  ["commit", "-m", "restore resource lifetime with safe bounded buffer"],
]) {
  const r = Bun.spawnSync(["git", "-C", fixture.repo, ...args]);
  if (r.exitCode) throw Error("Fixture commit failed");
}
const head = Bun.spawnSync(["git", "-C", fixture.repo, "rev-parse", "HEAD"])
  .stdout.toString()
  .trim();
const results = await Promise.all(
  ["quality", "performance"].map(async (role) => {
    const out = resolve(root, `.local/validation/fixed-${role}.json`);
    const child = Bun.spawn(
      [
        process.execPath,
        resolve(root, `src/${role}.ts`),
        "--repo",
        fixture.repo,
        "--base",
        fixture.base,
        "--head",
        head,
        "--max-turns",
        "8",
        "--out",
        out,
      ],
      { stdout: "ignore", stderr: "inherit" },
    );
    const code = await child.exited;
    const report = await Bun.file(out).json();
    console.log(
      JSON.stringify({
        role,
        code,
        status: report.status,
        turns: report.turns,
        findings: report.findings?.length,
        toolErrors: report.coverage?.toolErrors,
      }),
    );
    return code === 0 && report.status === "pass";
  }),
);
if (results.some((x) => !x)) process.exitCode = 1;
