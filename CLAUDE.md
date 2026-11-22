# Review agents project

This is an independent Bun/TypeScript project. The project remains independent; the user authorized workbench adoption after the pilot regression gate passes. No service deployment is required. All four runtime agents are advisory and never edit reviewed code.

- Read README.md and docs/development-plan.md for current behavior. Workbench entrypoints may be updated within the explicitly authorized migration; preserve advisory review and caller verification.
- Keep task persistence/resume and failure states explicit. Never report incomplete review as approval. Caller owns decisions about changed surrounding context on resume.
- Runtime agents must not load target-environment CLAUDE.md, AGENTS.md or SKILL.md. Their roles come from project-owned prompts only.
- Tools are static sets. Snapshot evidence is immutable; workspace/network/database evidence is contextual and may change. Keep read-only boundaries and report limitations.
- No credentials in source, task configuration, logs or fixtures. Integration tests use temporary repositories and a local simulated provider; external API/database checks are separate.
- Validate with bun run check, bun test and bun run build. Launchers require rebuilt dist. Preserve bun.lock compatibility; do not regenerate unnecessarily.
- Keep prompts/SOURCES.md accurate, including upstream revisions and deliberate departures. All four skills are advisory; self-review is the first live sample.
