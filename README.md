# Design Skills Bundle

Design Skills is an OpenClaw skill bundle for creating, reviewing, repairing, and handing off product/page designs in a structured design repository.

It turns messy product intent into source truth, generation packs, Stitch-backed candidates, screenshot-based review, bounded repairs, and implementation-ready handoff artifacts. The bundle is intentionally repo-first: generated screens are evidence until they pass review and are promoted.

## What it can do

- Start a new product/page/screen/flow design from source material.
- Build product briefs, page specs, design-system guidance, responsive plans, and generation packs.
- Use Stitch as a generation/edit/export adapter when approved.
- Review generated artifacts with screenshot evidence before acceptance.
- Patch existing generated designs without restarting the whole workflow.
- Repair layout-only defects when source truth is already valid.
- Produce a final handoff with clickable artifacts and screenshot previews.

## Start here

| User intent | Entry skill | Result |
|---|---|---|
| “Design this product/page/screen from scratch” | `design-workflow` | Full source → generation → review → handoff run |
| “Patch this generated design” | `design-patch-workflow` | Targeted source/artifact repair path |
| “Review this design only” | `design-review-gate` | Accept/fix/remap/regenerate verdict |
| “I’m not sure which path this is” | `design-repo-router` | Smallest correct design lane |

## Core workflow

```text
source truth
  → generation pack and locks
  → Stitch/tool candidate
  → screenshot triplet review
  → fix lane if needed
  → promotion to accepted root artifacts
  → handoff
```

Important rule: generated candidates are not accepted artifacts. Stitch generate/edit/export writes candidates under `attempts/`; root breakpoint files change only after promotion.

## Design repo layout

The skills create and maintain this structure:

```text
00-product/                    product brief and source inventory
01-system/                     DESIGN.md, themes, tokens, components
02-pages/<page>/               page spec, content, states, responsive plan
03-references/                 screenshots, research, backend/frontend references
04-generated/stitch/<page>/    accepted human-facing design artifacts
  <breakpoint>.html
  <breakpoint>.png             Stitch canvas screenshot, or explicit degraded fallback
  <breakpoint>.local.png       local browser viewport screenshot
  <breakpoint>.local.full.png  local browser full-page screenshot
  <breakpoint>.prompt.md
  locks/*.md
  attempts/<label>/            candidate artifacts
  runtime/                     JSON/meta/state/logs/diagnostics
05-review/                     review verdicts
06-handoff/                    final clickable Markdown handoff
```

## Skills map

### Routing and orchestration

| Skill | Purpose |
|---|---|
| `design-repo-router` | Routes ambiguous design requests to the right path. |
| `design-workflow` | Conducts new full design runs from source truth to handoff. |
| `design-patch-workflow` | Conducts targeted fixes for existing generated artifacts. |
| `design-repo-init` | Bootstraps or validates design repo structure. |

### Source truth and planning

| Skill | Purpose |
|---|---|
| `product-source-reader` | Extracts product intent from messy source material. |
| `backend-capability-reader` | Reads APIs, data models, roles, and constraints for UI design. |
| `reference-research` | Gathers category, competitor, and visual references. |
| `product-brief-writer` | Writes `00-product/brief.md`. |
| `page-spec-writer` | Writes page-level contracts for modules, states, actions, and content. |
| `design-system-writer` | Writes themes, tokens, components, and visual guidance. |
| `design-direction-brainstorm` | Explores divergent visual/product directions before locking. |
| `responsive-plan-writer` | Writes breakpoint contracts and remap plans. |
| `design-source-patcher` | Edits implicated source-truth sections during patches. |

### Generation, review, and release

| Skill | Purpose |
|---|---|
| `generation-pack-builder` | Converts source truth into tool-ready prompts, locks, and artifact paths. |
| `stitch-adapter` | Handles Stitch generate/edit/export/reference sync when approved. |
| `visual-asset-generator` | Generates optional reference assets without making them source truth. |
| `design-review-gate` | Reviews screenshot triplets, locks, product fit, responsive behavior, a11y basics, and feasibility. |
| `layout-repair-loop` | Fixes layout-only issues in valid generated shells. |
| `design-handoff-release` | Writes final implementation handoff Markdown. |

`design-repo-common/` contains shared references and scripts. It is required support, but it is not an installable skill.

## Fix lanes

The full workflow and patch workflow use the same repair vocabulary:

- `source-fix` — product/page/design-system/responsive truth is wrong or incomplete.
- `copy-content` — visible labels, modules, wording, or redundant text need edits.
- `theme-style` — visual language, hierarchy, density, theme, or polish needs changes.
- `responsive-remap` — breakpoint structure needs remapping.
- `local-layout` — valid generated shell has layout defects.
- `stitch-edit` — local patching is insufficient; use Stitch edit/remap.
- `review-only` — critique/audit only.
- `fresh-generation` — no valid artifact exists; run the full design workflow.

Default rule:

```text
source before artifact → candidate before promotion → review before handoff
```

## Visible-label model

Product/page identity and explicitly marked `Required visible labels` are hard. Inferred modules, modes, filters, chips, card titles, and CTAs are soft: preserve them when practical, but review may accept equivalent wording.

## Review evidence

Every serious generated design should be reviewed with the screenshot triplet:

1. `<breakpoint>.png` — Stitch canvas/API screenshot when available.
2. `<breakpoint>.local.png` — local browser viewport render.
3. `<breakpoint>.local.full.png` — local browser full-page render.

If Stitch canvas screenshots are unavailable, the bundle creates `<breakpoint>.png` from local fallback and marks the metadata as degraded / non-release-quality. Missing evidence is explicit; it is not silently treated as normal Stitch output.

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

Promotion requires a review-backed candidate, lock checks, required-label checks, screenshot evidence, valid metadata, and an accepted runtime state entry. Handoff requires matching accepted root artifacts, review evidence, metadata, lifecycle event, and `runtime/state.json` approval.

## Design philosophy

- **Source truth is the contract.** Product, page, system, and responsive truth drive generation and patching.
- **Candidates are disposable.** Generated output is useful only after review, repair, and promotion.
- **Screenshots are evidence.** Visual truth comes from captured artifacts, not from inferred layout math alone.
- **Repair paths are bounded.** Patch source when semantics are wrong; patch layout when the shell is valid; regenerate only when needed.
- **Handoff should be boring.** A downstream implementer should get clear links, screenshots, known risks, and no mystery state.

## Dependencies

Runtime:

- Node.js 20+ recommended, with global `fetch` and `WebSocket` available.
- A Chromium-compatible browser for local HTML screenshot/render checks.
- `@google/stitch-sdk` only when using real Stitch operations.

Keep dependencies outside the skill bundle:

```bash
npm install --prefix /tmp/design-skills-deps @google/stitch-sdk@0.1.0
export STITCH_SDK_NODE_MODULES=/tmp/design-skills-deps/node_modules
```

`STITCH_SDK_NODE_MODULES` may point to either a `node_modules` directory or a prefix containing `node_modules/`. Do not vendor `node_modules` into this repo.

## Validation

Useful checks after edits:

```bash
node design-repo-common/scripts/check_design_repo.mjs <design-repo>
```

For bundle-level edits, also inspect skill frontmatter and shared reference paths before installing into an active workspace.

## Installation notes

Copy only:

- each public skill directory listed above
- `design-repo-common/`
- this `README.md` if useful for humans

Do not copy `.git/`, `node_modules/`, generated design repos, temporary review notes, package locks, scratch files, or runtime artifacts.

Recommended staged rollout:

1. Back up active legacy skills if replacing an older bundle.
2. Install this bundle in parallel.
3. Run one full new-design pilot.
4. Run one existing-artifact patch/refinement pilot.
5. Replace or archive legacy skills only after both pilots pass.

## Subagent boundaries

Use subagents for bounded reviews, divergent research, brainstorming, or isolated pilots. Parent agent owns routing, promotion, final acceptance, and user summary. Subagents should not commit, push, install, modify active skills, or delete outside their assigned repo unless explicitly requested.

## External write policy

Stitch generate/edit/export are external mutations. The skills should read and review freely, but they should not create or edit Stitch projects/screens without explicit operator approval.

## Current status

This repository is the clean skill bundle checkout. It intentionally contains only skill directories, required shared support, and this README.
