import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
export const MODELS = [
  "gpt-6.2-astra",
  "gpt-6.2-sol",
  "gpt-6.1-terra",
] as const;
const SAFE_MODEL = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
export const EFFORTS = ["medium", "high"] as const;
export const DEFAULT_MODEL = "gpt-6.2-sol";
export const DEFAULT_EFFORT = "medium";

function configuredModels(): string[] {
  let file = process.env.FORGE_MODELS_TOML;
  if (!file && process.env.FORGE_WORKBENCH_ROOT) {
    const candidate = join(process.env.FORGE_WORKBENCH_ROOT, ".workbench", "models.toml");
    if (existsSync(candidate)) file = candidate;
  }
  if (!file) {
    let dir = process.cwd();
    while (true) {
      const candidate = join(dir, ".workbench", "models.toml");
      if (existsSync(candidate)) { file = candidate; break; }
      const parent = dirname(dir);
      if (parent === dir) return [];
      dir = parent;
    }
  }
  const config = Bun.TOML.parse(readFileSync(file, "utf8")) as { tiers?: Record<string, { model?: unknown }> };
  return Object.values(config.tiers ?? {}).map(tier => tier?.model)
    .filter((model): model is string => typeof model === "string" && SAFE_MODEL.test(model));
}

export function parseModel(value: unknown, allowLegacy = false) {
  if (allowLegacy && typeof value === "string" && SAFE_MODEL.test(value)) return value;
  if ((MODELS as readonly unknown[]).includes(value)) return value as string;
  const models: readonly string[] = [...MODELS, ...configuredModels()];
  if (typeof value !== "string" || !models.includes(value))
    throw Error(`Invalid model; allowed values: ${models.join(", ")}`);
  return value;
}

export function parseEffort(value: unknown) {
  if (!EFFORTS.includes(value as (typeof EFFORTS)[number]))
    throw Error(`Invalid effort; allowed values: ${EFFORTS.join(", ")}`);
  return value as (typeof EFFORTS)[number];
}

export function savedConfiguration(saved: { model?: unknown; configuredModel?: unknown; effort?: unknown }) {
  const builtins: readonly unknown[] = [...MODELS, "gpt-6-astra", "gpt-6.1-sol"];
  if (!builtins.includes(saved.model) && saved.configuredModel !== saved.model) throw Error("Invalid saved model");
  return {
    model: parseModel(saved.model, true),
    // Version 1 tasks predating --effort always requested high.
    effort: parseEffort(saved.effort === undefined ? "high" : saved.effort),
  };
}
