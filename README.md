# Design Skills Bundle

A design-repo-first skill pack for creating, reviewing, patching, and handing off product/page designs with Stitch-backed generation and local browser verification.

This bundle replaces the old monolithic `design-flow` / `design-patch` approach with small skills and one shared support folder.

## Public mental model

Use three entry points:

| User intent | Start here | What happens |
|---|---|---|
| Create a new product/page/screen/flow design | `design-workflow` | Builds source truth, generates artifacts, reviews, fixes, promotes, hands off |
| Patch or refactor an existing generated design | `design-patch-workflow` | Classifies feedback, patches source/artifacts safely, reviews, promotes |
| Review/critique only, no mutation | `design-review-gate` | Audits screenshots/artifacts and returns accept/fix/remap/regenerate verdict |

`design-repo-router` is the front door when the request is ambiguous.

## Core workflow

```text
source truth
  → generation pack + locks
  → Stitch/tool adapter candidate
  → screenshot triplet review
  → fix lanes if needed
  → promotion to accepted root artifacts
  → handoff
```

Important rule: generated candidates are not accepted artifacts. Stitch generate/edit/export writes candidates under `attempts/`; root breakpoint files are accepted only after promotion.

## Design repo layout created by the skills

```text
00-product/                    product brief, source inventory
01-system/                     DESIGN.md, themes, tokens, components
02-pages/<page>/               page spec, content, states, responsive plan
03-references/                 screenshots, research, backend/frontend references
04-generated/stitch/<page>/    accepted human-facing design artifacts
  <breakpoint>.html
  <breakpoint>.png             Stitch canvas screenshot, or explicit degraded fallback
  <breakpoint>.local.png       full-access browser viewport screenshot
  <breakpoint>.local.full.png  full-access browser full-page screenshot
  <breakpoint>.prompt.md
  locks/*.md
  attempts/<label>/            candidate artifacts
  runtime/                     JSON/meta/state/logs/diagnostics
05-review/                     review verdicts
06-handoff/                    final clickable Markdown handoff
```

## Skills

### Routing and workflow

- `design-repo-router` — routes design requests to the smallest correct path.
- `design-workflow` — conductor for new full design runs from source truth to handoff.
- `design-patch-workflow` — conductor for existing generated artifact changes, screenshot feedback, missing/redundant items, refactors, and remaps.

### Source and research

- `product-source-reader` — extracts product intent from ideas, docs, screenshots, architecture notes, and references.
- `backend-capability-reader` — reads backend/API/code capabilities and constraints relevant to UI design.
- `reference-research` — gathers category, competitor, product, or visual references.
- `product-brief-writer` — writes product-level source truth in `00-product/brief.md`.
- `page-spec-writer` — writes page-level contracts: modules, content, states, actions, constraints.
- `design-system-writer` — writes visual system guidance: `01-system/DESIGN.md`, themes, tokens, components.
- `design-direction-brainstorm` — optional divergent visual/product direction exploration before locking the design system.
- `design-source-patcher` — targeted source-truth patching for existing designs; edits only implicated sections, not whole documents.
- `responsive-plan-writer` — writes breakpoint contracts and remap plans for mobile/tablet/desktop.

### Generation and tool adapters

- `generation-pack-builder` — turns source truth into tool-ready prompts, locks, and artifact paths.
- `stitch-adapter` — talks to Stitch: project/session handling, generate/edit/export, reference sync, screenshots, local browser render.
- `visual-asset-generator` — optional asset/moodboard/image generation support; generated assets are references, not source truth.

### Review, repair, and release

- `design-review-gate` — reviews screenshot triplets, locks, product fit, responsive behavior, a11y basics, and implementation feasibility.
- `layout-repair-loop` — fixes layout-only defects in valid generated shells: overflow, overlap, clipping, spacing, density, safe-area.
- `design-handoff-release` — writes the final handoff Markdown with clickable artifact links and embedded screenshot previews.
- `design-repo-init` — bootstraps and validates design repo structure/readiness.

### Shared support

- `design-repo-common/` — required shared references and scripts used by the skills. It is not an installable skill, but the bundle will break without it.

Key shared files:

- `design-repo-common/references/fix-lanes.md` — canonical fix lanes used by full workflow and patch workflow.
- `design-repo-common/references/lifecycle.md` — canonical lifecycle states.
- `design-repo-common/references/review-cycle.md` — bounded review/repair/remap loop.
- `design-repo-common/references/responsive-remap-quality.md` — examples/cautions for mobile↔tablet↔desktop remap quality.
- `design-repo-common/references/artifact-hygiene.md` — where human-facing vs runtime artifacts belong.
- `scripts/check_design_repo.mjs` — structure/handoff/runtime consistency checker.
- `scripts/promote_candidate.mjs` — promotes reviewed candidates to accepted root artifacts.

## Fix lanes

The same lanes are used during a full design run and during later patching:

- `source-fix` — product/page/design-system/responsive truth is wrong or incomplete.
- `copy-content` — visible labels, modules, or redundant wording need edits.
- `theme-style` — visual language, theme, hierarchy, density, or polish needs changes.
- `responsive-remap` — breakpoint structure needs remapping.
- `local-layout` — valid generated shell has layout defects.
- `stitch-edit` — local patching is insufficient; use Stitch edit/remap.
- `review-only` — critique/audit only.
- `fresh-generation` — no valid artifact exists; run full design workflow.

Default rule:

```text
source before artifact → candidate before promotion → review before handoff
```

## Hard vs soft visible labels

The bundle uses one visible-label model. Product/page identity and explicitly marked `Required visible labels` are hard. Inferred modules, modes, filters, chips, card titles, and CTAs are soft: preserve them when practical, but review may accept equivalent wording.

## Review evidence

Every serious generated design should be reviewed using the screenshot triplet:

1. `<breakpoint>.png` — Stitch canvas/API screenshot when available.
2. `<breakpoint>.local.png` — full-access local browser viewport render.
3. `<breakpoint>.local.full.png` — full-access local browser full-page render.

If Stitch canvas screenshots are unavailable, the bundle creates `<breakpoint>.png` from local browser fallback and marks the metadata as degraded / non-release-quality. That makes the missing canvas evidence explicit instead of silently pretending it is normal Stitch evidence.

If export writes a candidate before a visible-label gate fails, keep it as failed evidence under `attempts/`. Root artifacts still change only through promotion.

## Promotion and closure

Candidate artifacts live under:

```text
04-generated/stitch/<page>/attempts/<operation>-<breakpoint>-<timestamp>/
```

Accepted artifacts live at:

```text
04-generated/stitch/<page>/<breakpoint>.html
04-generated/stitch/<page>/<breakpoint>.png
04-generated/stitch/<page>/<breakpoint>.local.png
04-generated/stitch/<page>/<breakpoint>.local.full.png
```

Promotion requires:

- accepted review verdict or `promotion_eligible: true`
- passing pre-approval lock check
- passing copy lock check
- passing post-export required-noun check
- screenshot triplet present and non-tiny
- candidate metadata references the candidate files
- candidate directory is inside that page's `attempts/` folder

Handoff requires matching accepted root artifacts, review, metadata, lifecycle event, and `runtime/state.json` `approved[breakpoint]` entry. Promotion/checker currently operate on the accepted artifact stem passed as the breakpoint; for themed variants use a distinct stem consistently or keep selectable themes inside one breakpoint artifact.

## Dependencies

Runtime:

- Node.js 20+ recommended, with global `fetch` and `WebSocket` available.
- Stitch adapter requires `@google/stitch-sdk` when using real Stitch operations.
- A Chromium-compatible browser is needed for local HTML screenshot/render checks. Set `CHROMIUM_BIN` if the runtime cannot auto-detect one.

Install the Stitch SDK in the target environment, or set `STITCH_SDK_NODE_MODULES` to a directory containing it.

Option A — install beside the active runtime:

```bash
npm install @google/stitch-sdk@0.1.0
```

Option B — keep the skill bundle clean and install dependencies elsewhere:

```bash
npm install --prefix /tmp/design-skills-deps @google/stitch-sdk@0.1.0
export STITCH_SDK_NODE_MODULES=/tmp/design-skills-deps/node_modules
```

`STITCH_SDK_NODE_MODULES` may point to either a `node_modules` directory or a prefix directory that contains `node_modules/`. Do not vendor `node_modules` into the skill bundle.

## Subagent boundaries

Use subagents only for bounded reviews, divergent research, brainstorming, or isolated E2E pilots in temp repos. Brainstorming default: parent alone; 1-2 subagents when direction is ambiguous/important; 3-4 only when explicitly requested or clearly justified. Parent agent owns routing, promotion, final acceptance, and final user summary. Subagents must not commit, push, install into the bundle, modify active skills, or delete outside their assigned repo unless explicitly requested. See `design-repo-common/references/subagent-policy.md`.

## External write policy

Stitch generate/edit are external mutations and require explicit operator approval before use. The skills should read/review freely, but do not create/edit Stitch projects/screens without confirmation.

## Installing into an active OpenClaw workspace

Copy only:

- each skill directory listed above
- `design-repo-common/`
- this `README.md` if useful for humans

Do not copy:

- `.git/`
- `node_modules/`
- generated design repos such as `02-pages/`, `04-generated/`, `05-review/`, `06-handoff/` from this development checkout
- temporary review notes, patch plans, tests, package lockfiles, or scratch files

Recommended staged rollout:

1. Back up active legacy skills `design-flow` and `design-patch`.
2. Install this bundle in parallel.
3. Run one full new-design pilot.
4. Run one existing-artifact patch/refinement pilot.
5. Only then replace or archive the legacy skills.

## Current status

This repository is the clean skill bundle checkout. It intentionally contains only skill directories, required shared support, and this README.
