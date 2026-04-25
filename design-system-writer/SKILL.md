---
name: design-system-writer
description: Create or refine the design repo's visual system source truth. Use when writing `01-system/DESIGN.md`, themes, tokens, component guidance, or deriving a design system from repo styles, screenshots, brand docs, generated references, or product direction.
---

# Design System Writer

Goal: produce tool-agnostic visual/design-system guidance before generation.

## Sources

- existing repo styles/components
- product/brand brief
- screenshots or Figma/reference images
- generated moodboards/assets
- Stitch/Figma exports as reference only

## Workflow

1. Identify the design-system source and confidence.
2. Use image analysis for screenshots/reference visuals when helpful.
3. Write/edit `01-system/DESIGN.md` and optional themes/tokens/components.
4. Mark assumptions and avoid over-specific fake tokens.

## Outputs

- `01-system/DESIGN.md`
- `01-system/themes/*.md`
- `01-system/tokens.json` when concrete tokens exist
- `01-system/components.md` when component patterns are known

## Rule

Tool exports under `04-generated/` are cache/reference until explicitly merged back into `01-system/`.

## Output shape

For DESIGN.md structure, use `references/design-md-template.md`.
