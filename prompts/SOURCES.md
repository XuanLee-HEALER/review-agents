# Prompt provenance

Inspected 2026-11-11; independently rewritten adaptations, no wholesale prompt copies.

- OpenAI Codex review rubric: https://github.com/openai/codex/blob/main/codex-rs/prompts/templates/review/rubric.md — actionable introduced findings, evidence, short locations, allow no findings. Removed general correctness verdict and replaced output schema with bounded review completion states.
- Anthropic PR review toolkit code-reviewer: https://github.com/anthropics/claude-plugins-official/blob/main/plugins/pr-review-toolkit/agents/code-reviewer.md — project conventions and filtering false positives. Removed arbitrary confidence thresholds, broad bug-review remit and unstaged-diff default.
- Anthropic code-simplifier: https://github.com/anthropics/claude-plugins-official/blob/main/plugins/pr-review-toolkit/agents/code-simplifier.md — readable simplicity, preserving behavior and useful abstractions. Converted mutation into review; removed language-specific universal rules and added evidence-based performance criteria.

Upstream repositories use Apache-2.0. Adaptations are materially modified for this workbench. See LICENSE-APACHE-2.0.txt.

## Expanded comparison — 2026-11-11

These are reference designs, not evidence of measured superiority. Source text was inspected; repository copies are local research artifacts, not shipped dependencies. New prompts are independently written and advisory only.

| Source | Revision | Inspected paths | Adopted / rejected |
|---|---|---|---|
| [pr-agent](https://github.com/qodo-ai/pr-agent) | `1fa93c85b64065d8944e6ac612605e4a27212361` | pr_agent/settings/code_suggestions/{pr_code_suggestions_prompts,pr_code_suggestions_reflect_prompts}.toml; pr_add_docs.toml | Adopt contextual verification, concrete suggestions and exact documentation placement. Reject fixed suggestion quotas, blanket rejection of comments, external instructions and diff-only evidence. |
| [eng-practices](https://github.com/google/eng-practices) | `3bb3ec25b3b0199f4940b1aa75f0ac5c5753301c` | review/reviewer/{looking-for,standard}.md | Adopt system context, pragmatic improvements, distinction between comments and API documentation. Reject business approval and automatic external style-guide authority. |
| [superpowers](https://github.com/obra/superpowers) | `22f0b463e7a5e579904dd6211a520321035526f7` | skills/requesting-code-review/code-reviewer.md | Adopt evidence-backed severity and explicit unverified scope. Reject requirements-plan review, production-readiness verdicts and orchestration. |

Additional Anthropic reference: [comment-analyzer](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/pr-review-toolkit/agents/comment-analyzer.md), inspected 2026-11-11. Adopt factual cross-checks and actionable wording; omit inferred business rationale. Existing code-simplifier reference contributes behavior preservation; mutation and CLAUDE.md loading are deliberately removed.

Licenses observed in checked-out repositories: PR-Agent MIT; Superpowers MIT; Google eng-practices CC BY 3.0 (Google attribution, https://creativecommons.org/licenses/by/3.0/). Anthropic toolkit Apache-2.0. These new comparison notes paraphrase concepts and identify changes; no upstream executable implementation is copied.

## Pilot-v2 refinements

Based on pilot-v1 evidence: distinguish third-party assumptions from inspected artifacts; inspect first-use materialization and representation conversions; compare repeated current test contracts across files; trace swallowed failures. These are general review strategies, not repository-specific expected answers. No benchmark labels or repository identifiers are embedded in role prompts. See evals/pilot-results.md and evals/pilot-v2-plan.md.


## Documentation refinement experience — 2026-11-16

The comments prompt's “General documentation quality standard” generalizes local Scalar/OpenAPI refinement experience: verify the serializer-to-use-case contract, transport/schema/example agreement, dynamic object shape, and the generated artifact consumed by callers. It copies no project-specific business answers, response envelope, field semantics or generator commands. Native/lightweight workbench paths reference this section for content quality only; advisory CLI isolation and caller-owned implementation/verification remain separate.

## Performance and simplification calibration — 2026-11-18

The performance role traces reachable execution and necessary work before rating regressions. Blocking findings require evidence of material impact under supported workloads. The simplification role checks local value conversions independently of wider restructuring. It compares affected unit, integration and HTTP acceptance tests by the behavior and dependency boundary each covers. These are locally developed review criteria. Both roles remain independent and advisory.

## Quality and documentation blocking criteria — 2026-11-18

Local adjudication separates introduced behavior, affected callers and independent remedies. The Quality rubric uses observable implementation or test consequences. The Comments rubric checks what happens when a caller follows the affected documentation and identifies the text that needs correction. The baseline evidence is in [the paired replay](../evals/quality-comments-20261118/README.md).
