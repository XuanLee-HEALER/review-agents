import { z } from "zod";
export const Report = z.object({
  status: z.enum(["pass", "findings", "incomplete"]),
  summary: z.string(),
  findings: z.array(
    z.object({
      severity: z.enum(["blocking", "suggestion"]),
      path: z.string(),
      line: z.number().int().positive(),
      title: z.string(),
      evidence: z.string(),
      recommendation: z.string(),
    }),
  ),
  checked: z.array(z.string()),
  limitations: z.array(z.string()),
});

export class ReportTextError extends Error {
  constructor(readonly field: string) {
    super(`Report field ${field} contains unsafe control characters`);
  }
}

export function hasUnsafeReportText(value: unknown): boolean {
  if (typeof value === "string")
    return /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]|\r(?!\n)/.test(value);
  return value !== null && typeof value === "object" &&
    Object.entries(value).some(([key, entry]) =>
      hasUnsafeReportText(key) || hasUnsafeReportText(entry));
}

function escapeDisplayText(value: string) {
  return JSON.stringify(value).slice(1, -1).replace(/[\x7f-\x9f]/g, (char) =>
    `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

// Report content has already been checked. Preserve runtime paths verbatim in
// the task and mark any JSON-string escapes needed to display them safely.
export function displayReport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(displayReport);
  if (!value || typeof value !== "object" || !hasUnsafeReportText(value)) return value;
  const escapedFields: string[] = [];
  const format = (entry: unknown, path: string): unknown => {
    if (typeof entry === "string" && hasUnsafeReportText(entry)) {
      escapedFields.push(path);
      return escapeDisplayText(entry);
    }
    if (Array.isArray(entry)) return entry.map((item, index) => format(item, `${path}/${index}`));
    if (entry && typeof entry === "object")
      return Object.fromEntries(Object.entries(entry).map(([key, item]) => [
        key,
        format(item, `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`),
      ]));
    return entry;
  };
  return { ...(format(value, "") as Record<string, unknown>), escapedFields };
}

function plainText(text: string, field: string) {
  // Strip only complete Select Graphic Rendition sequences. A stray escape
  // may stand in for missing text, and other terminal commands can hide text.
  const plain = text.replace(/(?:\x1b\[|\x9b)[0-9:;]*m/g, "");
  if (hasUnsafeReportText(plain)) throw new ReportTextError(field);
  return plain;
}

export function cleanReport(raw: unknown, paths: string[] = []) {
  const parsed = Report.safeParse(raw);
  if (!parsed.success) {
    if (hasUnsafeReportText(raw)) throw new ReportTextError("report");
    throw parsed.error;
  }
  const r = parsed.data;
  r.summary = plainText(r.summary, "summary");
  r.findings.forEach((finding, i) => {
    const field = `findings[${i}]`;
    // Only the exact repository identifier can justify retaining such a path.
    if (hasUnsafeReportText(finding.path) && !paths.includes(finding.path))
      throw new ReportTextError(`${field}.path`);
    finding.title = plainText(finding.title, `${field}.title`);
    finding.evidence = plainText(finding.evidence, `${field}.evidence`);
    finding.recommendation = plainText(finding.recommendation, `${field}.recommendation`);
  });
  r.checked = r.checked.map((text, i) => plainText(text, `checked[${i}]`));
  r.limitations = r.limitations.map((text, i) => plainText(text, `limitations[${i}]`));
  return r;
}

export function validateReport(
  raw: unknown,
  files: string[],
  missing: string[],
) {
  const r = cleanReport(raw, files);
  for (const f of r.findings)
    if (!files.includes(f.path))
      throw new Error("Finding must anchor to a changed file");
  if (missing.length) {
    r.status = "incomplete";
    r.limitations.push(`Unread diff: ${missing.join(", ")}`);
  }
  if (r.status !== "incomplete")
    r.status = r.findings.some((f) => f.severity === "blocking")
      ? "findings"
      : "pass";
  return r;
}
