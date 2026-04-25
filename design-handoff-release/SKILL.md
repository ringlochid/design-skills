---
name: design-handoff-release
description: Produce a minimal implementation handoff index from approved generated design artifacts. Use when design artifacts are accepted and frontend/build work only needs page names, design system/theme links, breakpoint HTML, screenshots, and essential review links.
---

# Design Handoff Release

Goal: keep handoff thin. One small handoff file should point to approved artifacts; do not restate the whole design repo.

## Default workflow

1. Verify the page has a review verdict and accepted generated artifacts.
2. List the design system source and active theme source.
3. For each accepted page/breakpoint/theme, list only the artifact paths needed to build from it. Include Stitch screenshot plus local viewport/full-page screenshots so review and implementation can compare design intent, viewport render, and full-page coverage.
4. Write/update `06-handoff/<page>.md`.
5. Add notes only for blockers, known compromises, or missing artifacts.

## Minimal output contract

Default handoff shape:

```md
# <page-name> handoff

Design system: `01-system/DESIGN.md`
Theme: `01-system/themes/<theme>.md` or `single-theme`
Review: `05-review/<page>-review.md`

| Theme | Breakpoint | HTML | Stitch screenshot | Local viewport | Local full page |
| --- | --- | --- | --- | --- | --- |
| single-theme | mobile | [mobile.html](../04-generated/stitch/<page>/mobile.html) | [mobile.png](../04-generated/stitch/<page>/mobile.png) | [mobile.local.png](../04-generated/stitch/<page>/mobile.local.png) | [mobile.local.full.png](../04-generated/stitch/<page>/mobile.local.full.png) |
| single-theme | tablet | [tablet.html](../04-generated/stitch/<page>/tablet.html) | [tablet.png](../04-generated/stitch/<page>/tablet.png) | [tablet.local.png](../04-generated/stitch/<page>/tablet.local.png) | [tablet.local.full.png](../04-generated/stitch/<page>/tablet.local.full.png) |
| single-theme | desktop | [desktop.html](../04-generated/stitch/<page>/desktop.html) | [desktop.png](../04-generated/stitch/<page>/desktop.png) | [desktop.local.png](../04-generated/stitch/<page>/desktop.local.png) | [desktop.local.full.png](../04-generated/stitch/<page>/desktop.local.full.png) |
```

For multiple themes, keep the same flat folder and include the theme in the filename:

- `04-generated/stitch/<page>/<theme>.mobile.html`
- `04-generated/stitch/<page>/<theme>.desktop.png`
- JSON metadata stays under `04-generated/stitch/<page>/runtime/` and should not be listed in the human handoff table unless debugging requires it.

## Screenshot previews

When screenshot files exist, include Markdown image previews after the artifact table. Use relative paths from the handoff file so VS Code/GitHub preview renders them, e.g. `![desktop local full](../04-generated/stitch/<page>/desktop.local.full.png)`.

## Handoff artifact table gate

Every accepted breakpoint row must include direct paths for:

- HTML export
- Stitch canvas/API screenshot
- local viewport screenshot
- local full-page screenshot

Use Markdown links, not code-only paths, so reviewers can click HTML/screenshots directly. Do not bury screenshots only in prose notes. If a screenshot is missing, write `missing` in the table and send the design back to review/generation before release. Runtime JSON may be mentioned separately under a short metadata section, but it is not part of the main artifact table.

## Handoff folder rule

Keep `06-handoff/` simple:

- `06-handoff/<page>.md` for each page handoff.
- Optional `06-handoff/index.md` only when multiple pages need a table of contents.
- No component-map / asset-list / implementation-brief files unless the user asks.

## Stop boundary

Do not silently approve weak designs. If review evidence or breakpoint artifacts are missing, return to `design-review-gate` or the relevant generation/repair skill.

## Shared rules

When promoting, generating, reviewing, repairing, or handing off artifacts, use `../design-repo-common/references/source-truth-rules.md`; use `../design-repo-common/references/tool-policy.md` for web/browser/image-generation placement.

## Acceptance state

Before handoff, require the accepted artifact, latest review, runtime meta, lifecycle event, and `runtime/state.json` `approved[breakpoint]` entry to refer to the same promoted artifact/screen lineage. Run `design-repo-common/scripts/check_design_repo.mjs` with `--stage=handoff` for every accepted breakpoint. Do not close over an unpromoted candidate.

## Output shape

For the minimal handoff structure, use `references/handoff-template.md`.
