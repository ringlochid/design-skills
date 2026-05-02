---
name: design-patch-workflow
description: Patch or refactor an existing generated design-repo artifact. Use for screenshot feedback, missing/redundant items, copy/content/theme/style changes, responsive remaps, local layout fixes, or Stitch edits without starting a fresh design.
---

# Design Patch Workflow

Goal: coordinate a targeted refinement without losing lineage or silently overwriting accepted artifacts.

Use this for existing generated artifacts. Start by classifying the request with `fix-lanes.md`. If no artifact exists, route to `design-workflow` instead.

## Orchestrator WBS exposure

For large patch/refinement work, use `../design-repo-common/references/orchestrator-workflows.md` for top-level WBS variants: screenshot feedback, missing breakpoint completion, layout-only repair, semantic/content/theme patch, and post-acceptance handoff refresh inside a patch lifecycle. Standalone review-only requests route to `design-review-gate`; standalone accepted-artifact handoff routes to `design-handoff-release`. Parent/work orchestrator owns package splitting, promotion, and final assembly.

## Responsibilities

- confirm source truth, artifact, and lineage exist
- choose the smallest patch path from the fix lane
- delegate targeted source-truth edits to `design-source-patcher`
- delegate generation packs to `generation-pack-builder`
- delegate Stitch operations to `stitch-adapter`
- delegate layout-only repairs to `layout-repair-loop`
- delegate acceptance decisions to `design-review-gate`
- update handoff through `design-handoff-release` after acceptance

## Flow

1. Classify the request with `fix-lanes.md` using user feedback, screenshots, current source truth, artifacts, and latest review.
2. If the issue is semantic, content, theme, or responsive contract, use `design-source-patcher` before changing artifacts.
3. After any source-truth change, rebuild the generation pack/locks before artifact mutation or regeneration.
4. Create a candidate artifact or Stitch edit/remap candidate.
5. Send candidate evidence to `design-review-gate`.
6. Promote only after review passes and the parent/operator chooses promotion; otherwise preserve the candidate and stop with a clear state.
7. Update handoff only after accepted artifacts are promoted.

## Mutation model

Candidate-first. The accepted artifact is not silently replaced.

Promotion requires review evidence, passing hard locks, screenshot triplet, and a short note explaining what changed. Use the shared promotion step so candidate files become accepted root artifacts atomically and `runtime/state.json` records `approved[breakpoint]`.

## Escalation

Prefer source fixes and local artifact patches first.

Escalate to Stitch only when the visual structure needs regeneration/remap, the artifact has drifted too far from the intended visual family, or a reference-driven edit is more reliable than local patching.

Stay in the same Stitch project unless the user explicitly asks for a branch/reset.

## Missing breakpoint completion

When completing tablet/desktop or another missing breakpoint from an accepted primary breakpoint:

- Read `04-generated/stitch/<page>/runtime/state.json` first.
- Resolve the approved/current source screen from runtime state and `<breakpoint>.meta.json`.
- Use Stitch reference/remap/edit/export for the new breakpoint before any local layout repair.
- Use `../design-repo-common/references/responsive-remap-quality.md` when the target breakpoint is sparse, cramped, or invents framing.
- Do not create tablet/desktop by stretching accepted mobile HTML.
- Enter `layout-repair-loop` only after a real Stitch candidate exists for that breakpoint.
- Promote only after review passes for that exact candidate.

## Stop states

Use canonical lifecycle states from `../design-repo-common/references/lifecycle.md`:

- `accepted-promoted` — candidate reviewed, promoted, and recorded in approved state
- `candidate-ready` — candidate exists but needs review or promotion decision
- `needs-source` — artifact should not change until source truth changes
- `needs-remap` — local repair would hide a structural breakpoint problem
- `manual-review-required` — Stitch edit or human judgment is needed before promotion
- `blocked` — no existing artifact, missing dependency, or unsafe input prevents progress
- `budget-exhausted` — bounded attempts used without acceptable result

## Report

- fix lane
- source files changed
- candidate/accepted artifact paths
- review result from `design-review-gate`
- stop state
- remaining caveats

Use `../design-repo-common/references/fix-lanes.md`, `../design-repo-common/references/lifecycle.md`, `../design-repo-common/references/source-truth-rules.md`, `../design-repo-common/references/artifact-hygiene.md`, and `../design-repo-common/references/review-cycle.md`.

## Subagents

When using subagents, follow `../design-repo-common/references/subagent-policy.md`.
