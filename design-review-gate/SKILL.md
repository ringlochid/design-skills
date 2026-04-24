---
name: design-review-gate
description: Review generated or existing design artifacts against product brief, page spec, design system, visual references, accessibility basics, and implementation feasibility. Use before accepting, regenerating, repairing, or handing off a design.
---

# Design Review Gate

Goal: decide whether a design should be accepted, source-fixed, regenerated, remapped, or repaired.

## Evidence

Use browser screenshots/runtime inspection when HTML or live UI exists. Use image analysis for screenshot/reference interpretation. Use subagents for independent critique when quality matters.

## Workflow

1. Read source truth and generated artifact paths.
2. Inspect visual/runtime evidence.
3. Check product fit, hierarchy, content, design-system consistency, responsive readiness, a11y basics, and implementation feasibility.
4. Write review under `05-review/`.
5. Return verdict.

## Verdicts

- `accept`
- `source-fix-first`
- `regenerate`
- `responsive-plan-needed`
- `layout-repair-needed`
- `manual-polish-recommended`

## Stop boundary

Do not patch layout here. Hand off to source-writing, generation, responsive, or repair skills.
