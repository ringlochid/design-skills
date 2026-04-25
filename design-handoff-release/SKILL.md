---
name: design-handoff-release
description: Produce a minimal implementation handoff index from approved generated design artifacts. Use when design artifacts are accepted and frontend/build work only needs page names, breakpoint HTML, screenshots, and essential review links.
---

# Design Handoff Release

Goal: make the handoff thin and implementation-friendly. Prefer an artifact index over re-summarizing the whole design repo.

## Default workflow

1. Verify the page has a review verdict and accepted generated artifacts.
2. For each accepted breakpoint, list only the artifact paths needed to build from it.
3. Write/update `06-handoff/artifact-index.md`.
4. Add notes only for blockers, known compromises, or missing artifacts.

## Minimal output contract

Default handoff shape:

```md
# Design handoff

## <page-name>

| Breakpoint | HTML | Screenshot | Meta |
| --- | --- | --- | --- |
| mobile | `04-generated/stitch/<page>/mobile/screen.html` | `.../screen.png` | `.../meta.json` |
| tablet | `04-generated/stitch/<page>/tablet/screen.html` | `.../screen.png` | `.../meta.json` |
| desktop | `04-generated/stitch/<page>/desktop/screen.html` | `.../screen.png` | `.../meta.json` |
```

Optional links, only when useful:

- review verdict: `05-review/<page>-review.md`
- source truth: `00-product/brief.md`, `02-pages/<page>/spec.md`, `01-system/DESIGN.md`
- responsive plan: `02-pages/<page>/responsive-plan.md`

## Avoid by default

Do not generate a separate implementation brief, component map, asset list, or acceptance checklist unless the user asks or implementation genuinely needs it.

## Stop boundary

Do not silently approve weak designs. If review evidence or breakpoint artifacts are missing, return to `design-review-gate` or the relevant generation/repair skill.

## Shared rules

When promoting, generating, reviewing, repairing, or handing off artifacts, use `../design-repo-common/references/source-truth-rules.md`; use `../design-repo-common/references/tool-policy.md` for web/browser/image-generation placement.
