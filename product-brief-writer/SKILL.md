---
name: product-brief-writer
description: Write or refine a product brief from source material. Use when the design repo needs `00-product/brief.md` describing user, problem, workflows, constraints, and success criteria before page design or generation.
---

# Product Brief Writer

Goal: create a product-level brief that can guide page specs and design work.

## Required inputs

Use available source inventory, product docs, backend capabilities, architecture notes, screenshots, and research. If source is weak, mark assumptions rather than inventing facts.

## Workflow

1. Read `00-product/source-inventory.md` when present.
2. Extract user, problem, value proposition, core workflows, constraints, non-goals, and success criteria.
3. Separate confirmed facts from assumptions/open questions.
4. Write/update `00-product/brief.md`.

## Output contract

`00-product/brief.md` should include:

- Product goal
- Target users
- Problems/jobs
- Core workflows
- Constraints
- Success criteria
- Assumptions/open questions

## Stop boundary

Do not write page layout or tool prompt packs here. Hand off to `page-spec-writer`.

## Output shape

For brief structure, use `references/product-brief-template.md`.
