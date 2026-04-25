---
name: design-repo-router
description: Route ambiguous design-repo requests to the right design skill. Use when deciding between new design, existing-artifact patch, review-only, responsive remap, local layout repair, handoff, or source/reference intake.
---

# Design Repo Router

Goal: choose the smallest design skill path.

## Public paths

- New full product/page/screen/flow design from scratch -> `design-workflow`.
- Existing generated design needs a change, patch, refactor, missing item, redundant item, or screenshot feedback -> `design-patch-workflow`.
- Critique/audit/review-only with no mutation -> `design-review-gate`.

## Specific routing

- Screenshot as inspiration/source for a new design -> `product-source-reader` or `design-system-writer`, then `design-workflow`.
- Screenshot feedback on an existing artifact -> `design-patch-workflow`.
- Natural feedback after a generated artifact or handoff, such as “make it less cramped”, “remove X”, “this feels redundant”, or “mobile feels wrong” -> `design-patch-workflow` unless the user explicitly asks for review-only.
- Missing/redundant/copy/content/theme/source truth in an existing artifact -> `design-patch-workflow`.
- Valid generated shell has overflow/overlap/clipping/spacing/safe-area issues -> `layout-repair-loop` through `design-patch-workflow`.
- Breakpoint structure is wrong, or user asks to make/remap mobile/tablet/desktop -> existing artifact: `responsive-plan-writer` through `design-patch-workflow`; no artifact/new full run: `design-workflow`.
- Handoff for accepted artifacts -> `design-handoff-release`.

Use `design-workflow` as conductor for new E2E runs. Use `design-patch-workflow` as conductor for existing artifacts. Do not route screenshot feedback straight to source-writing or layout repair unless the lane is already unambiguous.
