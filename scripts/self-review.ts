import { cpSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
const project = resolve(import.meta.dir, "..");
const run = resolve(project, ".local", "validation", `self-${Date.now()}`);
const repo = resolve(run, "sample");
mkdirSync(repo, { recursive: true });
function git(...args: string[]) {
  const p = Bun.spawnSync(["git", "-C", repo, ...args]);
  if (p.exitCode) throw Error("Sample Git operation failed");
  return p.stdout.toString().trim();
}
git("init");
git("config", "user.name", "Review sample");
git("config", "user.email", "sample@example.invalid");
const paths = [
  "src",
  "tests",
  "scripts",
  "prompts",
  "skills",
  "docs",
  "bin",
  "README.md",
  "CLAUDE.md",
  ".gitignore",
  "package.json",
  "bun.lock",
  "tsconfig.json",
];
const baseline = process.env.REVIEW_BASE_SAMPLE;
if (baseline) {
  for (const path of paths)
    if (existsSync(resolve(baseline, path)))
      cpSync(resolve(baseline, path), resolve(repo, path), { recursive: true });
  git("add", "--", ...paths.filter((path) => existsSync(resolve(repo, path))));
}
git("commit", "--allow-empty", "-m", "sample base");
const base = git("rev-parse", "HEAD");
for (const path of paths)
  rmSync(resolve(repo, path), { recursive: true, force: true });
for (const path of paths)
  cpSync(resolve(project, path), resolve(repo, path), { recursive: true });
git("add", "--", ...paths);
git("commit", "-m", "review agents sample");
const head = git("rev-parse", "HEAD");
writeFileSync(
  resolve(run, "scope.json"),
  JSON.stringify({ repo, base, head }, null, 2),
);
console.log(`Sample: ${run}`);
const config = process.env.REVIEW_CONFIG;
const roles = (
  process.env.REVIEW_ROLES ?? "quality,performance,simplify,comments"
).split(",");
if (
  roles.some(
    (role) =>
      !["quality", "performance", "simplify", "comments"].includes(role),
  )
)
  throw Error("Invalid sample roles");
const results = await Promise.all(
  roles.map(async (role) => {
    const task = resolve(run, role);
    const out = resolve(run, `${role}.json`);
    const args = [
      process.execPath,
      resolve(project, `src/${role}.ts`),
      "--repo",
      repo,
      "--base",
      base,
      "--head",
      head,
      "--task",
      task,
      "--out",
      out,
      "--max-turns",
      "30",
      "--model",
      "gpt-6.2-sol",
      "--effort",
      "high",
    ];
    if (config) args.push("--config", config);
    const p = Bun.spawn(args, {
      cwd: repo,
      stdout: "ignore",
      stderr: "inherit",
    });
    const code = await p.exited;
    const report = await Bun.file(out).json();
    return {
      role,
      code,
      status: report.status,
      findings: report.findings?.length,
      task,
    };
  }),
);
writeFileSync(resolve(run, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
if (results.some((x) => x.code === 2)) process.exitCode = 2;
else if (results.some((x) => x.code === 1)) process.exitCode = 1;
