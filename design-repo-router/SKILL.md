---
name: design-repo-router
description: Route design-repo workflow requests to the right focused design skill. Use when design requests may involve product briefs, architecture/backend source material, design systems, generation, Stitch, review, responsive repair, handoff, visual assets, or reference research.
---

# Design Repo Router

Use this as the front door for the design-repo workflow. Route only; do not execute the full workflow here.

## Decision tree

- New/unknown design workspace → `design-repo-init`.
- Product idea, architecture doc, PRD, notes, screenshots, or broad source material → `product-source-reader`.
- Backend/API/codebase should inform the UI → `backend-capability-reader`.
- Need market/category/competitor examples → `reference-research`.
- Need divergent visual/product directions → `design-direction-brainstorm`.
- Need product brief → `product-brief-writer`.
- Need page-level spec/states/data/actions → `page-spec-writer`.
- Need visual language/tokens/themes/components → `design-system-writer`.
- Need tool prompt/locks from source truth → `generation-pack-builder`.
- Need Stitch generate/edit/export/reference sync → `stitch-adapter`.
- Need generated image/moodboard/hero/asset → `visual-asset-generator`.
- Need review of generated design → `design-review-gate`.
- Need breakpoint contract/remap plan → `responsive-plan-writer`.
- Need layout diagnosis/repair loop → `layout-repair-loop`.
- Need implementation package → `design-handoff-release`.

## Rule

Route to the smallest leaf that can move the work forward. If source truth is missing or weak, prefer source-authoring skills before generation.
