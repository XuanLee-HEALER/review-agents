import { realpathSync } from "node:fs";

export function snapshotGitEnv() {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_PAGER: "cat" } as NodeJS.ProcessEnv;
  for (const key of ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_IMPLICIT_WORK_TREE", "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE", "GIT_PREFIX",
    "GIT_SHALLOW_FILE", "GIT_GRAFT_FILE", "GIT_REPLACE_REF_BASE"]) delete env[key];
  return env;
}

export class Repo {
  root: string;
  base: string;
  head: string;
  files: string[];
  coverage = new Map<string, Set<number>>();
  diffs = new Map<string, string[]>();
  excludedFiles: string[];
  readFiles = new Set<string>();
  searches = 0;
  constructor(root: string, base: string, head: string) {
    this.root = realpathSync(root);
    this.base = this.git([
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${base}^{commit}`,
    ]).trim();
    this.head = this.git([
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${head}^{commit}`,
    ]).trim();
    this.files = this.git([
      "diff",
      "--name-only",
      "-z",
      "--no-renames",
      this.base,
      this.head,
      "--",
    ])
      .split("\0")
      .filter(Boolean);
    this.excludedFiles = this.files.filter(isInstructionFile);
    this.files = this.files.filter((p) => !isInstructionFile(p));
  }
  git(args: string[], allowNoMatch = false) {
    const p = Bun.spawnSync(
      ["git", "-c", "core.quotePath=false", "-C", this.root, ...args],
      {
        stdout: "pipe",
        stderr: "pipe",
        env: snapshotGitEnv(),
        timeout: 20000,
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    if (p.exitCode !== 0 && !(allowNoMatch && p.exitCode === 1))
      throw new Error("Git read failed; verify repository, revision and path");
    return p.stdout.toString();
  }
  path(path: string) {
    if (
      !path ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path.split("/").some((x) => x === ".." || x === ".git") ||
      /[\0\r\n]/.test(path)
    )
      throw new Error("Invalid repository-relative path");
    if (isInstructionFile(path))
      throw new Error("Environment instruction files are excluded");
    if (/(^|\/)(\.env($|\.)|config\.toml$)|\.(pem|key)$/.test(path))
      throw new Error("Credential file excluded");
    return path;
  }
  diff(path: string, offset = 0) {
    this.path(path);
    if (!this.files.includes(path))
      throw new Error("Path outside changed files");
    let lines = this.diffs.get(path);
    if (!lines) {
      lines = this.git([
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "--unified=5",
        this.base,
        this.head,
        "--",
        path,
      ]).split("\n");
      this.diffs.set(path, lines);
    }
    const page = this.page(lines, offset);
    const seen = this.coverage.get(path) ?? new Set<number>();
    for (let i = offset; i < page.nextOffset; i++) seen.add(i);
    this.coverage.set(path, seen);
    return page;
  }
  page(lines: string[], offset: number) {
    if (!Number.isInteger(offset) || offset < 0 || offset > lines.length)
      throw new Error("Invalid offset");
    let end = offset,
      bytes = 0;
    while (
      end < lines.length &&
      end - offset < 160 &&
      bytes + lines[end].length < 24000
    ) {
      bytes += lines[end].length;
      end++;
    }
    if (end === offset && end < lines.length)
      throw new Error(
        "Single line exceeds tool limit; report uncovered content",
      );
    return {
      text: lines
        .slice(offset, end)
        .map((x, i) => `${offset + i + 1}: ${x}`)
        .join("\n"),
      nextOffset: end,
      totalLines: lines.length,
      truncated: end < lines.length,
    };
  }
  read(path: string, revision: "base" | "head", offset: number) {
    this.path(path);
    if (revision !== "base" && revision !== "head")
      throw new Error("Invalid revision");
    const sha = revision === "base" ? this.base : this.head;
    const result = this.page(
      this.git(["show", `${sha}:${path}`]).split("\n"),
      offset,
    );
    this.readFiles.add(`${revision}:${path}`);
    return result;
  }
  search(query: string, glob: string, offset: number) {
    if (
      typeof query !== "string" ||
      typeof glob !== "string" ||
      query.length > 200 ||
      glob.length > 200
    )
      throw new Error("Invalid search");
    this.searches++;
    if (!query) {
      const matcher = new Bun.Glob(glob || "**");
      const paths = this.git(["ls-tree", "-r", "--name-only", "-z", this.head])
        .split("\0")
        .filter((p) => p && !isInstructionFile(p) && matcher.match(p));
      return this.page(paths, offset);
    }
    const lines = this.git(
      [
        "grep",
        "-n",
        "-I",
        "-F",
        "-e",
        query,
        this.head,
        "--",
        glob || "*",
        ":(exclude)**/.env*",
        ":(exclude).env*",
        ":(exclude)**/config.toml",
        ":(exclude)config.toml",
        ":(exclude)*.pem",
        ":(exclude)*.key",
        ":(exclude,icase)**/CLAUDE.md",
        ":(exclude,icase)CLAUDE.md",
        ":(exclude,icase)**/AGENTS.md",
        ":(exclude,icase)AGENTS.md",
        ":(exclude,icase)**/SKILL.md",
        ":(exclude,icase)SKILL.md",
        ":(exclude,icase)**/WORKBENCH.md",
        ":(exclude,icase)WORKBENCH.md",
      ],
      true,
    )
      .split("\n")
      .filter(Boolean);
    return this.page(lines, offset);
  }
  missing() {
    return this.files.filter(
      (f) =>
        !this.diffs.has(f) ||
        this.coverage.get(f)?.size !== this.diffs.get(f)!.length ||
        this.diffs.get(f)!.some((l) => l.startsWith("Binary files ")),
    );
  }
}

export function isInstructionFile(path: string) {
  return /(^|\/)(CLAUDE|AGENTS|SKILL|WORKBENCH)\.md$/i.test(path);
}
