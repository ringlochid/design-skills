---
name: product-source-reader
description: Extract product intent from idea notes, PRDs, architecture docs, README files, screenshots, Figma/reference material, or messy source material before writing a design brief. Use when source material must be understood before design work.
---

# Product Source Reader

Goal: turn source material into concise product understanding for brief writing.

## Inputs

- product idea or PRD
- architecture/system docs
- README/roadmap
- screenshots or design references
- prior page notes
- user-provided constraints

## Workflow

1. Identify source types and reliability.
2. Extract target users, problem, jobs-to-be-done, workflows, constraints, success criteria, and open questions.
3. Separate facts from assumptions.
4. If visual references are images/screenshots, use image analysis when pixels matter.
5. Write or update `00-product/source-inventory.md` and optionally `00-product/research.md`.

## Output shape

- Source evidence
- Product facts
- Assumptions
- Open questions
- Recommended next skill

## Stop boundary

Do not design UI. Do not write final brief unless asked; hand off to `product-brief-writer`.
