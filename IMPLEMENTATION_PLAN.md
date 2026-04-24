# Design Skills v2 Implementation Plan

Goal: replace the monolithic `design-flow` skill with a design-repo-first skill pack.

Core principle:

```text
source truth → generation package → tool adapter → review gates → responsive repair → handoff release
```

## Skill set

### Core router/foundation

1. `design-repo-router` — routes design requests to the right leaf skill.
2. `design-repo-init` — creates/validates the design repo structure and classifies source readiness.
3. `product-source-reader` — extracts product intent from ideas, docs, architecture notes, and references.
4. `backend-capability-reader` — extracts UI-relevant capabilities/constraints from backend/API/code.
5. `reference-research` — finds/summarizes external product/design references when useful.

### Source authoring

6. `product-brief-writer` — writes `00-product/brief.md`.
7. `page-spec-writer` — writes `02-pages/<page>/spec.md`, states, content, data/actions.
8. `design-system-writer` — writes `01-system/DESIGN.md`, themes, tokens, component notes.
9. `design-direction-brainstorm` — optional divergent direction generation before design system lock.

### Generation/tooling

10. `generation-pack-builder` — turns source truth into prompt packs/locks for a tool adapter.
11. `stitch-adapter` — owns Stitch reference sync/generate/edit/export and runtime IDs.
12. `visual-asset-generator` — optional image generation for moodboards/assets, not source truth.

### Review/responsive/release

13. `design-review-gate` — reviews generated output and decides accept/source-fix/regenerate.
14. `responsive-plan-writer` — writes breakpoint contracts and separates remap from repair.
15. `layout-repair-loop` — bounded screenshot/DOM/layout repair loop.
16. `design-handoff-release` — creates implementation-ready handoff package.

`design-repo-common/` is included as shared infrastructure, not an installable skill.

## Design repo structure

```text
00-product/
  idea.md
  source-inventory.md
  brief.md
  research.md
  workflows.md

01-system/
  DESIGN.md
  tokens.json
  themes/
  components.md

02-pages/
  <page>/
    spec.md
    content.md
    states.md
    responsive-plan.md

03-references/
  screenshots/
  figma/
  architecture/
  backend/
  generated-assets/

04-generated/
  stitch/
  html/
  screenshots/

05-review/
  <page>-review.md

06-handoff/
  <page>-implementation-brief.md
  component-map.md
  asset-list.md
  artifact-index.md
```

## Migration plan from current `design-flow`

1. Keep active `design-flow` as legacy until v2 is tested.
2. Copy existing Stitch scripts into `stitch-adapter/scripts/`.
3. Copy existing layout/review scripts into `layout-repair-loop/scripts/`.
4. Copy bootstrap/preflight scripts into `design-repo-init/scripts/`.
5. Move old references into narrower skill references.
6. Add `design-repo-common/scripts/check_design_repo.mjs` to validate structure and links.
7. Test with three prompts:
   - new product/page design from idea
   - backend/repo-informed brief then design
   - generated design responsive repair + handoff

## Reliability rules

- Source truth: `00-product/`, `01-system/`, `02-pages/`, `03-references/`.
- Generated/runtime artifacts: `04-generated/`, `05-review/`, `06-handoff/`.
- Generated output never becomes source truth unless explicitly merged back by a source-authoring skill.
- Stitch is one adapter, not the design workflow.
- Parent agent owns source truth and promotion decisions.
- Subagents are for brainstorming, source synthesis, backend extraction, reference research, and independent review only.
- Loops require explicit evaluators: screenshots, DOM checks, review verdicts, or handoff completeness.
