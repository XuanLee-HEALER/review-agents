import assert from "node:assert/strict";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const org = { id: "org/model", tags: ["org-tag"] };
const external = { id: "outside/model", tags: ["outside-tag"] };

for (const [variant, repo, revision, expectedCalls, expectedIds] of [
  ["base", ".local/eval-repos/Imageomics_catalog", "5f10688a0afd8b2891d6cec32f0c3bfca9a7aaed", 0, [org.id]],
  ["original", ".local/eval-repos/Imageomics_catalog", "a8a7cdc7b0cbac54485dbcf53cf6ae6ddbecfe92", 2, []],
  ["performance repair", ".local/eval-controls/catalog-performance", "381bdda6bc8e1c406050876c5609dcf8e48aff9e", 1, [org.id, external.id]],
  ["diagnostic repair", ".local/eval-controls/catalog-quality", "ac7e37f323ff31c591a8d9da597bfeac1a2b0580", 2, []],
]) {
  const source = Bun.spawnSync(["git", "-C", repo, "show", `${revision}:main.js`]);
  assert.equal(source.exitCode, 0, source.stderr.toString());
  const text = source.stdout.toString();
  const start = text.indexOf("const fetchHubItems =");
  const end = text.indexOf("\n};", start) + 3;
  assert(start >= 0 && end > start);
  const run = new AsyncFunction(
    "fetch", "document", "fetchedData", "allItems", "API_BASE_URL", "ORGANIZATION_NAME",
    "ADDITIONAL_HF_REPOS", "REFRESH_INTERVAL_DAYS", "normalizeTag", "tagsMap", "handleError",
    `${text.slice(start, end)}\nreturn await fetchHubItems("models");`,
  );
  let externalCalls = 0;
  const errors = [];
  const fetch = async (url) => {
    if (url.endsWith(external.id)) {
      externalCalls++;
      if (externalCalls === 2) throw new Error("second detail request failed");
      return { ok: true, json: async () => external };
    }
    if (url.includes("?author=")) return { ok: true, json: async () => [org] };
    assert(url.endsWith(org.id), url);
    return { ok: true, json: async () => org };
  };
  const results = await run(fetch, { querySelectorAll: () => [] }, {}, {}, "https://fixture.invalid/", "org",
    [{ repo: external.id, type: "models" }], 30, (tag) => [tag], { models: new Set() },
    (error) => errors.push(error.message));
  const resultingIds = results.map(({ id }) => id);
  assert.deepEqual(resultingIds, expectedIds, variant);
  assert.equal(externalCalls, expectedCalls, variant);
  assert.deepEqual(errors, expectedCalls === 2 ? ["second detail request failed"] : [], variant);
  console.log(JSON.stringify({ variant, externalCalls, resultingIds, errors }));
}
