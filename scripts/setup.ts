import { chmod, lstat, mkdir, readlink, symlink, unlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
for (const name of [
  "review-quality",
  "review-performance",
  "review-simplify",
  "review-comments",
]) {
  await chmod(resolve(root, "bin", name), 0o755);
}

if (process.argv.includes("--workbench-links")) {
  const skillsDir = resolve(root, "../.agents/skills");
  await mkdir(skillsDir, { recursive: true });
  for (const name of [
    "implementation-review",
    "simplicity-performance-review",
    "code-simplification-review",
    "comment-normalization-review",
  ]) {
    const target = resolve(root, "skills", name);
    const dest = resolve(skillsDir, name);
    const relTarget = relative(dirname(dest), target);
    try {
      const s = await lstat(dest);
      if (s.isSymbolicLink()) {
        if ((await readlink(dest)) === relTarget) continue;
        await unlink(dest);
        await symlink(relTarget, dest);
      } else {
        throw Error(`Existing non-symlink skill: ${dest}`);
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        await symlink(relTarget, dest);
      } else {
        throw e;
      }
    }
  }
}

console.log(
  "CLI permissions verified; workbench links require --workbench-links (targets ../.agents/skills with relative symlinks).",
);
