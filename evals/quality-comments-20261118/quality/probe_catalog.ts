import assert from "node:assert/strict";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const file = "scripts/export-tags.js";
const org = { id: "org/model", tags: ["org-tag"] };
const external = { id: "outside/model", tags: ["outside-tag"] };

async function probe(repo: string, head: string, failExternalAttempt: number) {
  const source = Bun.spawnSync(["git", "-C", repo, "show", `${head}:${file}`]);
  assert.equal(source.exitCode, 0, source.stderr.toString());
  const text = source.stdout.toString();
  const start = text.indexOf("const collectHFTags =");
  const end = text.indexOf("\n};", start) + 3;
  assert(start >= 0 && end > start);
  const collector = text.slice(start, end);
  const execute = new AsyncFunction(
    "fetch", "get", "ADDITIONAL_HF_REPOS", "ORGANIZATION_NAME", "API_BASE_URL", "console", "allTags",
    `${collector}\nawait collectHFTags("models");`,
  );
  let externalAttempts = 0;
  const warnings: unknown[][] = [];
  const tags = new Set<string>();
  const fetch = async (url: string) => {
    if (url.endsWith(external.id)) {
      externalAttempts++;
      if (externalAttempts === failExternalAttempt) throw Error("fixture detail request failed");
      return { ok: true, json: async () => external };
    }
    assert(url.endsWith(org.id), url);
    return { ok: true, json: async () => org };
  };
  const get = async (url: string) => url.includes("?author=")
    ? { json: [org] }
    : { json: await (await fetch(url)).json() };
  await execute(fetch, get, [{ repo: external.id, type: "models" }], "org", "https://fixture.invalid/",
    { log() {}, warn(...args: unknown[]) { warnings.push(args); } }, tags);
  return { externalAttempts, warnings: warnings.length, tags: [...tags] };
}

const [original, originalHead, perfRepair, perfHead, qualityRepair, qualityHead] = process.argv.slice(2);
const cases = [
  ["original success", original, originalHead, 0, 2, 0, ["org-tag", "outside-tag"]],
  ["performance repair success", perfRepair, perfHead, 0, 1, 0, ["org-tag", "outside-tag"]],
  ["original first detail failure", original, originalHead, 1, 1, 0, ["org-tag"]],
  ["performance repair first detail failure", perfRepair, perfHead, 1, 1, 0, ["org-tag"]],
  ["quality repair first detail failure", qualityRepair, qualityHead, 1, 1, 1, ["org-tag"]],
  ["original second detail failure", original, originalHead, 2, 2, 0, ["org-tag"]],
  ["performance repair second detail failure", perfRepair, perfHead, 2, 1, 0, ["org-tag", "outside-tag"]],
] as const;
for (const [name, repo, head, failAttempt, externalAttempts, warnings, tags] of cases) {
  const result = await probe(repo, head, failAttempt);
  assert.deepEqual(result, { externalAttempts, warnings, tags }, name);
  console.log(JSON.stringify({ name, ...result }));
}
