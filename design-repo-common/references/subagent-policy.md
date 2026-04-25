# Subagent policy

Use subagents only for bounded work that benefits from isolation: independent review, divergent research, or a full E2E pilot in a temp repo.

Rules:

- Parent agent owns routing, promotion, final acceptance, and final user summary.
- Subagents must get an explicit scope, repo/path boundary, budget, and expected return format.
- No commit, push, install into the skill bundle, config change, active-skill modification, or deletion outside the assigned temp/work repo unless explicitly requested.
- For E2E pilots, use a fresh temp repo and report project IDs, screen IDs, candidate paths, promotion status, checker result, and budgets used.
- For reviews, subagents are review-only unless explicitly assigned a patch task.
- Subagents may not treat a passing review as promotion approval; promotion remains a parent/operator decision.
- Keep concurrency low; prefer one subagent unless reviews are intentionally independent.

## Brainstorming default

Default to no subagent for simple or clear design direction. For ambiguous/high-quality direction work, use 1-2 bounded brainstorm subagents. Use 3-4 only when explicitly requested or when the project is broad enough to justify the synthesis cost.
