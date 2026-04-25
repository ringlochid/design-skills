# Design Skills v2 Patch / Cleanup / Refactor Plan

This plan synthesizes four independent reviews plus local validation.

## Current verdict

The design-repo-first architecture is the right direction, but this draft is **not ready to replace legacy `design-flow`**.

The skill split is clean and concise. The blockers are mostly:

1. copied scripts are still legacy-shaped or broken after moving;
2. no single E2E owner skill preserves old `design-flow` orchestration quality;
3. shared conventions are not guaranteed to load;
4. safety gates around generated HTML, external Stitch writes, locks, and promotion are too weak.

## Patch principles

- Keep the 16 focused leaf skills.
- Add one conductor skill for full E2E runs.
- Keep router as router only, but narrow its trigger.
- Port scripts to v2 paths rather than pretending copied scripts are v2-native.
- Make external writes and layout mutation explicitly gated.
- Treat old `design-flow` as legacy fallback until v2 passes smoke tests.

## Phase 1 — fix immediate blockers

### 1. Fix broken shared imports

Problem:

- `design-repo-init/scripts/*.mjs` and `layout-repair-loop/scripts/*.mjs` import `./stitch_common.mjs`.
- `stitch_common.mjs` only exists in `stitch-adapter/scripts/`.

Patch:

- Move/copy shared helper to `design-repo-common/scripts/stitch_common.mjs`, or create thin shims in each script directory.
- Prefer a real shared helper path long-term.
- Update imports in:
  - `design-repo-init/scripts/design_flow_bootstrap_project.mjs`
  - `design-repo-init/scripts/design_flow_bootstrap_page.mjs`
  - `design-repo-init/scripts/design_repo_preflight.mjs`
  - `layout-repair-loop/scripts/stitch_layout_diagnose.mjs`
  - `layout-repair-loop/scripts/stitch_layout_fix.mjs`
  - `layout-repair-loop/scripts/stitch_local_review.mjs`
  - `layout-repair-loop/scripts/stitch_phase_c_loop.mjs`

Validation:

- `node --check` every `.mjs` script.
- Add import smoke test to `validate_skill_pack.py`.

### 2. Choose and enforce canonical v2 paths

Canonical source truth:

```text
00-product/
01-system/
02-pages/<page>/
03-references/
```

Canonical generated/runtime/review/handoff:

```text
04-generated/stitch/<page>/<breakpoint>.html
04-generated/stitch/<page>/<breakpoint>.png
04-generated/stitch/<page>/<breakpoint>.meta.json
04-generated/stitch/<page>/state.json
04-generated/stitch/<page>/locks/*.md
04-generated/stitch/<page>/references/*.md
05-review/<page>-review.md
06-handoff/<page>.md
```

Patch:

- Port `resolveDesignPaths()` and `inferStatePath()` in `stitch_common.mjs`.
- Avoid global `04-generated/stitch/state.json`; state must be page-scoped.
- Decide if references from Stitch are cache or source:
  - generated/cache refs → `04-generated/stitch/<page>/references/`
  - human-selected source references → `03-references/stitch/`

Validation:

- grep for legacy write defaults: `00-meta`, `03-pages`, `exports/stitch`.
- allow legacy references only in migration docs or explicit legacy helpers.

## Phase 2 — restore E2E ownership

### 3. Add `design-workflow` conductor skill

Problem:

- Router only routes.
- Leaf skills are disconnected.
- Old `design-flow` preserved an operator-owned E2E lane.

Patch:

Add:

```text
design-workflow/SKILL.md
```

Purpose:

- Own one full design run from source truth to handoff.
- Call/sequence leaves intentionally.
- Keep promotion decisions with the parent agent.
- Preserve old quality gates without recreating a 400-line mega-skill.

Workflow contract:

```text
init/inspect
→ source ingest
→ product brief
→ page spec
→ design system
→ generation pack
→ Stitch adapter
→ review gate
→ responsive plan
→ remap/generate target breakpoint
→ layout repair loop
→ review gate
→ handoff release
```

Promotion rules:

- no generation without source truth;
- no repair without valid target shell + responsive plan;
- no handoff without review verdict;
- generated artifacts never become source truth unless explicitly merged back.

### 4. Narrow `design-repo-router`

Patch:

- Router triggers only for ambiguous/multi-step design requests.
- Add: “Do not use when a specific leaf skill clearly matches.”
- Route E2E requests to `design-workflow`.

## Phase 3 — make shared conventions discoverable

### 5. Wire `design-repo-common` rules into leaves

Problem:

- `design-repo-common/` is not installable and may never load.

Patch:

- Keep it non-installable as shared infrastructure.
- Add explicit references in:
  - `design-workflow`
  - `design-repo-init`
  - `generation-pack-builder`
  - `stitch-adapter`
  - `design-review-gate`
  - `layout-repair-loop`
  - `design-handoff-release`

Examples:

- read `../design-repo-common/references/source-truth-rules.md` before source/generation promotion decisions;
- run `../design-repo-common/scripts/check_design_repo.mjs` before generation/handoff.

### 6. Add legacy migration mapping

Add:

```text
design-repo-common/references/legacy-design-flow-migration.md
```

Mapping:

```text
00-meta/brief.md                         → 00-product/brief.md
00-meta/research.md                      → 00-product/research.md
00-meta/copy-pack.md                     → 02-pages/<page>/content.md or 00-product/workflows.md
00-meta/design-system/base/DESIGN.md     → 01-system/DESIGN.md
00-meta/design-system/themes/*.md        → 01-system/themes/*.md
00-meta/runtime/stitch-project.json      → 04-generated/stitch/project.json or per-page state
03-pages/<page>/brief.md                 → 02-pages/<page>/spec.md
03-pages/<page>/content.md               → 02-pages/<page>/content.md
03-pages/<page>/notes.md                 → 02-pages/<page>/notes.md
03-pages/<page>/critique.md              → 05-review/<page>-review.md
03-pages/<page>/exports/stitch/*         → 04-generated/stitch/<page>/*
```

## Phase 4 — implement v2-native scripts

### 7. Replace or relabel bootstrap scripts

Problem:

- `design_flow_bootstrap_project.mjs` and `design_flow_bootstrap_page.mjs` write old paths.

Patch option A — preferred:

- Rename and port:
  - `design_repo_bootstrap_project.mjs`
  - `design_repo_bootstrap_page.mjs`
- Output v2 structure and `00-product/source-inventory.md`.

Patch option B — temporary:

- Keep old scripts but label as legacy migration helpers only.
- Do not list them as normal v2 init scripts.

### 8. Implement actual generation-pack builder

Problem:

- `generation-pack-builder` is conceptual; no script builds prompt packs from v2 truth.

Patch:

Add:

```text
generation-pack-builder/scripts/build_generation_pack.mjs
```

Inputs:

- `00-product/brief.md`
- `01-system/DESIGN.md`
- `02-pages/<page>/spec.md`
- `02-pages/<page>/content.md` if present
- `02-pages/<page>/states.md` if present
- `02-pages/<page>/responsive-plan.md` for non-primary breakpoints

Outputs:

```text
04-generated/<tool>/<page>/<breakpoint>.prompt.md
04-generated/<tool>/<page>/locks/pre-approval-lock.md
04-generated/<tool>/<page>/locks/copy-lock.md
04-generated/<tool>/<page>/locks/output-lock.md
```

Validation:

- Fail if product/page semantics are missing.
- Fail if required locks are empty.

### 9. Deepen backend capability extraction

Current scripts are stubs.

Patch:

- Expand OpenAPI scanner to extract:
  - schemas
  - auth/security schemes
  - validation errors
  - pagination
  - async/status endpoints
  - destructive actions
- Keep framework-specific scanners in references/scripts, not SKILL.md.
- Output `03-references/backend/capabilities.md` using `api-to-ui-state-map.md`.

## Phase 5 — strengthen safety gates

### 10. Gate external Stitch mutations

Problem:

- Stitch generate/edit/create are external writes.

Patch:

- Require explicit approval or explicit flags for:
  - creating a new Stitch project;
  - generating a new screen;
  - editing an existing screen;
  - exporting from remote service if it triggers mutation.
- Document no secret fallback guessing.
- Credential rule: configured Stitch credential exists, or stop and ask.

### 11. Harden generated HTML rendering

Problem:

- Generated HTML review can run JS/network.

Patch:

- In screenshot/render helpers, block external network requests by default.
- Consider disabling JS for static screenshot review unless interaction is explicitly needed.
- If JS is needed, use isolated context and request interception.
- Document that browser evidence is runtime/visual evidence, not permission to trust generated code.

### 12. Make locks/source evidence hard blockers

Problem:

- Missing locks may currently pass as `null`.

Patch:

- Missing pre-approval/copy/output locks should fail generation/repair unless explicit override.
- Missing responsive plan should block layout repair.
- Missing source truth should block generation.

### 13. Remove or strongly gate `--in-place`

Problem:

- In-place repair can write before review.

Patch:

- Default candidate directory only.
- `--in-place` requires explicit flag + backup + restore on failed review.
- Promotion only after review passes.

## Phase 6 — consistency cleanup

### 14. Fix trigger overlap

- `product-source-reader`: inventory/synthesis only.
- `product-brief-writer`: writes `00-product/brief.md` only.
- `design-direction-brainstorm`: conceptual direction/options.
- `visual-asset-generator`: creates concrete image files/assets after purpose/direction is known.

### 15. Standardize responsive naming

Use only:

```text
02-pages/<page>/responsive-plan.md
```

If pre-generation intent is needed, make it a section inside the same file:

```text
## Intent
## Breakpoint Contracts
## Repair Eligibility
```

### 16. Add missing stop boundaries/output contracts

Patch:

- `layout-repair-loop`: forbid semantic/content changes; require target shell + responsive plan; candidate-first.
- `reference-research`: forbid copying competitors; forbid private/internal browsing without request; references are not source truth.
- `design-review-gate`: explicit verdict/output shape.
- `responsive-plan-writer`: explicit file output.
- `stitch-adapter`: explicit output artifact paths.
- `visual-asset-generator`: explicit asset path + selected/not-selected status.

## Phase 7 — validation and CI-like checks

### 17. Upgrade validator

Extend `validate_skill_pack.py` to check:

- frontmatter parses;
- duplicate skill names;
- SKILL line counts;
- referenced scripts/references exist;
- `node --check` for `.mjs`;
- Python compile for `.py`;
- import smoke tests for `.mjs` where safe;
- grep legacy paths outside allowed migration files;
- no `__pycache__` / `.pyc`;
- script executable bits for script files.

### 18. Add tiny v2 smoke fixture

Add:

```text
tests/fixtures/tiny-design-repo/
```

Contains minimal:

```text
00-product/brief.md
01-system/DESIGN.md
02-pages/dashboard/spec.md
```

Smoke tests:

- check design repo;
- build generation pack;
- run Stitch adapter in dry-run/no-network mode;
- run layout repair in no-op/dry-run mode;
- build artifact index.

## Phase 8 — migration/publish

1. Patch locally.
2. Run validator + smoke tests.
3. Commit and push to private repo.
4. Keep active `design-flow` untouched.
5. Run one real pilot in a disposable repo.
6. Only then migrate selected v2 skills into active workspace.

## Immediate next implementation queue

Do these first:

1. Add `design-workflow/SKILL.md`.
2. Narrow `design-repo-router`.
3. Add stop boundaries/output contracts.
4. Add legacy migration reference.
5. Fix shared import paths with shims or shared helper copy.
6. Upgrade validator to catch broken imports.
7. Decide and port canonical v2 path contract.

## Non-goals for the next patch

- Do not delete legacy `design-flow`.
- Do not install v2 into active OpenClaw skills yet.
- Do not rewrite all Stitch scripts from scratch before path/import safety is fixed.
- Do not add more creative/image skills until the core lane works.
