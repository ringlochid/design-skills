---
name: design-repo-router
description: Route ambiguous or multi-step design-repo workflow requests to the right design skill. Use only when no single focused design leaf clearly matches, or when the user asks for an end-to-end design workflow.
---

# Design Repo Router

Use this as the front door only for ambiguous design requests. Do not use when a specific leaf skill clearly matches.

## Decision tree

- End-to-end product/page design run -> `design-workflow`.
- New/unknown design workspace -> `design-repo-init`.
- Product idea, PRD, notes, screenshots, or broad source material -> `product-brief-writer`.
- Backend/API/codebase should inform the UI -> `backend-capability-reader`.
- Need market/category/competitor examples -> `reference-research`.
- Need visual/product direction -> `design-system-writer` after optional `reference-research`.
- Need product brief -> `product-brief-writer`.
- Need page-level spec/states/data/actions -> `page-spec-writer`.
- Need visual language/tokens/themes/components -> `design-system-writer`.
- Need tool prompt/locks from source truth -> `generation-pack-builder`.
- Need Stitch generate/edit/export/reference sync -> `stitch-adapter`.
- Need moodboard/hero/asset prompt -> handle inside `design-system-writer` or `reference-research`; generated images are references, not source truth.
- Need review of generated design -> `design-review-gate`.
- Need breakpoint contract/remap plan -> `responsive-plan-writer`.
- Need layout diagnosis/repair loop -> `layout-repair-loop`.
- Need implementation handoff -> `design-workflow` writes a minimal `06-handoff/<page>.md` after review passes.

## Rule

Route to the smallest skill that can move the work forward. If source truth is missing or weak, prefer source-authoring skills before generation.
