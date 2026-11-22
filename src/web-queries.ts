import { documentationUrl, fetchDocument } from "./context-tools";

const maxHostStreak = 3;
const maxUnsuccessful = 8;
type Document = Awaited<ReturnType<typeof fetchDocument>>;

type WebQueryState = {
  attempts: number;
  skipped: number;
  invalid: number;
  unsuccessful?: number;
  failedUrls: string[];
  documents?: [string, Document | null][];
  successfulUrls?: string[];
  hostStreaks?: [string, number][];
};

export class WebQueries {
  private attempts: number;
  private skipped: number;
  private invalid: number;
  private unsuccessful: number;
  private failedUrls: Set<string>;
  private documents: Map<string, Document | null>;
  private hostStreaks: Map<string, number>;

  constructor(saved?: WebQueryState) {
    this.attempts = saved?.attempts ?? 0;
    this.skipped = saved?.skipped ?? 0;
    this.invalid = saved?.invalid ?? 0;
    this.failedUrls = new Set(saved?.failedUrls);
    this.documents = new Map(
      saved?.documents ?? saved?.successfulUrls?.map((url) => [url, null]),
    );
    this.hostStreaks = new Map(saved?.hostStreaks);
    this.unsuccessful = saved?.unsuccessful ??
      this.failedUrls.size + this.skipped + this.invalid;
  }

  get paused() {
    return this.unsuccessful >= maxUnsuccessful;
  }

  get pausedHosts() {
    return [...this.hostStreaks].filter(([, streak]) => streak >= maxHostStreak)
      .map(([host]) => host);
  }

  summary() {
    return {
      attempts: this.attempts,
      failures: this.failedUrls.size,
      skipped: this.skipped,
      invalid: this.invalid,
      unsuccessful: this.unsuccessful,
      pausedHosts: this.pausedHosts,
      paused: this.paused,
    };
  }

  checkpoint() {
    return {
      ...this.summary(),
      failedUrls: [...this.failedUrls],
      documents: [...this.documents],
      hostStreaks: [...this.hostStreaks],
    };
  }

  private recordUnsuccessful(host?: string) {
    this.unsuccessful++;
    if (host) {
      const streak = this.hostStreaks.get(host) ?? 0;
      this.hostStreaks.set(host, Math.min(streak + 1, maxHostStreak));
    }
  }

  skipWithoutProgress() {
    this.skipped++;
    if (!this.paused) this.recordUnsuccessful();
  }

  async fetch(rawUrl: unknown) {
    if (this.paused) {
      this.skipped++;
      return { error: "Web lookups are paused after eight calls without new evidence. Use local evidence and state any unresolved check in limitations." };
    }
    let url: URL;
    try {
      url = documentationUrl(rawUrl);
    } catch (e) {
      this.invalid++;
      this.recordUnsuccessful();
      throw e;
    }
    const key = url.href;
    const host = url.hostname;
    const cached = this.documents.get(key);
    if (cached !== undefined) {
      this.skipped++;
      this.recordUnsuccessful(host);
      const note = "This documentation URL already succeeded and no network request was made. Use the cached evidence, local sources, or an independent reference for the unresolved fact.";
      return cached ? { ...cached, cached: true, note } : { error: note };
    }
    const hostPaused = (this.hostStreaks.get(host) ?? 0) >= maxHostStreak;
    if (hostPaused || this.failedUrls.has(key)) {
      this.skipped++;
      this.recordUnsuccessful(host);
      const reason = hostPaused
        ? "New lookups for this host are paused after three consecutive calls without new evidence."
        : "This documentation URL already failed and will not be retried.";
      return { error: `${reason} Use local evidence, change to an independent source, or record the unresolved fact in limitations.` };
    }
    this.attempts++;
    try {
      const result = await fetchDocument(url);
      if (!result.text.trim()) throw Error("Documentation returned no text");
      this.documents.set(key, result);
      this.hostStreaks.delete(host);
      return result;
    } catch (e) {
      this.failedUrls.add(key);
      this.recordUnsuccessful(host);
      throw e;
    }
  }
}
