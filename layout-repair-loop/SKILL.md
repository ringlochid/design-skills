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
6. Optionally run one second candidate repair if the first review shows fixable layout-only debt.
7. Promote only if review passes.

## Outcomes

- `clean`
- `remap-required`
- `manual-polish-recommended`
- `contract-fix-first`

## Stop boundary

Do not change product semantics, copy, information architecture, or page contract. Do not run repair before a valid target shell and `02-pages/<page>/responsive-plan.md` exist. If the contract is wrong, stop with `contract-fix-first`; if the breakpoint needs structural change, stop with `remap-required`. Patch candidates first; promote only after review passes.

## Simple repair sequence

Do not use an owning loop script. The agent owns the loop:

1. `stitch_layout_diagnose.mjs`
2. if `safeToAutoFix`, `stitch_layout_fix.mjs` in candidate mode
3. `stitch_local_review.mjs` or diagnose the candidate
4. repeat once only if the remaining issue is clearly layout-only
5. manually promote the candidate only after review passes

## Output shape

- Target artifact
- Diagnostics
- Repair attempts
- Outcome
- Promotion decision

## Scripts

- `scripts/stitch_layout_diagnose.mjs`
- `scripts/stitch_layout_fix.mjs`
- `scripts/stitch_local_review.mjs`

## Shared rules

When promoting, generating, reviewing, repairing, or handing off artifacts, use `../design-repo-common/references/source-truth-rules.md`; use `../design-repo-common/references/tool-policy.md` for web/browser/image-generation placement.
