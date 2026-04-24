---
name: design-direction-brainstorm
description: Generate and compare divergent product/visual design directions before committing to a design system or generation pack. Use when visual direction is ambiguous, the user wants options, or a stronger concept is needed.
---

# Design Direction Brainstorm

Goal: create useful alternatives, not a final source of truth.

## Good use of subagents

Use 2–4 bounded subagents when distinct perspectives would help, for example:

- conservative/productive SaaS
- bold/editorial brand
- data-dense technical dashboard
- playful/consumer onboarding

Parent agent synthesizes; subagents do not write final source truth.

## Image generation

Optional: generate moodboards or hero/reference concepts when visual ambiguity is high. Store outputs under `03-references/generated-assets/` or `04-generated/images/`.

## Output shape

- Direction options
- Pros/cons
- Best-fit recommendation
- What to encode in `01-system/DESIGN.md`

## Stop boundary

Do not merge all ideas. Pick or recommend a direction.
