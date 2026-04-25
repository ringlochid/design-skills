---
name: generation-pack-builder
description: Build tool-neutral or tool-specific generation packs from design repo source truth. Use before Stitch/Figma/HTML generation to create prompt files, locks, constraints, and artifact paths from product brief, page spec, and design system.
---

# Generation Pack Builder

Goal: transform source truth into deterministic generation inputs.

## Workflow

1. Read product brief, page spec, design system, and relevant references.
2. Verify source truth is good enough; stop if product/page semantics are missing.
3. Build a flat tool prompt pack under `04-generated/<tool>/<page>/` using names like `<page>.<breakpoint>.prompt.md`.
4. Write locks that prevent semantic/copy/output drift.
5. Hand off to the matching tool adapter.

## Prompt lock layers

- `pre-approval-lock.md` — product/page intent.
- `copy-lock.md` — copy and content that must not drift.
- `output-lock.md` — required output contract.

## Scripts

- `scripts/build_generation_pack.mjs`

## Output shape

- Source files used
- Prompt pack path
- Locks written
- Tool adapter to call next

## Stop boundary

Do not call Stitch or other generation tools here.

## Shared rules

When promoting, generating, reviewing, repairing, or handing off artifacts, use `../design-repo-common/references/source-truth-rules.md`; use `../design-repo-common/references/tool-policy.md` for web/browser/image-generation placement.
