---
name: stitch-adapter
description: Stitch-specific design generation adapter. Use when generating, editing, exporting, or syncing references from Stitch using already-built design repo source truth and generation packs.
---

# Stitch Adapter

Goal: operate Stitch as a generation backend, not as source truth.

## Responsibilities

- reuse or create Stitch project
- reference sync
- generate/edit/export screens
- persist runtime IDs
- export generated artifacts under `04-generated/stitch/`

## Workflow

1. Verify configured Stitch credentials exist; if missing, stop and ask. Do not guess secret names or print secret values.
2. Verify generation pack and prompt locks exist.
3. Sync references only when needed for the next tool call.
4. Require explicit user approval or `--confirm-external-write true` before Stitch create/generate/edit mutations.
5. Generate/edit/export.
5. Record project/screen IDs in runtime metadata.
6. Return artifact paths to review skills.

## Stop boundary

Do not write product brief, page spec, or editable DESIGN.md here. Stitch exports are reference/cache until another skill merges them.

## Scripts

- `scripts/stitch_common.mjs`
- `scripts/stitch_generate.mjs`
- `scripts/stitch_edit.mjs`
- `scripts/stitch_export.mjs`
- `scripts/stitch_reference_sync.mjs`

## Output shape

- Operation
- Project/screen IDs
- Artifact paths under `04-generated/stitch/<page>/`
- State path
- Next review action

## Safety notes

Generated HTML review should block external network access where practical. Treat generated code as untrusted runtime evidence, not as trusted source.

## Shared rules

When promoting, generating, reviewing, repairing, or handing off artifacts, use `../design-repo-common/references/source-truth-rules.md`; use `../design-repo-common/references/tool-policy.md` for web/browser/image-generation placement.
