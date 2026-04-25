---
name: design-workflow
description: Create a new full product/page/screen/flow design from scratch in a design repo. Use for end-to-end design runs from source truth through generation, review, responsive fixes, and handoff.
---

# Design Workflow

Goal: be the conductor for one full design run while leaf skills keep their narrow jobs.

## Required order

1. Initialize/inspect the design repo with `design-repo-init`.
2. Ingest source material with `product-source-reader`, `backend-capability-reader`, or `reference-research` as needed.
3. Write source truth: product brief, page spec, design system.
4. Build generation pack and locks.
5. Run tool adapter only after explicit approval for external mutations.
6. Review generated artifacts.
7. Write responsive plan before target breakpoint remap/repair.
8. Run layout repair only on a valid target shell.
9. Review again, then hand off.

## Review / fix cycle

Use `../design-repo-common/references/review-cycle.md`, `../design-repo-common/references/fix-lanes.md`, and `../design-repo-common/references/lifecycle.md`. The conductor owns the loop budget, failure classification, retry decisions, and final stop state. Mid-run fixes use the same lanes as post-handoff patching; do not invent a separate repair path.

## Promotion rules

- No generation without product brief, page spec, design system, and prompt locks.
- No repair without generated target shell and `responsive-plan.md`.
- No handoff without review verdict.
- Generated artifacts never become source truth unless a source-authoring skill explicitly merges them.
- Parent agent owns final decisions and file promotion. Candidate artifacts become accepted root artifacts only after review and promotion update runtime approved state.

## Shared rules

Read `../design-repo-common/references/source-truth-rules.md` before promotion decisions. Hard gates: preflight must pass before generation; generation, repair, and handoff structure checks must pass at their stage boundaries; do not continue past a failed gate.

## Artifact hygiene

Use `../design-repo-common/references/artifact-hygiene.md`. In short: human-readable HTML/MD/screenshots stay in the page root; JSON/state/logs/diagnostics/backups stay under `runtime/`.

## Output shape

- Current stage
- Source truth status
- Generated artifact status
- Review verdict
- Next leaf skill/action

## Lane posture

Before generating or fixing, inspect current source truth and generated artifacts. Classify the next step with `fix-lanes.md` plus `source-missing`, `reference-sync`, or `handoff`. Choose the smallest lane that can make progress. Sync references before blind regeneration when a shared Stitch project exists. Require primary review before non-primary remap. Enter layout repair only after a real target breakpoint shell exists.

## Tool placement

Use web search for external/category context, browser for live/generated HTML evidence, image analysis for screenshots/references, image generation only through `visual-asset-generator`, and subagents only for divergent synthesis or independent critique.
