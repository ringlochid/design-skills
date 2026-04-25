# Local Review Notes

Subagent review was requested but spawning was blocked by a gateway pairing requirement, so this is a local static review only.

## Validation

- `./validate_skill_pack.py` passes.
- 16 installable skills found.
- All `SKILL.md` files are short: 26–41 lines.
- Git working tree clean at review time.

## High priority findings

### 1. Subagent review could not run

Actual independent review is still pending. Gateway returned `pairing required` for subagent/ACP spawns.

Fix: approve/repair gateway pairing, then rerun independent reviewers for safety, simplicity, reliability, compatibility, flexibility, quality, workflow completion, and skill consistency.

### 2. `layout-repair-loop` lacks explicit stop-boundary heading

File: `layout-repair-loop/SKILL.md`

It has eligibility and outcomes, but no explicit `Stop boundary` section. This is the highest-risk workflow because it edits generated/layout artifacts and can accidentally patch symptoms instead of source truth.

Fix: add a stop boundary that forbids semantic/content changes, forbids repair before valid target shell exists, and requires handoff to `responsive-plan-writer` or source writers when contract is wrong.

### 3. `reference-research` lacks explicit stop-boundary heading

File: `reference-research/SKILL.md`

The skill has a good search policy but should explicitly forbid copying competitor designs, browsing private/internal products without request, or treating references as source truth.

Fix: add stop boundary.

## Medium priority findings

### 4. Several skills have weak output contracts

Files:

- `design-repo-router/SKILL.md`
- `design-review-gate/SKILL.md`
- `responsive-plan-writer/SKILL.md`
- `stitch-adapter/SKILL.md`
- `visual-asset-generator/SKILL.md`

They are usable, but output expectations should be more explicit for reliability.

Fix: add compact `Output shape` sections.

### 5. Common scripts are not referenced by leaves

Files:

- `design-repo-common/scripts/check_design_repo.mjs`

They exist, but leaf skills do not consistently instruct when to run them.

Fix: mention common validation in `design-repo-init`, `generation-pack-builder`, `layout-repair-loop`, and `design-handoff-release`.

### 6. Existing migrated scripts may assume old design-flow paths

Files under:

- `stitch-adapter/scripts/`
- `layout-repair-loop/scripts/`
- `design-repo-init/scripts/`

Scripts were copied, not deeply ported. They may still assume old `00-meta/` / `03-pages/.../exports/stitch` paths.

Fix: run a path-compatibility audit and either add adapter flags or compatibility shims.

## Low priority findings

### 7. The pack needs a migration note from old artifact model

Current plan says migrate legacy artifacts, but does not include a concrete mapping table from:

- `00-meta/`
- `03-pages/<page>/exports/stitch/`

into the new:

- `00-product/`
- `01-system/`
- `02-pages/`
- `04-generated/`

Fix: add `design-repo-common/references/legacy-design-flow-migration.md`.

### 8. Router may over-trigger because description is broad

File: `design-repo-router/SKILL.md`

This is expected for a router, but it should stay very strict about routing only.

Fix: keep router as-is unless it starts triggering on non-design tasks.

## Recommended next patch

1. Add stop boundaries to `layout-repair-loop` and `reference-research`.
2. Add output shapes to weak-output skills.
3. Add a legacy migration mapping reference.
4. Add common validation references to init/generation/handoff.
5. Run a script path audit for old `00-meta` and `exports/stitch` assumptions.
