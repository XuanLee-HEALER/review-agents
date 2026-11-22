import { liveLocks } from "./task";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { savedConfiguration } from "./model-config";

export function taskSummary(dir: string) {
  const s = JSON.parse(readFileSync(resolve(dir, "state.json"), "utf8"));
  const { model, effort } = savedConfiguration(s);
  const running = liveLocks(dir).length > 0;
  return {
    task: resolve(dir),
    role: s.role,
    status: s.status === "running" && !running ? "interrupted" : s.status,
    running,
    updatedAt: s.updatedAt,
    repo: s.repo,
    base: s.base,
    head: s.head,
    model,
    effort,
    actualModels: s.actualModels,
    turns: s.turns,
    maxTurns: s.maxTurns,
    compactions: s.compactions,
    totalTokens: s.tokens,
    result: s.result?.status,
    error: s.error,
    errorCode: s.errorCode,
  };
}
export function listTasks(root: string) {
  return readdirSync(root, { withFileTypes: true })
    .filter((x) => x.isDirectory())
    .map((x) => {
      const path = resolve(root, x.name);
      try {
        return taskSummary(path);
      } catch {
        return { task: path, status: "unreadable" };
      }
    });
}
