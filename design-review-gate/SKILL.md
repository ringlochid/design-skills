---
name: design-review-gate
description: Review, critique, or audit generated/existing design artifacts or screenshots without mutation, and gate acceptance before repair/remap/handoff. If the user asks for changes, route to design-patch-workflow after review.
---

# Design Review Gate

Goal: decide whether a design should be accepted, source-fixed, regenerated, remapped, or repaired.

## Evidence

Review the screenshot triplet together: Stitch canvas/API screenshot, full-access local browser viewport screenshot, and full-access local browser full-page screenshot. Treat Stitch as design intent, local viewport as render fidelity, and local full-page as coverage for content cropped by Stitch screenshots. If one is missing, mark the review evidence incomplete unless the missing file is explicitly irrelevant to the breakpoint. Use image analysis for screenshot/reference interpretation. Use subagents for independent critique when quality matters.

## Workflow

1. Read source truth and generated artifact paths.
2. Inspect visual/runtime evidence.
3. Check product fit, hierarchy, content, design-system consistency, responsive readiness, a11y basics, and implementation feasibility. For non-primary breakpoints, use `../design-repo-common/references/responsive-remap-quality.md` when judging sparse, cramped, or invented remaps.
4. Write review under `05-review/`.
5. Return verdict.

## Failure classification

Every non-accept review must classify the next action:

- `source-contract` — source truth, locks, copy, title, or product framing is wrong.
- `local-layout` — exported HTML has fixable overflow, spacing, density, safe-area, or fixed-nav issues.
- `responsive-remap` — breakpoint structure, density, canvas use, or framing is wrong and needs a remap/regeneration prompt.
- `generation-quality` — visual quality is weak enough to regenerate.
- `manual-polish` — subjective polish remains but core quality is usable.

For serious E2E work, final acceptance requires an independent review pass using the same screenshot triplet and source/lock evidence.

## Acceptance gates

A design can be accepted only when:

1. Source truth, pre-approval lock, and copy lock are present.
2. Lock checks pass without hard missing terms.
3. Screenshot triplet has been reviewed, or the review explains why one member is unavailable.
4. The generated page folder passes runtime/clutter placement checks.
5. Any remaining issues are written as explicit implementation caveats.

Visual/output quality lives here, not in a separate output lock file.

## Verdicts

- `accept`
- `source-fix-first`
- `regenerate`
- `responsive-plan-needed`
- `layout-repair-needed`
- `manual-polish-recommended`

## Stop boundary

Do not patch layout here. Hand off to source-writing, generation, responsive, or repair skills.

## Output shape

For a compact rubric checklist, use `references/review-rubric.md`.

- Artifact reviewed
- Evidence used
- Findings
- Verdict
- `promotion_eligible: true|false`
- Candidate paths when promotion is possible
- Required next skill/action

## Shared rules

When promoting, generating, reviewing, repairing, or handing off artifacts, use `../design-repo-common/references/source-truth-rules.md`; use `../design-repo-common/references/tool-policy.md` for web/browser/image-generation placement.

## Subagents

When using subagents, follow `../design-repo-common/references/subagent-policy.md`.
