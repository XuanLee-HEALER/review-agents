import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Repo } from "../src/repo";
import { validateReport } from "../src/report";
test("pinned reads, complete pagination and no worktree contamination", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-test-"));
  const git = (...args: string[]) => {
    const r = Bun.spawnSync(["git", "-C", dir, ...args]);
    if (r.exitCode) throw Error(r.stderr.toString());
    return r.stdout.toString().trim();
  };
  try {
    git("init");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "test");
    writeFileSync(join(dir, "a.ts"), "old\n");
    git("add", "a.ts");
    git("commit", "-m", "base");
    const base = git("rev-parse", "HEAD");
    writeFileSync(
      join(dir, "a.ts"),
      Array.from({ length: 400 }, (_, i) => `line${i}`).join("\n"),
    );
    git("add", "a.ts");
    git("commit", "-m", "head");
    writeFileSync(join(dir, "a.ts"), "UNCOMMITTED");
    const r = new Repo(dir, base, "HEAD");
    expect(r.read("a.ts", "head", 0).text).not.toContain("UNCOMMITTED");
    r.diff("a.ts", 0);
    expect(r.missing()).toEqual(["a.ts"]);
    let n = 0;
    while (true) {
      const p = r.diff("a.ts", n);
      n = p.nextOffset;
      if (!p.truncated) break;
    }
    expect(r.missing()).toEqual([]);
    expect(() => r.read("../secret", "head", 0)).toThrow();
    expect(() => r.diff("a.ts", -1)).toThrow();
    expect(r.search("line399", "*.ts", 0).text).toContain("line399");
    expect(r.search("", "**", 0).text).toBe("1: a.ts");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("unread diffs never pass and blocking findings determine exit state", () => {
  const raw = {
    status: "pass",
    summary: "ok",
    findings: [],
    checked: [],
    limitations: [],
  };
  expect(validateReport(raw, ["a"], ["a"]).status).toBe("incomplete");
  expect(
    validateReport(
      {
        ...raw,
        findings: [
          {
            severity: "blocking",
            path: "a",
            line: 1,
            title: "x",
            evidence: "x",
            recommendation: "x",
          },
        ],
      },
      ["a"],
      [],
    ).status,
  ).toBe("findings");
});
