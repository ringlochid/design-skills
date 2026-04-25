---
name: product-brief-writer
description: Read product source material and write/refine a product brief. Use when notes, PRDs, screenshots, architecture docs, or a design repo need `00-product/brief.md` before page design or generation.
---

# Product Brief Writer

Goal: create a product-level brief that can guide page specs and design work.

## Required inputs

Use available source inventory, product docs, backend capabilities, architecture notes, screenshots, and research. If source is weak, mark assumptions rather than inventing facts.

## Workflow

1. Read `00-product/source-inventory.md` when present plus any provided notes, PRDs, README/architecture docs, screenshots, or research.
2. If visual references/screenshots matter, use image analysis; if backend/API facts matter, use `backend-capability-reader`.
3. Extract user, problem, value proposition, core workflows, constraints, non-goals, and success criteria.
4. Separate confirmed facts from assumptions/open questions.
5. Update `00-product/source-inventory.md` when useful, then write/update `00-product/brief.md`.

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
