# Design Skills v2 Implementation Plan

Goal: replace the monolithic `design-flow` skill with a design-repo-first skill pack.

Core principle:

```text
source truth → generation package → tool adapter → review gates → responsive repair → minimal handoff
```

## Skill set

### Core router/foundation

1. `design-repo-router` — routes ambiguous design requests to the right focused skill.
2. `design-workflow` — conductor for a full end-to-end run.
3. `design-repo-init` — creates/validates the design repo structure and classifies source readiness.

### Source authoring / evidence

4. `product-brief-writer` — reads source material and writes `00-product/brief.md`.
5. `backend-capability-reader` — extracts UI-relevant capabilities/constraints from backend/API/code.
6. `reference-research` — finds/summarizes external product/design references when useful.
7. `page-spec-writer` — writes `02-pages/<page>/spec.md`, states, content, data/actions.
8. `design-system-writer` — handles visual direction and writes `01-system/DESIGN.md`, themes, tokens, component notes.

### Generation/tooling

9. `generation-pack-builder` — turns source truth into prompt packs/locks for a tool adapter.
10. `stitch-adapter` — owns Stitch reference sync/generate/edit/export and runtime IDs.

### Review/responsive/repair

11. `design-review-gate` — reviews generated output and decides accept/source-fix/regenerate.
12. `responsive-plan-writer` — writes breakpoint contracts and separates remap from repair.
13. `layout-repair-loop` — bounded screenshot/DOM/layout repair loop.

Handoff is not a separate skill. After review passes, the agent writes `06-handoff/<page>.md` manually.

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
  <page>.md
  index.md              # optional only for multi-page handoffs
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
- Subagents are for backend extraction, reference research, divergent synthesis, and independent review only.
- Loops require explicit evaluators: screenshots, DOM checks, review verdicts, or minimal handoff completeness.
