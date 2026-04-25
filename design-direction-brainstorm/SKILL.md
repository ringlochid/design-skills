---
name: design-direction-brainstorm
description: Generate and compare divergent product/visual design directions before committing to a design system or generation pack. Use when visual direction is ambiguous, the user wants options, or a stronger concept is needed.
---

# Design Direction Brainstorm

Goal: create useful alternatives, not a final source of truth.

## Subagent use

Default: parent agent brainstorms alone.

Use 1-2 bounded subagents when direction is ambiguous or quality matters. Use 3-4 only when the user explicitly asks for broad exploration or the project is unusually high-value/broad. Subagents return options, tradeoffs, and reference directions only; parent selects and synthesizes.

## Image generation

Optional: generate moodboards or hero/reference concepts when visual ambiguity is high. Store outputs under `03-references/generated-assets/` or `04-generated/images/`.

## Output shape

For option formatting, use `references/direction-options-template.md`.

- Direction options
- Pros/cons
- Best-fit recommendation
- What to encode in `01-system/DESIGN.md`

## Stop boundary

Do not merge all ideas. Pick or recommend a direction.

## Asset boundary

This skill owns concept options. Delegate concrete image file generation to `visual-asset-generator`.

