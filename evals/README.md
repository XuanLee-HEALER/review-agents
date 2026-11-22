# Advisory review pilot

This evaluates useful, supported suggestions, not autonomous release approval. Initial source is [ReviewBench](https://github.com/review-bench/ReviewBench), revision recorded in reviewbench-pilot.json. Its MIT notice is retained in ReviewBench-LICENSE.txt. Target repositories keep their own licenses. Raw labels and cloned repositories remain under .local/ and are never reviewer inputs.

## Frozen subset

Eight PRs spanning Go, TypeScript, JavaScript and Python. Each has immutable base/head and selected upstream reference indices. All selected references were inspected against code and frozen before baseline output. The SDK abstraction example is intentionally disputed; do not reward speculative abstractions merely because an upstream label is TP. Deduplicate shared causes (including repeated fixtures across changed test files).

Start with the 13 role/case combinations listed in the manifest rather than requiring every role to find every issue. Those mappings are evaluator-only. Add four repaired variants after verifying specific reference issues; these test whether the same recommendation disappears after its cause is removed. They are targeted regression controls, not globally bug-free repositories. Upstream silence is never a clean-code label.

## Protocol

1. Freeze selected source revision, repository SHAs, eligible reference groups and explicit exclusions. Verify each expected issue without PR requirements; exclude facts that require business intent or external agent rules. Record evidence paths/lines and why each role should care. Complete this before seeing scored agent output.
2. Materialize each repository in an isolated workspace at head. Give the reviewer only repo/base/head and its own role prompt. Keep PR titles/bodies, selection rationale, labels, scores, and other roles' output outside cwd. Snapshot/workspace sets suffice initially; no web/database avoids variable external evidence and benchmark-answer retrieval.
3. Run the mapped combinations with identical fixed model/effort/round limits and independent persisted tasks. Record actual model, prompt hash, tool sets, completed state, duration and token usage. Do not tune prompts during baseline collection.
4. Match root causes semantically, not wording. Manually inspect every candidate suggestion in this small pilot. Label supported/actionable, supported but optional, unsupported/incorrect, or unresolved. Unmatched novel findings are eligible successes after code verification; unresolved findings are reported separately instead of forced into true/false.
5. Measure eligible-reference recall per role; verified suggestion validity; actionable utility; duplicate burden; targeted issue recurrence on repaired variants; incomplete rates and resource cost. Report counts and denominators, not a universal pass/fail or a leaderboard comparison. Optional style advice can be valid but should not inflate substantial-issue recall.
6. Use five cases for prompt development and keep three cases untouched for a first holdout, chosen before baseline tuning. Repeat selected cases to inspect variability. Eight cases are a diagnostic pilot, not statistical proof of general performance.

## Other sources inspected

- [Martian Code Review Bench](https://huggingface.co/datasets/code-review-bench/code-review-bench): offline set has 50 PRs / 136 curated issues; CC BY 4.0. Good second-source check, but its narrower repository coverage is less useful as our only initial dataset.
- [SWE-PRBench](https://github.com/tminhtri1910/swe-prbench-data): 350 PRs with actual human review comments and context configurations; dataset card says CC BY 4.0. Useful for contextual review and human feedback diversity. Historical comments are incomplete and can depend on project intent, so not all are appropriate code-only expectations.
- [CodeXGLUE code refinement](https://github.com/microsoft/CodeXGLUE/tree/main/Code-Code/code-refinement): targets code repair/refinement rather than directly evaluating advisory suggestions. Not selected for this first pilot.

ReviewBench has reference findings from both generated reviews and human reviews; its labels are not treated as infallible. Its fixed commit mirrors, category/context labels and documentation/performance examples make it the most convenient initial source. The pilot has now executed: 13 baseline reviews, four repaired controls and two repeats. See [results and limitations](pilot-results.md), [per-finding adjudication](pilot-adjudication.json), and [recomputed metrics](pilot-metrics.json).

## Reproduction

Run from the project root (model runs use the CLI's configured provider and incur usage):

```sh
python3 scripts/prepare-pilot.py
bun scripts/run-pilot.ts baseline
python3 scripts/prepare-pilot-controls.py
bun scripts/check-pilot-controls.ts
bun scripts/run-pilot.ts controls
bun scripts/run-pilot.ts repeat
python3 scripts/check-pilot-packaging.py
python3 scripts/score-pilot.py
```

The control preparer refuses to overwrite existing clones. The runner resumes existing task state; use a separately named result directory for a genuinely fresh independent experiment. Frozen runtime hashes must match. A fresh reproduction of a pilot pinned to gpt-6.1-sol requires its original runtime. To evaluate 6.2, create a new candidate manifest and output directory. Do not replace the archived v1 adjudication with judgments from a new run. Scoring can run from the portable report archive without `.local`; when original reports exist, their hashes are verified as well.

All eight mirrors were checked out at frozen head commits and verified clean after execution. Focused mock-network checks verify duplicate request removal and added logging. The packaging probe runs no target lifecycle scripts. Full upstream test suites were not run. Runtime/project regression tests are separate from model effectiveness metrics.

## Accepted optimization and workbench adoption

[pilot-v4 results](pilot-v4-results.md) records the accepted known-set regression, preceding failed candidates and rollout. The final 21-run evidence set reuses 15 unchanged-role v3 runs and six fresh v4 comments runs, with stored role prompt hashes verified. Explicit web tooling was added for dependency contracts; benchmark-answer retrieval was prohibited. v1 remains the original baseline. Use the environment selectors in run-pilot.ts and a fresh PILOT_OUTPUT for new candidates; never overwrite archived adjudication.

## GPT-6.2 Sol performance and simplification replay

[The 2026-11-18 replay](advisory-replay-20261118.json) compares the original and revised prompts on one runtime. It records the fixed commits, actual model, prompt and runtime hashes, judgments, tool errors and costs. The final performance prompt retained the hard-quota blocker and downgraded the optional catalog request overhead to a suggestion. The final simplify prompt recovered the local conversion missed by the old prompt and supported retaining independent unit, file persistence and HTTP assertions. The repaired controls did not repeat the target findings. The chosen prompts consumed more tokens overall than their paired baselines on this sample.

To rebuild the synthetic snapshots, run `bash evals/fixtures/advisory-replay-20261118.sh NEW_OUTPUT_DIRECTORY`. The generated `fixture-refs.env` records their commit IDs. The catalog and wallet ranges also appear in the frozen pilot manifest and repaired controls. For each replay, check out the fixed head in a private copy with a neutral directory name and run the role from there. Use a fresh task directory with a neutral name outside the input. Pass `--model gpt-6.2-sol --effort high --max-turns 30 --compact-threshold 120000 --tool-sets snapshot,workspace,web` alongside the fixed base and head. To rerun a previous prompt, use a private copy of the review-agents checkout and replace only that role's prompt with its recorded [evaluation copy](fixtures/advisory-replay-20261118-prompts/). Rebuild launchers before running them.

## Quality and Comments on GPT-6.2 Sol

The [baseline adjudication](quality-comments-20261118/README.md) established separate criteria for factual accuracy, ownership of the correction and severity. The [closeout replay](quality-comments-close-20261118/README.md) records the fixed inputs, independent holdouts, observed controls and final decisions.
