import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseModel, savedConfiguration } from "../src/model-config";

test("a model map enables only explicitly configured safe IDs", () => {
  const dir = mkdtempSync(join(tmpdir(), "forge-models-"));
  const previous = process.env.FORGE_MODELS_TOML;
  try {
    process.env.FORGE_MODELS_TOML = join(dir, "models.toml");
    writeFileSync(process.env.FORGE_MODELS_TOML, '[tiers.deep]\nmodel = "custom-model.4"\n[tiers.invalid]\nmodel = "bad id"');
    expect(parseModel("custom-model.4")).toBe("custom-model.4");
    for (const invalid of ["custom-model.5", "bad id"]) expect(() => parseModel(invalid)).toThrow("Invalid model");
    writeFileSync(process.env.FORGE_MODELS_TOML, "");
    expect(savedConfiguration({ model: "custom-model.4", configuredModel: "custom-model.4", effort: "medium" }).model).toBe("custom-model.4");
  } finally {
    if (previous === undefined) delete process.env.FORGE_MODELS_TOML;
    else process.env.FORGE_MODELS_TOML = previous;
    rmSync(dir, { recursive: true });
  }
});
