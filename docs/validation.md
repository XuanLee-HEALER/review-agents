# Model selection and credit-error validation — 2026-11-11

`bun run check`, `bun test` (25 passed, 935 assertions), and the four-entrypoint `bun run build` passed. An independent reviewer reran check/test with the same result; the caller rebuilt and checked launcher help. Four skills passed their frontmatter validator.

New coverage verifies the three exact model IDs with medium/high, defaults, invalid flags, persisted selection, legacy effort, resume conflicts and replay. A 16-case simulated provider matrix exercises the real OpenAI SDK and CLI for balance exhaustion, spend/usage limits, legacy quota, rate limits, unknown/type-only/message-only errors and authentication. Tests verify report/state/status/list classification, create and compact failures, secret filtering, and clearing errors before resumed requests and after success. Only HTTP 429 plus exact provider code `credit_balance_exhausted` emits the fallback-triggering code.

Workbench rules and separate historical execution-agent definitions were independently reviewed. No real billing failure was induced and no modifying fallback agent was run against a business repository. These tests validate routing contracts, not model review effectiveness; historical live evaluation artifacts remain unchanged.

---

# Historical internal acceptance — independent advisory agents (2026-11-11)

The evidence in this document records prior snapshots and configurations. Existing live effectiveness evidence used Sol/high; parameter-selection and persistence checks do not establish equivalent effectiveness for Astra, Terra or medium. See the current README for supported choices and defaults.

Checks at that acceptance: TypeScript (including scripts), all 12 tests and the four-entrypoint build pass on macOS with Bun 1.4.4. Nine integration scenarios use real CLI subprocesses/Git fixtures/OS workspace commands and a simulated Responses endpoint or usql executable. Three existing focused unit tests remain. Assertion counts vary with concurrent-lock winners; test count is stable. All four skill frontmatter validators passed. No lockfile format regeneration or workbench installation was performed.

Coverage: provider error/resume, retained tool results and coverage, all roles, budget extension, completed-report replay, process SIGKILL recovery, simultaneous claims, stale claim removal, compaction persistence/accounting, relative output replay across cwd changes, explicit incomplete early stop, instruction-file exclusion, workspace symlink/write boundaries, usql transaction arguments/error sanitization.

Live HTTPS documentation GET succeeded via fetch_document against the official OpenAI compaction Markdown page (14891 characters, no truncation). Real database validation subsequently passed against a disposable PostgreSQL 18.6 instance using usql 0.21.4. It used a private Unix socket, no TCP listener, a dedicated SELECT-only login and synthetic data; no existing or production database was accessed.

`bun run test:database` reproduces nine checks: read-write control transaction with rollback; SELECT results; actual transaction_read_only=on; EXPLAIN output; multi-statement rejection; server rejection of a SECURITY DEFINER function that attempts an INSERT; server-side statement timeout; unchanged fixture data; no lingering reader sessions. The control function succeeds in a normal transaction, proving the wrapper's refusal is due to read-only execution rather than missing function permissions. Slow-query cancellation is checked against the server log, not inferred solely from a subprocess exit. The temporary cluster was stopped and removed after completion. Result: `.local/validation/database.json`. TypeScript check passed after adding the script.

Prerequisites: initdb, pg_ctl, postgres, psql and usql on PATH, a non-root user and writable /tmp. The script starts its own cluster, requires no credentials and does not use REVIEW_DATABASE_URL to select a pre-existing database. It restores that environment variable on exit. Installed usql interprets socket DSNs differently from libpq; the fixture uses a socket-path DSN and a database matching the reader login. The production wrapper required no code change.

## Live self-review sample

First sample: `.local/validation/self-1794372976195/` (four independent roles, actual gpt-6.1-sol/high). Snapshot range: `22b52c195efc030185ea5feb13ed171481977b38` → `88c77ad3b2d4220d5e48f57eb572069a6bbd50eb`. All 36 included diff files covered; environment instruction files explicitly excluded. These are evaluations of a snapshot, not claims that the current worktree was subsequently reviewed unchanged.

| Role | Result | Verified disposition |
|---|---|---|
| quality | findings, 2 blocking / 1 suggestion | Fixed stale-lock recovery race and relative output destination; accepted early incomplete termination to avoid wasting remaining calls. |
| performance | pass, 2 suggestions | Simplified turn counting; bounded read/search pagination cache deferred as optional without measured benefit. |
| simplify | pass, 1 suggestion | Replaced increment/save/decrement for-loop pattern with completed-round while-loop accounting. |
| comments | findings, 1 blocking / 3 suggestions | Updated obsolete design, removed absolute secret guarantee, clarified database URL and partial error-report contract. |

Focused follow-up: `.local/validation/self-1794373259977/`, quality/comments on the correction delta. Comments passed with an optional clarification about partial round-limit output, now included. Quality identified stale unique claim files surviving recovery and becoming misleading after PID reuse; fixed by reclaiming confirmed-dead uniquely named claims, with stale-file cleanup and concurrent recovery regression checks. The final cleanup correction was validated by integration tests and direct inspection, not a third model review.

No reviewed source was edited by the four agents. The owner verified and applied recommendations. No external simplify/comment-refine entrypoints were replaced. Existing workbench symlinks to the two original project skills naturally expose updated project-owned text; symlink targets and external workflow files were not modified. New skills remain project-local.

## Reference comparison

PR-Agent, Google eng-practices and Superpowers were shallow-cloned under `.local/references/` and compared with Anthropic toolkit prompts. Exact revisions, inspected paths, licenses, adopted concepts and rejected behaviors are recorded in `prompts/SOURCES.md`. Repository popularity is not treated as benchmark evidence. New prompts are independently written. No upstream orchestration or mutable tools were copied.

## Historical validation of the original two-role implementation

The following is historical evidence, not current coverage or current behavior.

# Validation — 2026-11-11

Environment: Mac mini, Bun 1.3.14, openai 7.51.0, TypeScript 6.0.3. Both reviewers used actual gpt-6.1-sol responses with high effort. Credentials were loaded from the local credential configuration; no key was copied into this project.

## Automated checks

- TypeScript check passed on Windows and Mac.
- Three isolated tests, 13 assertions passed: fixed Git object reads ignore dirty worktree content; diff pagination coverage; invalid paths and offsets; search and path discovery; unread diff cannot pass; blocking findings determine completion status; malformed credential TOML never echoes the credential line.
- Both Skills passed the skill-creator quick validator.
- Mac frozen-lockfile installation passed. Lockfile generated using Mac Bun because Windows Bun 1.4 uses a newer lockfile version.

## Real unmerged worktrees (read-only)

| Reviewer | Branch | Base | Head | Result | Rounds | Compactions |
|---|---|---|---|---|---:|---:|
| quality | sample-web: feat/filter-update | `<redacted-base>` | `<redacted-head>` | pass, no findings; 18 diff files covered | 12 | 2 |
| performance | sample-api: feat/duration-mode | `<redacted-base>` | `<redacted-head>` | pass, no findings; 45 diff files covered | 14 | 2 |

These are agent evaluation runs, not business approval, test execution, performance benchmarks or complete two-reviewer gates for those branches. No changes were made to either worktree; their final status remained clean and HEADs unchanged. Static review cannot prove absence of defects.

## Bounded execution and known-defect evaluation

- One-round quality run over the broadcast diff returned incomplete with all unread files listed, not pass.
- An isolated Git fixture removed finally/closeSync from a per-file function. Both independently reported the introduced descriptor leak with an actionable source location. Quality: 5 rounds/3 compactions. Performance: 4 rounds/2 compactions.
- Restoring resource cleanup and using a correctly bounded Buffer.allocUnsafe retained behavior. Both independently returned pass in 3 rounds with no tool errors.
- Based on fixture evidence, extended the existing search tool to list tracked paths with an empty query, avoiding speculative reads of nonexistent configuration files. Added regression coverage.
- Additional hardening: visible coverage/tool-error metadata, final source-line bounds validation, credential parser error sanitization, encrypted reasoning continuity, binary content cannot count as fully reviewed, executable permissions restored by setup after archive transfer.

Raw JSON reports are in .local/validation/ (runtime evidence, intentionally outside source distribution). Existing workflow files were backed up under .local/workflow-backup/ before edits. No production or fat environment was accessed, and no business branch was modified or pushed.

## Workflow integration

Updated root CLAUDE.md; wrapup, feature, ship and release Skills; simplifier and comment-refiner role descriptions. Installed project-owned Skills via .claude/skills symlinks. The sequence is business review and issue closure, then both new CLIs in parallel on the same fixed range, then simplify, then backend comment refinement. Reports are incorporated into existing task records; automatic workbench session records are untouched.
