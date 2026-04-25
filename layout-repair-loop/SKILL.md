---
name: layout-repair-loop
description: Run a bounded layout diagnosis and repair loop on generated/exported design artifacts. Use when a breakpoint shell exists but has layout defects, responsive issues, or local polish problems that can be fixed without changing product semantics.
---

# Layout Repair Loop

Goal: fix layout defects without inventing semantics or remapping the page.

## Eligibility

Enter only when:

- source truth exists
- responsive plan exists for the target breakpoint
- generated/exported target shell exists
- issue is local layout/polish, not missing page contract

## Workflow

1. Capture/inspect screenshot and DOM/HTML if available.
2. Diagnose issues.
3. Patch candidate, not approved live artifact.
4. Review candidate.
5. If safe, run one candidate repair; review it.
6. Continue only while the issue remains layout-only and the repair budget remains.
7. Stop after at most 3 local repair attempts.
8. Promote only if review passes.

## Outcomes

- `clean`
- `needs-remap`
- `manual-polish-recommended`
- `needs-source`

## Stop boundary

Do not change product semantics, copy, information architecture, or page contract. Do not run repair before a valid target shell and `02-pages/<page>/responsive-plan.md` exist. If the contract is wrong, stop with `needs-source`; if the breakpoint needs structural change, stop with `needs-remap`. Patch candidates first; promote only after review passes.

## Mutation model

Repairs are candidate-first. A repair attempt creates a separate candidate artifact and review evidence. The approved artifact is not replaced until the candidate passes review and the operator explicitly promotes it. No silent in-place mutation.

## Simple repair sequence

The agent owns a short bounded loop:

1. Diagnose the current artifact and classify the issue.
2. If the issue is layout-only and safe to fix, patch a candidate rather than the approved artifact.
3. Review the candidate with the screenshot triplet and lock checks.
4. Repeat only if the remaining issue is clearly layout-only and fewer than 3 local repair attempts have been used.
5. Promote only after review passes.

## Phase-C loop logic

Use `../design-repo-common/references/review-cycle.md`. Layout repair only handles layout-only defects on a real target shell; wrong structure returns `needs-remap`, bad source/locks returns `needs-source`.

## Phase-C-style outcome summary

Every repair attempt should end with one explicit outcome:

- `clean` — screenshots, locks, and layout checks pass.
- `needs-remap` — the breakpoint needs structural redesign, not CSS repair.
- `manual-polish-recommended` — only subjective/low-risk polish remains.
- `needs-source` — source truth, locks, or responsive plan is wrong/missing.

Record the evidence used: Stitch screenshot, local viewport, local full-page, lock checks, and clutter/runtime placement check.

## Output shape

- Target artifact
- Diagnostics
- Repair attempts
- Outcome
- Promotion decision

## Internal helpers

The workflow reports status and evidence: target artifact, candidate attempt, review result, outcome, and promotion decision.

## Artifact hygiene

Use `../design-repo-common/references/artifact-hygiene.md`. In short: human-readable HTML/MD/screenshots stay in the page root; JSON/state/logs/diagnostics/backups stay under `runtime/`.

## Shared rules

When promoting, generating, reviewing, repairing, or handing off artifacts, use `../design-repo-common/references/source-truth-rules.md`; use `../design-repo-common/references/tool-policy.md` for web/browser/image-generation placement.
