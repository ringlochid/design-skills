# Design Orchestrator Workflows

Use this WBS reference for large design-repo work. Do not use it when one focused leaf skill plus one proof gate can satisfy the request. Conductors expose deliverable breakdowns; parent/work orchestrator owns packages, dependencies, gates, promotion, and final assembly.

Gate proof rule: each gate names intended check, artifact/screenshot/command inspected, pass/degraded/blocked result, and blocker if proof cannot run. Stitch generate/edit/export are external mutations and require explicit operator approval; without approval, return a blocker instead of calling Stitch.

## New full design

Deliverable: accepted generated design artifacts plus implementation handoff.

WBS phases:
1. `repo_init`: inspect/create repo structure.
2. `source_intake`: read product/backend/reference inputs.
3. `source_truth`: write brief, page spec, design system, responsive assumptions.
4. `generation_pack`: build locks and generation context.
5. `generation`: use approved adapter to create candidate artifact.
6. `primary_review`: review candidate against source and screenshots.
7. `repair_or_remap`: choose source patch, layout repair, or responsive remap from review evidence.
8. `promote_or_stop`: parent promotes accepted artifact after passing review or preserves candidate with blocker/next repair package.
9. `handoff`: index accepted artifacts for implementation.

Package examples:
- `design-init`: `design-repo-init`; gate: valid repo skeleton path.
- `design-source-intake`: source readers; gate: source inventory paths or blocker.
- `design-source-truth`: brief/spec/system writers; gate: required source files exist.
- `design-generation-pack`: `generation-pack-builder`; gate: prompt locks path.
- `design-generate`: approved adapter; gate: explicit Stitch/tool approval plus candidate artifact + screenshot, or blocker.
- `design-primary-review`: `design-review-gate`; gate: screenshot/source/lock verdict.
- `design-repair-plan`: choose one repair lane; gate: one selected lane and reason.
- `design-repair-candidate`: one mutation lane only; gate: candidate + proof.
- `design-repair-review`: `design-review-gate`; gate: pass/fail/blocker.
- `design-promote`: parent-owned promotion; gate: accepted-promoted lifecycle state or preserved candidate stop state.
- `design-handoff`: `design-handoff-release`; gate: accepted-promoted artifact index.

Parallelism: source intake may parallelize by owner; source truth converges before generation; generation/review/repair/promotion/handoff are serial.

Degraded complete output: source truth plus generation blocker, or candidate plus review verdict and next repair package. Do not promote.

## Existing artifact patch

Deliverable: reviewed patch candidate or promoted accepted artifact.

Top-level variants:
- Screenshot feedback patch.
- Missing breakpoint / responsive completion.
- Layout-only repair.
- Semantic/content/theme/source-truth patch.
- Post-acceptance handoff refresh inside a patch lifecycle.

Standalone review-only routes to `design-review-gate`. Standalone accepted-artifact handoff routes to `design-handoff-release`.

Common WBS phases:
1. `classify`: read feedback/source/artifact/review and choose fix lane.
2. `prepare_context`: gather lineage, current artifact, screenshots, runtime state.
3. `patch_candidate`: run exactly one source patch, local artifact patch, Stitch edit/remap, or layout repair lane.
4. `review_candidate`: review candidate evidence.
5. `promote_or_stop`: parent promotes accepted artifact or preserves candidate with stop state.
6. `handoff_refresh`: update handoff only after acceptance.

Package examples:
- `patch-classify`: fix-lane selection; gate: lane + target artifact.
- `patch-source`: `design-source-patcher`; gate: source diff + rebuilt locks.
- `patch-responsive-plan`: `responsive-plan-writer`; gate: target breakpoint plan.
- `patch-remap-candidate`: `stitch-adapter`; gate: explicit Stitch approval plus real breakpoint candidate, or blocker.
- `patch-layout-repair`: `layout-repair-loop` only after real candidate; gate: screenshot proof.
- `patch-review`: `design-review-gate`; gate: pass/fail evidence.
- `patch-promote`: parent-owned promotion; gate: lifecycle state recorded.
- `patch-handoff`: `design-handoff-release`; gate: accepted artifact index.

Parallelism: classification/lineage are serial; do not run source and artifact mutation in parallel on one target; review waits for candidate; promotion is parent-owned.

Degraded complete output: preserved candidate, review verdict, exact missing gate, and next repair package. Do not promote.

## Review-only

Deliverable: verdict and actionable findings, no mutation.

WBS phases:
1. `evidence`: collect artifact paths, screenshots, source truth.
2. `review`: run `design-review-gate`.
3. `recommend`: route to patch workflow only if changes are requested.

Gate: design-review verdict with inspected paths/screenshots, lifecycle state, risks, and blockers.

Degraded complete output: review blocker with missing artifact/screenshot/source paths.

## Handoff refresh

Deliverable: implementation handoff over accepted artifacts only.

WBS phases:
1. `verify_acceptance`: confirm accepted-promoted state.
2. `inventory`: collect page names, source links, breakpoints, screenshots.
3. `handoff`: run `design-handoff-release`.

Gate: accepted artifact state plus handoff index path. No handoff over candidate-only or manual-review-required artifacts.

Degraded complete output: handoff blocker listing missing acceptance/artifact evidence.
