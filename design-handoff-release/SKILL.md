---
name: design-handoff-release
description: Produce a minimal implementation handoff index from approved generated design artifacts. Use when design artifacts are accepted and frontend/build work only needs page names, design system/theme links, breakpoint HTML, screenshots, and essential review links.
---

# Design Handoff Release

Goal: keep handoff thin. One small handoff file should point to approved artifacts; do not restate the whole design repo.

## Default workflow

1. Verify the page has a review verdict and accepted generated artifacts.
2. List the design system source and active theme source.
3. For each accepted page/breakpoint/theme, list only the artifact paths needed to build from it.
4. Write/update `06-handoff/<page>.md`.
5. Add notes only for blockers, known compromises, or missing artifacts.

## Minimal output contract

Default handoff shape:

```md
# <page-name> handoff

Design system: `01-system/DESIGN.md`
Theme: `01-system/themes/<theme>.md` or `single-theme`
Review: `05-review/<page>-review.md`

| Theme | Breakpoint | HTML | Screenshot | Meta |
| --- | --- | --- | --- | --- |
| single-theme | mobile | `04-generated/stitch/<page>/mobile.html` | `04-generated/stitch/<page>/mobile.png` | `04-generated/stitch/<page>/mobile.meta.json` |
| single-theme | tablet | `04-generated/stitch/<page>/tablet.html` | `04-generated/stitch/<page>/tablet.png` | `04-generated/stitch/<page>/tablet.meta.json` |
| single-theme | desktop | `04-generated/stitch/<page>/desktop.html` | `04-generated/stitch/<page>/desktop.png` | `04-generated/stitch/<page>/desktop.meta.json` |
```

For multiple themes, keep the same flat folder and include the theme in the filename:

- `04-generated/stitch/<page>/<theme>.mobile.html`
- `04-generated/stitch/<page>/<theme>.desktop.png`
- `04-generated/stitch/<page>/<theme>.tablet.meta.json`

## Handoff folder rule

Keep `06-handoff/` simple:

- `06-handoff/<page>.md` for each page handoff.
- Optional `06-handoff/index.md` only when multiple pages need a table of contents.
- No component-map / asset-list / implementation-brief files unless the user asks.

## Stop boundary

Do not silently approve weak designs. If review evidence or breakpoint artifacts are missing, return to `design-review-gate` or the relevant generation/repair skill.

## Shared rules

When promoting, generating, reviewing, repairing, or handing off artifacts, use `../design-repo-common/references/source-truth-rules.md`; use `../design-repo-common/references/tool-policy.md` for web/browser/image-generation placement.
