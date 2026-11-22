import OpenAI from "openai";

const SAFE_CODES = [
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
  "insufficient_quota",
  "rate_limit_exceeded",
  "slow_down",
] as const;

export function apiErrorCode(error: unknown) {
  if (!(error instanceof OpenAI.APIError)) return undefined;
  if (error.code === "credit_balance_exhausted")
    return error.status === 429 ? "credit_balance_exhausted" : "api_error";
  for (const code of SAFE_CODES)
    if (error.code === code) return code;
  // Older providers can omit code and expose only the broader quota category.
  if (error.code == null && error.type === "insufficient_quota")
    return "insufficient_quota";
  return "api_error";
}
