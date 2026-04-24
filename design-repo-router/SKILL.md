---
name: design-repo-router
description: Route ambiguous or multi-step design-repo workflow requests to the right design skill. Use only when no single focused design leaf clearly matches, or when the user asks for an end-to-end design workflow.
---

# Design Repo Router

Use this as the front door only for ambiguous design requests. Do not use when a specific leaf skill clearly matches.

## Decision tree

- End-to-end product/page design run -> `design-workflow`.
- New/unknown design workspace -> `design-repo-init`.
- Product idea, architecture doc, PRD, notes, screenshots, or broad source material -> `product-source-reader`.
- Backend/API/codebase should inform the UI -> `backend-capability-reader`.
- Need market/category/competitor examples -> `reference-research`.
- Need divergent visual/product directions -> `design-direction-brainstorm`.
- Need product brief -> `product-brief-writer`.
- Need page-level spec/states/data/actions -> `page-spec-writer`.
- Need visual language/tokens/themes/components -> `design-system-writer`.
- Need tool prompt/locks from source truth -> `generation-pack-builder`.
- Need Stitch generate/edit/export/reference sync -> `stitch-adapter`.
- Need generated image/moodboard/hero/asset -> `visual-asset-generator`.
- Need review of generated design -> `design-review-gate`.
- Need breakpoint contract/remap plan -> `responsive-plan-writer`.
- Need layout diagnosis/repair loop -> `layout-repair-loop`.
- Need implementation package -> `design-handoff-release`.

## Rule

Route to the smallest skill that can move the work forward. If source truth is missing or weak, prefer source-authoring skills before generation.
