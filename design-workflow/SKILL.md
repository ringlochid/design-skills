---
name: design-workflow
description: Own a complete design-repo run from source truth through generation, review, responsive repair, and handoff. Use when the user asks for an end-to-end product/page design workflow rather than a single focused design task.
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

## Promotion rules

- No generation without product brief, page spec, design system, and prompt locks.
- No repair without generated target shell and `responsive-plan.md`.
- No handoff without review verdict.
- Generated artifacts never become source truth unless a source-authoring skill explicitly merges them.
- Parent agent owns final decisions and file promotion.

## Shared rules

Read `../design-repo-common/references/source-truth-rules.md` before promotion decisions. Hard gates: run design repo preflight before generation; run `../design-repo-common/scripts/check_design_repo.mjs --stage=generation` before tool adapter calls; run `--stage=repair` before layout repair; run `--stage=handoff` before release. Do not continue past a failed gate.

## Output shape

- Current stage
- Source truth status
- Generated artifact status
- Review verdict
- Next leaf skill/action

## Lane posture

Before generating, inspect current source truth and generated artifacts. Classify the next step as source-missing, source-fix, reference-sync, fresh-generation, edit/remap, layout-repair, review, or handoff. Choose the smallest lane that can make progress. Sync references before blind regeneration when a shared Stitch project exists. Require primary review before non-primary remap. Enter layout repair only after a real target breakpoint shell exists.

## Tool placement

Use web search for external/category context, browser for live/generated HTML evidence, image analysis for screenshots/references, image generation only through `visual-asset-generator`, and subagents only for divergent synthesis or independent critique.
