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
4. Require explicit user approval before Stitch create/generate/edit mutations.
5. Generate/edit/export.
5. Record project/screen IDs in runtime metadata.
6. Return artifact paths to review skills.

## Stop boundary

Do not write product brief, page spec, or editable DESIGN.md here. Stitch exports are reference/cache until another skill merges them.

## Internal helpers

The adapter reports workflow results and evidence: operation, project/screen IDs, artifact paths, runtime metadata, and next review action.

## Output shape

- Operation
- Project/screen IDs
- Artifact paths under `04-generated/stitch/<page>/`
- Runtime metadata path
- Next review action

## Naming rule

Stitch project titles must be product-facing and concrete. Do not create Stitch projects named after temp folders, timestamps, `e2e`, `smoke`, `test`, `demo`, or `design-skills`. Use the product name from source truth or an explicit polished project title.

## Screenshot rule

For generated/exported Stitch screens, use the Stitch-rendered canvas screenshot as the primary screenshot artifact (`<breakpoint>.png`). Keep all review-useful screenshots by default: `<breakpoint>.png` from Stitch canvas/API, `<breakpoint>.local.png` from full-access local browser viewport render, and `<breakpoint>.local.full.png` from full-access local browser full-page render. Review should compare all three because Stitch canvas screenshots can crop/shorten some breakpoints while local full-page render can reveal omitted lower-page content.

## Artifact hygiene

Use `../design-repo-common/references/artifact-hygiene.md`. In short: human-readable HTML/MD/screenshots stay in the page root; JSON/state/logs/diagnostics/backups stay under `runtime/`.

## Local HTML render rule

Local browser screenshots are generated with full external network access so CDN Tailwind, Google Fonts, icon fonts, and remote assets can load. Do not use blocked-network renders for design quality or screenshot comparison. Keep viewport and full-page local screenshots next to the Stitch screenshot so humans can compare them quickly.

## Safety notes

Treat generated HTML as untrusted runtime evidence, not as trusted source. Local screenshot capture may use full external network access to load CDN styles/fonts/assets; deeper code/security inspection should still avoid executing or trusting generated code beyond the review task.

## Shared rules

When promoting, generating, reviewing, repairing, or handing off artifacts, use `../design-repo-common/references/source-truth-rules.md`; use `../design-repo-common/references/tool-policy.md` for web/browser/image-generation placement.

## Runtime-first breakpoint remap

For tablet/desktop or another missing breakpoint, resolve source context from runtime before generating:

1. Read `04-generated/stitch/<page>/runtime/state.json`.
2. Prefer `state.approved[primaryBreakpoint]`, then `state.current[primaryBreakpoint]`, then explicit project/screen ids.
3. Read the matching `runtime/<breakpoint>.meta.json` for lineage and canonical outdir.
4. Use SDK-backed Stitch reference/remap/edit/export from that project/screen.
5. Use local repair only after a real Stitch candidate exists for the target breakpoint.

Do not treat accepted HTML as the responsive source of truth; it is implementation evidence. Stitch project/screen state is the generation reference. For quality examples and mobile↔desktop cautions, use `../design-repo-common/references/responsive-remap-quality.md` when a remap is sparse, cramped, or invents framing.

## Candidate export model

Generate, edit, and export operations create candidate artifacts under `attempts/` first. Root breakpoint artifacts are accepted outputs and should change only through the promotion step after review passes. If Stitch canvas screenshot is unavailable, local-browser screenshot fallback must be marked degraded in metadata. If a post-export visible-label check fails after files are written, keep the candidate as failed evidence under `attempts/`; do not promote it until review/repair passes.
