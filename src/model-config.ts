export const MODELS = [
  "gpt-6.2-astra",
  "gpt-6.2-sol",
  "gpt-6.1-terra",
] as const;
const SAVED_MODELS = [...MODELS, "gpt-6-astra", "gpt-6.1-sol"] as const;
export const EFFORTS = ["medium", "high"] as const;
export const DEFAULT_MODEL = "gpt-6.2-sol";
export const DEFAULT_EFFORT = "medium";

export function parseModel(value: unknown, allowLegacy = false) {
  const models: readonly string[] = allowLegacy ? SAVED_MODELS : MODELS;
  if (typeof value !== "string" || !models.includes(value))
    throw Error(`Invalid model; allowed values: ${models.join(", ")}`);
  return value;
}

export function parseEffort(value: unknown) {
  if (!EFFORTS.includes(value as (typeof EFFORTS)[number]))
    throw Error(`Invalid effort; allowed values: ${EFFORTS.join(", ")}`);
  return value as (typeof EFFORTS)[number];
}

export function savedConfiguration(saved: { model?: unknown; effort?: unknown }) {
  return {
    model: parseModel(saved.model, true),
    // Version 1 tasks predating --effort always requested high.
    effort: parseEffort(saved.effort === undefined ? "high" : saved.effort),
  };
}
