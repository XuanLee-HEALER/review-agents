import { test, expect } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadApiKey } from "../src/config";
test("malformed credential config never echoes secret content", async () => {
  const dir = await mkdtemp(join(tmpdir(), "review-config-"));
  const path = join(dir, "config.toml");
  try {
    await writeFile(path, '[openai]\napi_key = "FAKE_TEST_SECRET');
    try {
      await loadApiKey(path);
      throw Error("expected parse failure");
    } catch (e) {
      expect(String(e)).not.toContain("FAKE_TEST_SECRET");
      expect(String(e)).toContain("Cannot read or parse");
    }
    await writeFile(path, "[openai]\napi_key = 123");
    await expect(loadApiKey(path)).rejects.toThrow("nonempty");
    await writeFile(path, '[openai]\napi_key = " fake-key "');
    expect(await loadApiKey(path)).toBe("fake-key");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
