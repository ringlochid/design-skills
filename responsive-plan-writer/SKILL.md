---
name: responsive-plan-writer
description: Write responsive breakpoint contracts and remap plans for a design repo. Use when making/remapping mobile, tablet, or desktop versions, when breakpoint structure is wrong, or before target breakpoint generation/remap.
---

# Responsive Plan Writer

Goal: define target breakpoint behavior before remap or repair.

## Workflow

1. Read page spec, design system, primary generated artifact, and review notes.
2. Define breakpoints and whether each needs structural remap or simple fluid behavior.
3. Specify what must preserve, what may change, and what should not carry over.
4. Write/update `02-pages/<page>/responsive-plan.md`.
5. If tool generation is needed, hand off to `generation-pack-builder` / `stitch-adapter`.

## Key distinction

- `remap`: change layout structure/intent for breakpoint.
- `repair`: fix defects in an already valid target shell.

## Stop boundary

Do not enter layout repair if the target breakpoint does not yet have a valid shell.

## Remap contract

For quality examples and mobile↔desktop cautions, read `../design-repo-common/references/responsive-remap-quality.md` when planning non-primary breakpoints.


Responsive planning is not just breakpoint notes. It must define the remap contract used after the primary breakpoint is reviewed:

- primary breakpoint and why it is source-of-truth
- target breakpoint order
- what content/copy must remain stable
- what layout shell should change per breakpoint
- how the target canvas should avoid sparse, stretched, crammed, or invented layouts
- what must not be repaired locally because it requires remap/regeneration
- primary screen/project lineage once available, so target remap prompts can cite the approved source

Non-primary breakpoint generation should use breakpoint-specific remap guidance, not a generic copy of the primary generation prompt.

## Output shape

For plan structure, use `references/responsive-plan-template.md`.

- `02-pages/<page>/responsive-plan.md` path
- Target breakpoints
- Preserve/remap rules
- Repair eligibility
- Next action

## Shared rules

When promoting, generating, reviewing, repairing, or handing off artifacts, use `../design-repo-common/references/source-truth-rules.md`; use `../design-repo-common/references/tool-policy.md` for web/browser/image-generation placement.

## Remap source

Responsive plans must name the primary breakpoint and remap order. When deriving tablet/desktop from an accepted primary screen, state that the implementation should use runtime Stitch project/screen state as the remap reference, not local HTML resizing.
