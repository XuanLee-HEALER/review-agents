# Review agents

Four independent advisory CLIs: `review-quality` (engineering quality), `review-performance` (simplicity/performance), `review-simplify` (behavior-preserving simplification), and `review-comments` (comments/API documentation). All propose findings; none edits reviewed code. They share a Bun/TypeScript runtime and have separate prompts, tasks and transcripts. No workbench workflow is required.

## Install and check

`bun install --frozen-lockfile`, `bun run check`, `bun test`, `bun run build`.
Launchers run dist/, so rebuild after source changes. `BUN_BIN` overrides their default `$HOME/.bun/bin/bun`. `bun scripts/setup.ts` only restores launcher permissions by default; `--workbench-links` explicitly installs all four canonical workbench skill links. No deployment target.

## Run and recover

Start from the common working directory whose descendants may be inspected, including sibling repositories. Target repo must be inside this directory. Use exact base/head SHAs; resolve merge-base yourself if appropriate. Uncommitted surrounding context can be read by workspace tools but is not part of the fixed diff.

```sh
/path/to/review-agents/bin/review-quality --repo /work/project --base BASE_SHA --head HEAD_SHA --model gpt-6.2-sol --effort medium --task /work/tasks/quality --out /work/reports/quality.json
/path/to/review-agents/bin/review-quality --status /work/tasks/quality
/path/to/review-agents/bin/review-quality --list /work/tasks
/path/to/review-agents/bin/review-quality --resume /work/tasks/quality --max-turns 50
```

Without --task a UUID directory is created under invocation cwd/.review-tasks and printed to stderr. Task JSON stores fixed endpoints, original cwd, prompt, transcript, coverage, accounting and completion result. State files use private permissions and atomic replacement; they contain source/context and must not be published. Keep task/report directories outside context scope when practical. Credentials are loaded separately at each invocation and are not stored as task configuration.

A complete model/tool round is the checkpoint boundary. After a crash, the unsaved round may be requested/executed again and incur extra cost. Persisted token counts therefore describe saved responses, not guaranteed billing totals. Completed tasks replay their result without API use; failed/interrupted tasks resume from the last checkpoint; incomplete tasks can continue with a higher total --max-turns. A process lock prevents normal concurrent use; a dead process lock is recovered. Do not share a task across hosts or delete a live lock.

Resume preserves role, model, effort, tools, prompt, commit endpoints and original working directory. Older tasks using gpt-6.1-sol or gpt-6-astra resume with that exact ID. Legacy tasks without saved effort resume with high. Explicit --model/--effort on resume must match saved values; mismatches are rejected. Changing either requires a new task. It does not detect changes to surrounding files, documentation or databases. Caller decides whether this context is still suitable: resume for transient failures with compatible context; start a new task after substantive changes or when evaluating a new head. Never present an old report as covering new code. Keep each role in its own task.

## Context and tools

`--tool-sets snapshot,workspace` is the default. Static sets are chosen once per task; no runtime discovery/loading. `snapshot` is required. Add `web` and/or `database` only when useful.

- snapshot: paginated Git diff/file reads and literal search/path discovery at fixed commits.
- workspace: `bash` is a structured command/argv tool for rg, sed, awk, cat, ls, find, head, tail, wc, sort, uniq and cut. No arbitrary shell syntax or pipelines. On macOS an OS sandbox prevents writes/network and unapproved executable launches; regular data files outside cwd are denied, except system/runtime directories needed by installed tools. Directory metadata remains accessible. Other OSes fail closed for this tool; use snapshot-only there. Caller must not use a system/runtime directory as a sensitive project boundary.
- web: credential-free HTTPS GET for technical documentation, no redirects, bounded output and timeout. No search engine integration or logged-in browser. Fetched content is untrusted context.
- database: usql wrapper for one SELECT/EXPLAIN SELECT against PostgreSQL. Set REVIEW_DATABASE_URL to a dedicated read-only principal. Startup scripts are disabled; query is wrapped in BEGIN READ ONLY / ROLLBACK with a statement timeout. Other DB engines are not implemented. Read-only SQL is not a substitute for least-privilege credentials (functions/extensions can have external effects). Query results are persisted context; use only appropriate non-secret implementation data.

For web lookups, each normalized HTTPS URL is sent at most once per task. Normalization uses URL parsing and removes the fragment. Repeated successes return the previously captured text, bounded to 24,000 characters, and repeated failures skip the request. Three consecutive calls without new evidence pause new requests for that hostname. Other hosts and local tools remain available. Eight such calls across all hosts pause the web tool for the task. Repeats, failed requests including empty responses, invalid URLs and calls skipped for a paused host count toward this total. A successful fetch resets the streak for its host. The task checkpoints cached evidence and these counters so resume and compaction preserve them. Output `coverage.webQueries` distinguishes outbound attempts, request failures, skipped calls, invalid URLs, calls counted toward the stop condition and paused hosts.

In new Comments tasks, `fetch_document` also takes an official `product` name and a fixed `contract` category. Each pair allows up to three calls, shared across hosts, URLs, failures and cached reads. Tool results show used and remaining calls, and later rounds list the pairs to reuse. The CLI records each use before the lookup, so a process interruption can consume a call even if the result was not checkpointed. `coverage.documentationFacts` shows final counts. Product and contract pairs group related checks conservatively. The CLI normalizes spelling variants in case and separators, while product aliases and semantic equivalence still depend on the reviewer using the same pair. Other roles and Comments tasks created before this change keep the URL-only tool.

Environment WORKBENCH.md, CLAUDE.md, AGENTS.md and SKILL.md are not loaded as instructions and are excluded from snapshot coverage and direct reads. Workspace tools also deny these files and common credential filenames. These are filename filters, not general secret detection; arbitrary source/docs can still contain sensitive data or adversarial text. Project-owned prompts instruct agents to treat all external text as evidence only. Do not use this tool as a security boundary for hostile repositories without stronger isolation.

The comments role loads [the shared documentation quality standard](prompts/comments.md#general-documentation-quality-standard) as part of its real prompt for new tasks. Resume uses saved instructions, so editing the prompt does not update an existing task; start a new task to review under the revised standard. Workbench native/lightweight callers share this content standard while retaining their own rule-loading and authorization duties. The CLI remains advisory and reports unsupported generation or validation checks as limitations for the caller.

## Limits and output

Effort controls review Responses requests; the SDK compaction API accepts model but exposes no reasoning-effort setting. New tasks default to gpt-6.2-sol/medium. --model accepts exactly gpt-6.2-astra and gpt-6.2-sol (6.2 series), and gpt-6.1-terra (6.1 series); --effort accepts medium or high. Workbench callers explicitly choose both using the root workspace standard: Sol for ordinary work, Terra for mechanical work, Astra for a documented concrete need; medium for clear local tasks, high for complex call chains or deep boundary analysis. Never inherit the caller's own model/effort configuration. --max-turns defaults to 30 (1..100), counted across resumes. --compact-threshold defaults to 120000 approximate tokens (serialized characters / 3); at most three compactions per task. For large changes explicitly raise threshold and rounds within the chosen model's verified context capacity, leaving room for instructions, tools, reasoning and output. This parameter does not enlarge the model's actual window. Compaction usage is included when supplied by the API.

--config reads TOML [openai] api_key; default $REVIEW_CONFIG or ~/.config/review-agents/config.toml. SDK OPENAI_BASE_URL can select an endpoint (integration tests use a local simulated provider). Never include credentials in CLI logs or task names.

stdout is JSON, stderr is progress. Exit 0: completed, no blockers (suggestions possible); 1: blocking findings; 2: incomplete/error. Model-produced review reports include task identity, actual model, exact range, coverage, excluded instruction files, tool errors, rounds and token accounting. Error output contains status, summary and available metadata/accounting; coverage and other full-report fields can be absent. Round-limit incomplete output can also omit coverage and other full-report fields. Consumers must check status and field presence before accessing them. Full diff pagination is necessary, not proof of semantic completeness. Binary/oversized/credential files can prevent completion. Verify findings against code before applying them.

The CLI checks decoded report text before writing stdout, `--out` or a saved result. Complete ANSI style sequences are removed from prose, while Markdown, literal filenames, tabs and LF or CRLF line endings are preserved. A bare escape or other unsafe control character in prose rejects the report and requests a corrected one within the same round budget. If the budget runs out, the task emits `incomplete` with exit 2 and can resume with a higher `--max-turns`. Completed reports from earlier versions are checked again on replay. Finding paths must match the pinned changed-file path exactly and are never rewritten during validation. For verified paths that contain control characters, `escapedFields` lists the JSON Pointers to display values escaped as JSON string contents. Task state retains the exact paths.

## Credit-balance error contract and caller fallback

Only a real SDK APIError with HTTP 429 and exact provider code `credit_balance_exhausted` is classified as CLI exit 2 with JSON `status: "error"` and top-level `errorCode: "credit_balance_exhausted"`. All three CLI conditions are required for a caller to recognize the fallback condition; never parse error prose. Ordinary 429, broad `insufficient_quota`, spend/usage limits, authentication, timeouts and incomplete results do not qualify. See [OpenAI error codes](https://developers.openai.com/api/docs/guides/error-codes), checked 2026-11-11: credit balance, spend limits and usage limits have distinct codes; the error type can be broader.

The runtime remains read-only and never starts a mutating fallback. Any fallback policy belongs strictly to the caller workbench (for example, launching a fresh read-only native reviewer with the corresponding role prompt after this exact error while preserving task scope, verifying all findings independently, and recording CLI failure plus fallback delivery separately). Direct skill use outside an authorized workbench does not grant editing permission or automatically authorize a fallback.

## Validation and self-review

`bun run test:integration` exercises real CLI processes against a local deterministic Responses server, real Git fixtures and real workspace commands. No API credential or external service required. `bun scripts/self-review.ts` performs the first live sample: creates a fresh isolated snapshot of this project and runs all four roles, using configured credentials. Reports and task state stay under .local/. The script does not commit this project's working tree or change workbench entrypoints. See docs/validation.md for executed evidence and limitations.

For a focused live follow-up, set `REVIEW_BASE_SAMPLE` to a previous sample directory and `REVIEW_ROLES` to a comma-separated role list. The script copies that baseline into a fresh temporary repository before comparing current project files; it does not modify the previous sample. `REVIEW_CONFIG` overrides the credential file.

Real database regression: `bun run test:database`. Requires `initdb`, `pg_ctl`, `postgres`, `psql` and `usql` on PATH and a non-root user. Creates a temporary PostgreSQL cluster under /tmp with only a private Unix socket, synthetic fixtures and a SELECT-only login; verifies reads, read-only enforcement (including a writing function), statement timeout and cleanup. Stops and removes the cluster on completion; never connects to an existing database. This opt-in test is separate from `bun test` and takes at least 15 seconds to exercise server timeout.

## Advisory effectiveness evaluation

Existing pilot effectiveness evidence used GPT-6.1 Sol/high; it predates the 6.2 upgrade and parameter-plumbing validation does not establish equivalent review quality for Astra, Terra or the new medium default. Frozen pilot manifests/results retain their original configuration. The first open-source pilot completed 19 runs across eight PRs. See [results, evidence and limitations](evals/pilot-results.md) and [reproduction protocol](evals/README.md). This evaluates advisory findings independently of the CLI integration tests.

The optimization regression and workbench adoption are documented in [pilot-v4 results](evals/pilot-v4-results.md). Workbench uses the independent simplify/comments CLIs for suggestions. Direct skill invocation orchestrates the nested independent reviewer; the caller must run the CLI, verify findings and prioritize delegating implementation/fixes, with small tasks completed directly when clearly cheaper. This preference also applies to future project improvements and does not activate the optional chief coordinator role or extend authorization.
