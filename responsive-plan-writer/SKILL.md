---
name: responsive-plan-writer
description: Write responsive breakpoint contracts and remap plans for a design repo. Use after primary design review, before target breakpoint generation/remap or layout repair.
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
