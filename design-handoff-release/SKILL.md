---
name: design-handoff-release
description: Produce an implementation-ready design handoff package from approved design repo source truth and generated artifacts. Use when design artifacts are accepted and need to be delivered to frontend/build work.
---

# Design Handoff Release

Goal: package the design so implementation can proceed without reverse-engineering intent.

## Workflow

1. Verify source truth, review verdicts, generated artifacts, responsive plan, and selected assets exist.
2. Build an artifact index.
3. Write implementation brief, component map, asset list, and acceptance checks.
4. Include known compromises and open decisions.
5. Run final browser/image sanity checks when visual artifacts exist.

## Outputs

- `06-handoff/<page>-implementation-brief.md`
- `06-handoff/component-map.md`
- `06-handoff/asset-list.md`
- `06-handoff/artifact-index.md`

## Stop boundary

Do not silently approve weak designs. If review evidence is missing, return to `design-review-gate`.
