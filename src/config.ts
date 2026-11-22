export async function loadApiKey(path: string): Promise<string> {
  // TOML parser errors can quote the offending line, including credentials.
  let config: unknown;
  try {
    config = Bun.TOML.parse(await Bun.file(path).text());
  } catch {
    throw new Error(
      "Cannot read or parse credential TOML; check the configured path and syntax",
    );
  }
  const key = (config as { openai?: { api_key?: unknown } })?.openai?.api_key;
  if (typeof key !== "string" || !key.trim())
    throw new Error(
      "Missing nonempty openai.api_key in credential configuration",
    );
  return key.trim();
}
