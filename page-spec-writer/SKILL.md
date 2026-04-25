---
name: page-spec-writer
description: Write page-level design source truth. Use when a design repo needs `02-pages/<page>/spec.md`, content, states, data/actions, and responsive intent before generation.
---

# Page Spec Writer

Goal: define what a page must communicate and support before any generation tool runs.

## Workflow

1. Read product brief and relevant source/reference files.
2. Define page goal, user journey, sections, content hierarchy, actions, data dependencies, states, and constraints.
3. Include loading/empty/error/permission/destructive states when relevant.
4. Write/update page source files.

## Outputs

- `02-pages/<page>/spec.md`
- `02-pages/<page>/content.md` when copy/content matters
- `02-pages/<page>/states.md` when runtime states matter
- optional early responsive intent section in `02-pages/<page>/responsive-plan.md`

## Stop boundary

Do not generate UI or write tool-specific prompts. Hand off to `design-system-writer` or `generation-pack-builder`.

## Output shape

For page spec structure, use `references/page-spec-template.md`.
