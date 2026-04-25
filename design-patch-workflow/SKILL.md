---
name: design-patch-workflow
description: Patch or refactor an existing generated design-repo artifact. Use for screenshot feedback, missing/redundant items, copy/content/theme/style changes, responsive remaps, local layout fixes, or Stitch edits without starting a fresh design.
---

# Design Patch Workflow

Goal: coordinate a targeted refinement without losing lineage or silently overwriting accepted artifacts.

Use this for existing generated artifacts. Start by classifying the request with `fix-lanes.md`. If no artifact exists, route to `design-workflow` instead.

## Responsibilities

- confirm source truth, artifact, and lineage exist
- choose the smallest patch path from the triage lane
- delegate targeted source-truth edits to `design-source-patcher`
- delegate generation packs to `generation-pack-builder`
- delegate Stitch operations to `stitch-adapter`
- delegate layout-only repairs to `layout-repair-loop`
- delegate acceptance decisions to `design-review-gate`
- update handoff through `design-handoff-release` after acceptance

## Flow

1. Classify the request with `fix-lanes.md` using user feedback, screenshots, current source truth, artifacts, and latest review.
2. If the issue is semantic, content, theme, or responsive contract, use `design-source-patcher` before changing artifacts.
3. Create a candidate artifact or Stitch edit/remap candidate.
4. Send candidate evidence to `design-review-gate`.
5. Promote only if review passes; otherwise preserve the candidate and stop with a clear state.
6. Update handoff only after accepted artifacts are promoted.

## Mutation model

Candidate-first. The accepted artifact is not silently replaced.

Promotion requires review evidence, passing hard locks, screenshot triplet, and a short note explaining what changed. Use the shared promotion step so candidate files become accepted root artifacts atomically and `runtime/state.json` records `approved[breakpoint]`.

## Escalation

Prefer source fixes and local artifact patches first.

Escalate to Stitch only when the visual structure needs regeneration/remap, the artifact has drifted too far from the intended visual family, or a reference-driven edit is more reliable than local patching.

Stay in the same Stitch project unless the user explicitly asks for a branch/reset.

## Stop states

- `patched` — candidate reviewed and promoted
- `candidate-ready` — candidate exists but needs human review or approval
- `source-fix-needed` — artifact should not be patched until source truth changes
- `remap-needed` — local repair would hide a structural breakpoint problem
- `stitch-edit-needed` — local changes are insufficient
- `blocked-missing-artifact` — no existing artifact to patch
- `budget-exhausted` — bounded attempts used without acceptable result

## Report

- fix lane
- source files changed
- candidate/accepted artifact paths
- review result from `design-review-gate`
- stop state
- remaining caveats

Use `../design-repo-common/references/fix-lanes.md`, `../design-repo-common/references/lifecycle.md`, `../design-repo-common/references/source-truth-rules.md`, `../design-repo-common/references/artifact-hygiene.md`, and `../design-repo-common/references/review-cycle.md`.
