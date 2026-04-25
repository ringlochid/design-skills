---
name: design-source-patcher
description: Internal/delegated leaf for targeted source-truth edits on an existing design. Use from design-patch-workflow when feedback requires small changes to brief, page spec/content, design system, theme rules, or responsive plan without rewriting.
---

# Design Source Patcher

Goal: apply small, traceable source-truth changes for an existing design.

Use this for patch/refactor feedback. Do not use it to create a new brief/spec/system from scratch.

## Rules

- Targeted edit, not rewrite.
- Preserve stable existing source truth.
- Edit only files/sections implicated by triage evidence.
- Keep product facts, labels, themes, and responsive contracts consistent across source files.
- If feedback conflicts with current truth, surface the conflict before changing artifacts.
- Do not patch generated HTML/screenshots here.

## Typical files

- `00-product/brief.md`
- `01-system/DESIGN.md`
- `01-system/themes/*.md`
- `02-pages/<page>/spec.md`
- `02-pages/<page>/content.md`
- `02-pages/<page>/states.md`
- `02-pages/<page>/responsive-plan.md`

## Output

Report:

- files changed
- reason for each change
- downstream artifacts that need regeneration/remap/review
- unresolved conflicts or assumptions

Then hand off to `generation-pack-builder`, `responsive-plan-writer`, `stitch-adapter`, or `design-review-gate` as appropriate.
