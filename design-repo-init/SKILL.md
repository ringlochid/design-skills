---
name: design-repo-init
description: Initialize or inspect a design repository structure. Use when starting design work in a repo/folder, validating whether a workspace is design-ready, migrating from legacy design-flow artifacts, or creating the 00-product/ through 06-handoff structure.
---

# Design Repo Init

Goal: create or validate the design repo skeleton without inventing product semantics.

## Workflow

1. Inspect current workspace for product docs, existing design artifacts, repo UI, screenshots, Figma links, backend/API clues, and legacy design-flow layout.
2. Classify readiness:
   - `ready`: enough source truth exists.
   - `partial`: structure exists but key product/page truth is missing.
   - `init-required`: no usable design repo or product source exists.
3. Create missing folders only when safe.
4. Write `00-product/source-inventory.md` summarizing evidence and gaps.
5. If migrating legacy design-flow artifacts, map them into the new structure without deleting originals.

## Outputs

- design repo folder skeleton
- `00-product/source-inventory.md`
- optional migration notes

## Stop boundary

Do not fabricate product goals, page semantics, workflows, or design-system claims. If source truth is missing, stop with exact missing inputs.

## Scripts

- `scripts/design_repo_preflight.mjs`
- `scripts/design_repo_bootstrap_project.mjs`
- `scripts/design_repo_bootstrap_page.mjs`

Legacy migration helpers remain available as `design_flow_bootstrap_*`, but they write old paths and should not be used for normal v2 initialization. For legacy mapping, read `../design-repo-common/references/legacy-design-flow-migration.md`.
